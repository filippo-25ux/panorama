/* Orientis – Fotocamera disegnata dall'app, pausa per la batteria, avvio.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- v22: la fotocamera la disegna l'app ---------- */
  const camCv = $('camCv'), camCtx = camCv.getContext('2d', { alpha: false });
  let camDrawOn = false, lastCamDraw = 0, lastCamPaint = 0;
  function camDraw() {
    lastCamDraw = Date.now();
    const v = $('video');
    // v24: col pannello aperto (copre tutto) la fotocamera resta accesa ma non si ridisegna
    if (camHidden()) { nextCamDraw(); return; }
    // v25: telefono fermo → l'immagine si ridisegna 15 volte al secondo invece di 30 (si salta un fotogramma su due)
    if (!camPaused && phoneStill() && !shooting && lastCamDraw - lastCamPaint < 60) { nextCamDraw(); return; }
    if (!camPaused && v.videoWidth && !v.classList.contains('switching')) {
      lastCamPaint = lastCamDraw;
      const W = window.innerWidth, H = window.innerHeight;
      const r = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.round(W * r), ch = Math.round(H * r);
      if (camCv.width !== cw || camCv.height !== ch) { camCv.width = cw; camCv.height = ch; }
      // come «object-fit: cover» più l'ingrandimento digitale dello zoom
      const sc = Math.max(W / v.videoWidth, H / v.videoHeight) * CAM.css;
      const sw = W / sc, sh = H / sc;
      try { camCtx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, cw, ch); } catch (e) {}
    } else if (v.classList.contains('switching') || camPaused) {
      camCtx.fillStyle = '#000'; camCtx.fillRect(0, 0, camCv.width, camCv.height);
    }
    nextCamDraw();
  }
  function nextCamDraw() {
    const v = $('video');
    if (typeof v.requestVideoFrameCallback === 'function' && v.videoWidth && !camPaused && !camHidden()) v.requestVideoFrameCallback(camDraw);
    else setTimeout(camDraw, camPaused || camHidden() ? 500 : 50);
  }
  // se Safari smette di avvisare dei fotogrammi nuovi (cambio di flusso), si riparte
  setInterval(() => { if (camDrawOn && Date.now() - lastCamDraw > 1500) nextCamDraw(); }, 1000);
  function startCamDraw() { if (!camDrawOn) { camDrawOn = true; nextCamDraw(); } }
  function sheetIsOpen() { return $('sheet').classList.contains('open'); }
  // v30: fotocamera non visibile (pannello aperto o un'altra sezione): resta accesa 15 s, poi si spegne
  function camHidden() { return sheetIsOpen() || tabNow() !== 'guarda'; }

  /* ---------- v20: pausa automatica per risparmiare batteria ---------- */
  // Telefono rivolto a terra (o al cielo) per 10 s (v25; prima 20 s): fotocamera spenta. Si riprende alzandolo o toccando lo schermo.
  let camPaused = false, oddSince = 0, okSince = 0;
  let pausedBySheet = false, sheetSince = 0;
  function pauseCam(quiet) {
    if (camPaused) return;
    camPaused = true; pausedBySheet = !!quiet;
    stopDet();
    const st = $('video').srcObject;
    if (st && st.getTracks) st.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    if (!quiet) $('pauseNote').hidden = false;
  }
  function resumeCam() {
    if (!camPaused) return;
    camPaused = false; oddSince = 0; pausedBySheet = false;
    $('pauseNote').hidden = true;
    startCamera().then(() => { camDrawOn = false; startCamDraw(); }).catch(() => {});
  }
  $('pauseNote').addEventListener('click', resumeCam);
  setInterval(() => {
    if ($('hud').hidden) return;
    // v24: pannello aperto per più di 15 secondi → fotocamera spenta; si riaccende chiudendo il pannello
    const nowS = Date.now();
    if (camHidden() && !shooting) {
      sheetSince = sheetSince || nowS;
      if (!camPaused && nowS - sheetSince > 15000) pauseCam(true);
      return;
    }
    sheetSince = 0;
    if (camPaused && pausedBySheet) { resumeCam(); return; }
    if (S.pitch === null) return;
    const p = S.pitch + S.pitchOff, now = Date.now();
    const odd = p < -60 || p > 75;
    if (camPaused) {
      if (!odd) { okSince = okSince || now; if (now - okSince > 800) resumeCam(); } else okSince = 0;
      return;
    }
    okSince = 0;
    const busy = shooting || align.step || !$('gal').hidden || !$('edit').hidden || $('sheet').classList.contains('open') || full;
    if (odd && !busy) { oddSince = oddSince || now; if (now - oddSince > 10000) pauseCam(); } else oddSince = 0;
  }, 1000);

  /* ---------- Avvio ---------- */
  // v25: animazione della pagina iniziale (circa 5 s) con requestAnimationFrame e attributi SVG; sempre visibile, anche con «Riduci movimento» (scelta dell'utente)
  (function introAnim() {
    const q = (sel) => document.querySelector('#start ' + sel);
    const hills = [q('.o-l1'), q('.o-l2'), q('.o-l3'), q('.o-l4')], rivG = q('.o-riv'), rivP = q('.o-river'), rivGd = q('.o-rivGuide'), sun = q('.o-sun'), line = q('.o-draw'), dot = q('.lg-sun');
    if (!line || !sun) return;
    const L = line.getTotalLength ? Math.ceil(line.getTotalLength()) + 2 : 640;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    // v28: il fiume è una forma piena che si allarga dalla valle (1 px) verso chi guarda (5 px): punti lungo la linea guida e le due sponde
    const RV = [];
    if (rivGd && rivGd.getTotalLength) {
      const L = rivGd.getTotalLength(), N = 90;
      for (let k = 0; k <= N; k++) {
        const a = rivGd.getPointAtLength(L * k / N), b = rivGd.getPointAtLength(Math.min(L, L * k / N + 0.5)), c = rivGd.getPointAtLength(Math.max(0, L * k / N - 0.5));
        let dx = b.x - c.x, dy = b.y - c.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
        const w = (1 + 4.2 * Math.pow(k / N, 1.3)) / 2;
        RV.push([a.x - dy * w, a.y + dx * w, a.x + dy * w, a.y - dx * w]);
      }
    }
    function rivShape(f) {
      const n = Math.round((RV.length - 1) * f);
      if (n < 1) return '';
      let d = 'M' + RV[0][0].toFixed(1) + ' ' + RV[0][1].toFixed(1);
      for (let k = 1; k <= n; k++) d += 'L' + RV[k][0].toFixed(1) + ' ' + RV[k][1].toFixed(1);
      for (let k = n; k >= 0; k--) d += 'L' + RV[k][2].toFixed(1) + ' ' + RV[k][3].toFixed(1);
      return d + 'Z';
    }
    const seg = (t, d, dur) => Math.max(0, Math.min(1, (t - d) / dur));
    function frame(t) {
      hills.forEach((g, i) => { if (g) g.setAttribute('transform', 'translate(0 ' + (40 * (1 - ease(seg(t, i * 200, 1600)))).toFixed(2) + ')'); });
      // v28: il fiume «entra» da sinistra dentro la valle mentre sale la terza collina
      if (rivG) rivG.setAttribute('transform', 'translate(0 ' + (40 * (1 - ease(seg(t, 200, 1600)))).toFixed(2) + ')');
      // v28: il fiume scende a S dalla valle tra le due cime verso chi guarda; tre tratti sovrapposti sempre più larghi lo fanno sembrare più vicino
      if (rivP && RV.length) rivP.setAttribute('d', rivShape(ease(seg(t, 1500, 2600))));
      const ks = seg(t, 400, 3000);
      sun.setAttribute('transform', 'translate(0 ' + (70 * (1 - ease(ks))).toFixed(2) + ')');
      sun.setAttribute('opacity', Math.min(1, ks / 0.3).toFixed(3));
      const kl = seg(t, 1200, 3200);
      if (kl < 1) { line.setAttribute('stroke-dasharray', L + ' ' + L); line.setAttribute('stroke-dashoffset', (L * (1 - ease(kl))).toFixed(1)); }
      else { line.setAttribute('stroke-dasharray', '4 4'); line.setAttribute('stroke-dashoffset', '0'); }
      // il punto del logo: nel gruppo capovolto del logo +y va verso l'alto, quindi parte da −100 (sotto la linea di base)
      if (dot) dot.setAttribute('transform', 'translate(0 ' + (-100 * (1 - ease(seg(t, 3900, 1100)))).toFixed(1) + ')');
    }
    frame(0);
    let t0 = null;
    function step(now) {
      if (t0 === null) t0 = now;
      const t = now - t0;
      frame(t);
      if (t < 5200 && !$('start').hidden) requestAnimationFrame(step); else frame(1e9);
    }
    requestAnimationFrame(step);
  })();
  // v23: pagine «Come funziona» facoltative: si scorrono di lato, Avvia da qualunque pagina
  (function onboarding() {
    const tr = $('obTrack');
    const goPage = (n) => tr.scrollTo({ left: n * tr.clientWidth, behavior: 'smooth' });
    $('obHow').addEventListener('click', () => goPage(1));
    tr.querySelectorAll('.obBack').forEach((b, i) => b.addEventListener('click', () => goPage(i)));
    tr.querySelectorAll('.obSkip').forEach((b) => b.addEventListener('click', () => goPage(0)));
    tr.querySelectorAll('.obGo').forEach((b) => b.addEventListener('click', () => { goPage(0); startApp(); }));
  })();
  $('go').addEventListener('click', () => startApp());
  async function startApp() {
    const btn = $('go');
    if (btn.disabled) return;
    const msg = $('msg');
    btn.disabled = true;
    msg.textContent = '';

    try {
      // 1. Sensori di movimento: la richiesta deve partire subito dopo il tocco
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') {
          throw new Error('Permesso ai sensori di movimento negato. Chiudi del tutto il browser, riapri la pagina e premi di nuovo Avvia.');
        }
      }
      window.addEventListener('deviceorientation', onOrient, true);
      window.addEventListener('deviceorientationabsolute', onOrient, true);

      // 2. Fotocamera posteriore
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Questo browser non può usare la fotocamera. La pagina deve essere aperta con un indirizzo https.');
      }
      await startCamera();
      startCamDraw();
      setInterval(checkCamera, 3000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { setTimeout(checkCamera, 300); }
      });

      // 3. Posizione
      if (navigator.geolocation) {
        gpsStart();
        setInterval(gpsCheck, 5000);
      } else {
        S.gpsMsg = 'non disponibile';
      }
      setInterval(maybeFetch, 4000);
      setInterval(maybeFetchLand, 4000);
      setInterval(maybeFetchRiver, 4000);   // v27: fiumi
      setInterval(maybeFetchStream, 4000);   // v28: torrenti (solo se accesi)
      setInterval(sunAnalyze, 1000);   // v20: una volta al secondo, solo quando serve
      loadMapLib(tryInitMap);
      setInterval(() => { if (!camPaused || tabNow() === 'mappa') updateMap(); }, 400);   // v20: meno spesso; v30: sempre nella Mappa

      $('start').hidden = true;
      $('hud').hidden = false;
      $('tabs').hidden = false;
      document.body.classList.add('tabs');
      setTab(START_TAB);
      // v31: la fotocamera serviva solo per il permesso: se non si parte da Guarda si spegne subito (si riaccende entrando in Guarda)
      setTimeout(() => { if (tabNow() !== 'guarda' && !camPaused) pauseCam(true); }, 800);
      if (F.sun) sunToggle(true);
      if (fovWasReset) { saveSettings(); setTimeout(() => toast('Campo visivo riportato ai valori di partenza (era stato tarato sull\'immagine piccola).', 6000), 1500); }
      if (pitchWasReset !== null) toast('Inclinazione azzerata (era ' + fmtDeg(Math.round(pitchWasReset * 10) / 10) + '): ora viene solo dai sensori del telefono.', 7000);
      requestAnimationFrame(tick);
      // v17: dispositivi senza bussola o senza fotocamera posteriore (es. PC): messaggio chiaro invece di una schermata ferma
      setTimeout(() => {
        const noComp = S.heading === null;
        const backCam = CAM.names.some((n) => n && n !== 'senza nome' && !/front|anterior|frontal|facetime|desk|scrivania|selfie|webcam|integrat|built-in/i.test(n));
        const noBack = CAM.names.length > 0 && CAM.names.every((n) => n && n !== 'senza nome') && !backCam;
        if (noComp || noBack) devNote(noComp, noBack);
      }, 3500);
    } catch (err) {
      msg.textContent = (err && err.name === 'NotAllowedError')
        ? 'Permesso negato. Concedi fotocamera e sensori, poi riprova.'
        : (err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError'))
        ? 'Questo dispositivo non ha una fotocamera utilizzabile: Orientis funziona su telefono (o tablet) con fotocamera posteriore e bussola.'
        : (err && err.message) || 'Qualcosa è andato storto.';
      btn.disabled = false;
    }
  }
