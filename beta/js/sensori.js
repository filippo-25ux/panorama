/* Orientis – Sensori, calibrazione, sole.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- Sensori ---------- */
  // Media "morbida" degli angoli, per evitare che i numeri saltino
  function smoothAngle(prev, next, k) {
    if (prev === null) return next;
    const d = ((next - prev + 540) % 360) - 180;
    return (prev + d * k + 360) % 360;
  }

  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      h = e.webkitCompassHeading; // iPhone e iPad
      S.compAcc = (typeof e.webkitCompassAccuracy === 'number') ? e.webkitCompassAccuracy : null;
    } else if (e.absolute === true && typeof e.alpha === 'number') {
      h = (360 - e.alpha) % 360; // Android (meno preciso)
    }
    if (h !== null) S.heading = smoothAngle(S.heading, h, 0.3);
    if (typeof e.beta === 'number') {
      S.oriB = e.beta; S.oriG = typeof e.gamma === 'number' ? e.gamma : 0;   // v40: inclinazione del telefono (fotovoltaico)
      const p = e.beta - 90; // 0 = orizzonte, positivo = verso l'alto
      S.pitch = (S.pitch === null) ? p : S.pitch + (p - S.pitch) * 0.3;
    }
  }

  function onPos(p) {
    S.lat = p.coords.latitude;
    S.lon = p.coords.longitude;
    S.gpsAcc = p.coords.accuracy;
    S.alt = (typeof p.coords.altitude === 'number') ? p.coords.altitude : null;
    S.altAcc = (typeof p.coords.altitudeAccuracy === 'number') ? p.coords.altitudeAccuracy : null;
    S.gpsMsg = null;
    S.declAuto = declAt(S.lat, S.lon);
    checkAlignMoved();
    refreshItems();
    maybeFetch();
    maybeFetchLand();
    tryInitMap();
    demUpdate();
    if (walk.active) walkSample(p.coords);
  }

  // v25: GPS a riposo. Se da 30 s la posizione non si sposta (meno di 10 m, o meno della precisione), il GPS continuo si spegne
  // e si fa una lettura precisa ogni minuto; appena una lettura mostra uno spostamento di oltre 25 m torna continuo.
  const GPS = { watch: null, low: false, timer: null, anchor: null, anchorAt: 0 };
  function gpsStart() {
    if (GPS.timer) { clearInterval(GPS.timer); GPS.timer = null; }
    GPS.low = false;
    if (GPS.watch === null) GPS.watch = navigator.geolocation.watchPosition(gpsOnPos, onPosErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }
  function gpsRest() {
    if (GPS.watch !== null) { navigator.geolocation.clearWatch(GPS.watch); GPS.watch = null; }
    GPS.low = true;
    GPS.timer = setInterval(() => {
      if ($('hud').hidden || camPaused) return;
      navigator.geolocation.getCurrentPosition(gpsOnPos, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    }, 60000);
  }
  function gpsOnPos(p) {
    const c = p.coords, now = Date.now();
    if (!GPS.anchor || geo(GPS.anchor.lat, GPS.anchor.lon, c.latitude, c.longitude).d > Math.max(10, Math.min(c.accuracy || 10, 30))) {
      GPS.anchor = { lat: c.latitude, lon: c.longitude }; GPS.anchorAt = now;
      if (GPS.low && S.lat !== null && geo(S.lat, S.lon, c.latitude, c.longitude).d > 25) gpsStart();
    }
    onPos(p);
  }
  function gpsCheck() {
    const busy = walk.active || align.step || $('hud').hidden;
    if (!GPS.low && !busy && GPS.anchor && Date.now() - GPS.anchorAt > 30000 && S.gpsAcc !== null && S.gpsAcc <= 30) gpsRest();
    else if (GPS.low && busy && !$('hud').hidden) gpsStart();
  }
  window.__panoGps = GPS;
  function onPosErr(err) {
    S.gpsMsg = (err && err.code === 1) ? 'permesso negato' : 'non disponibile';
    statusMsg = 'Senza la posizione non posso cercare i luoghi.';
  }

  function trueHeading() {
    const h0 = (align.step === 'fine' && align.h0 !== null) ? align.h0 : S.heading;
    return (h0 + S.declAuto + S.off + S.alOff + 360) % 360;
  }

  /* ---------- Calibrazione ---------- */
  function toast(msg, ms, undo, btnText) {
    $('toast').classList.remove('ok');
    $('toastBtn').textContent = btnText || 'Annulla';
    $('toastText').textContent = msg;
    $('toastBtn').hidden = !undo;
    undoState = undo || null;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => { $('toast').hidden = true; undoState = null; }, ms);
  }

  function applyCorrection(dOff, dPitch, label) {
    const before = { off: S.off, pitchOff: S.pitchOff };
    S.off = Math.round(norm180(S.off + dOff) * 10) / 10;
    saveSettings();
    refreshSettingsUI();
    toast(label + ': bussola corretta di ' + fmtDeg(Math.round(dOff * 10) / 10) + '.', 8000, () => {
      S.off = before.off;
      saveSettings(); refreshSettingsUI();
      toast('Correzione annullata.', 3000);
    });
  }

  function startWalk() {
    walk.active = true;
    walk.samples = [];
    walk.until = Date.now() + 90000;
    toast('Cammina dritto per qualche passo tenendo il telefono puntato avanti. Misure: 0/6', 0);
  }

  function walkSample(c) {
    if (Date.now() > walk.until) {
      walk.active = false;
      toast('Calibrazione camminando non riuscita: servono almeno 6 misure coerenti.', 6000);
      return;
    }
    const course = c.heading, speed = c.speed;
    if (typeof course !== 'number' || isNaN(course) || typeof speed !== 'number' || speed < 1 || S.heading === null) return;
    walk.samples.push(norm180(course - (S.heading + S.declAuto)));
    if (walk.samples.length < 6) {
      toast('Cammina dritto tenendo il telefono puntato avanti. Misure: ' + walk.samples.length + '/6', 0);
      return;
    }
    let sx = 0, sy = 0;
    for (const a of walk.samples) { sx += Math.cos(a * RAD); sy += Math.sin(a * RAD); }
    const n = walk.samples.length;
    const R = Math.sqrt(sx * sx + sy * sy) / n;
    const spread = Math.sqrt(-2 * Math.log(Math.max(R, 1e-6))) / RAD;
    const mean = Math.atan2(sy, sx) / RAD;
    if (spread > 10) { if (n > 20) walk.samples.shift(); return; }
    walk.active = false;
    applyCorrection(norm180(mean - S.off), 0, 'Camminando');
  }

  /* ---------- Sole: posizione calcolata e rilevamento nell'immagine ---------- */
  const detCanvas = document.createElement('canvas');
  let detCtx = null;

  const SUN_VTOL = 4;      // scarto verticale ammesso tra sole calcolato e sole visto (gradi)
  const sunHist = [];
  function sunCandFail(now) {
    sunHist.length = 0;
    if (sunCand && now - sunCand.t > 1500) sunCand = null;
  }
  // v20: il sole si cerca su una copia del flusso in un video nascosto, così il video visibile non viene mai toccato
  let detVideo = null, detUntil = 0;
  function detSource() {
    const m = $('video');
    if (m.videoWidth) return m;   // v22: il video non è più quello che si vede: si legge direttamente
    const main = m, st = main.srcObject;
    if (!st || !st.getVideoTracks) return null;
    const t = st.getVideoTracks()[0];
    if (!t || t.readyState !== 'live') return null;
    if (detVideo && detVideo.__src === t) return detVideo.videoWidth ? detVideo : null;
    stopDet();
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    v.__src = t; v.__clone = t.clone();
    v.srcObject = new MediaStream([v.__clone]);
    document.body.appendChild(v);
    v.play().catch(() => {});
    detVideo = v;
    return null;   // pronta dal giro dopo
  }
  function stopDet() {
    if (!detVideo) return;
    try { detVideo.__clone.stop(); } catch (e) {}
    detVideo.srcObject = null; detVideo.remove(); detVideo = null;
  }
  function sunAnalyze() {
    if (camPaused || shooting || S.lat === null || S.heading === null || S.pitch === null) { if (Date.now() > detUntil) stopDet(); return; }
    // serve solo se la correzione col sole è accesa o il menù Bussola è aperto
    if (!S.autoSun && $('bmenu').hidden) { if (Date.now() > detUntil) stopDet(); return; }
    const sun = sunPos(new Date(), S.lat, S.lon);
    if (sun.alt < 1) { sunCand = null; if (Date.now() > detUntil) stopDet(); return; }
    {
      const W0 = window.innerWidth, H0 = window.innerHeight;
      const tH = tanVis() * W0 / H0;
      if (Math.abs(norm180(sun.az - trueHeading())) > Math.atan(tH) / RAD + 15) { if (Date.now() > detUntil) stopDet(); return; }
    }
    // con lo zoom del sensore la copia del flusso non è ingrandita: in quel caso niente ricerca
    if (CAM.mode === 'sensore') { stopDet(); return; }
    detUntil = Date.now() + 10000;
    const v = detSource();
    if (!v || !v.videoWidth) return;
    const W = window.innerWidth, H = window.innerHeight;
    const tanV = tanVis(), tanH = tanV * W / H;
    const relSun = norm180(sun.az - trueHeading());
    if (Math.abs(relSun) > Math.atan(tanH) / RAD + 15) return;

    const cw = 96, ch = Math.max(8, Math.round(96 * H / W));
    detCanvas.width = cw; detCanvas.height = ch;
    if (!detCtx) detCtx = detCanvas.getContext('2d', { willReadFrequently: true });
    const k = cw / W;
    const sc = Math.max(W / v.videoWidth, H / v.videoHeight) * CAM.css;
    const dw = v.videoWidth * sc, dh = v.videoHeight * sc;
    try {
      detCtx.drawImage(v, (W - dw) / 2 * k, (H - dh) / 2 * k, dw * k, dh * k);
      const blob = findSun(detCtx.getImageData(0, 0, cw, ch).data, cw, ch);
      if (!blob) { sunCandFail(Date.now()); return; }
      const x = blob.x / k, y = blob.y / k;
      const relImg = Math.atan((x - W / 2) / (W / 2) * tanH) / RAD;
      const elevImg = (S.pitch + S.pitchOff) - Math.atan((y - H / 2) / (H / 2) * tanV) / RAD;
      const dOff = norm180(relSun - relImg);
      const dPitch = sun.alt - elevImg;
      const now = Date.now();
      // L'inclinazione dei sensori è affidabile: un punto chiaro più alto o più basso del sole vero è una nuvola
      if (Math.abs(dOff) > 40 || Math.abs(dPitch) > SUN_VTOL) { sunCandFail(now); return; }
      sunHist.push({ d: dOff, t: now });
      while (sunHist.length && now - sunHist[0].t > 6000) sunHist.shift();   // v20: 5 misure in ~5 s
      if (sunHist.length < 5) return;
      let lo = 1e9, hi = -1e9, sum = 0;
      for (const h of sunHist) { lo = Math.min(lo, h.d); hi = Math.max(hi, h.d); sum += h.d; }
      if (hi - lo > 1.5) { sunCandFail(now); return; }      // il punto salta: niente proposta
      sunCand = { dOff: sum / sunHist.length, dPitch: 0, t: now };
      autoSunFix(sunCand);
    } catch (e) { /* il video non è leggibile: nessun rilevamento */ }
  }

  // v19: col sole netto e fermo la bussola si corregge da sola (solo in questo punto), con avviso e Annulla
  let autoSunAt = 0;
  function autoSunFix(c) {
    if (!S.autoSun || align.step || shooting || Date.now() - autoSunAt < 60000 || S.lat === null) return;
    // v20: sole basso (sotto 10°) = riverberi e foschia: niente correzione automatica
    if (sunPos(new Date(), S.lat, S.lon).alt < 10) return;
    autoSunAt = Date.now();
    sunHist.length = 0;
    const d = Math.round(c.dOff * 10) / 10;
    // scarto grande, o diverso da un allineamento fatto a mano col profilo: si chiede invece di correggere
    if (Math.abs(d) > 8 || (S.alPos && S.alQ !== null && S.alQ <= 2 && Math.abs(d) > 2)) {
      toast('Sole visibile: la bussola sembra sbagliare di ' + fmtDeg(d) + '. Correggo?', 9000, () => {
        S.alOff = norm180(S.alOff + d); S.alPos = { lat: S.lat, lon: S.lon }; S.alQ = 3; saveAlign();
        toast('✓ Bussola corretta col sole (' + fmtDeg(d) + ').', 4000); $('toast').classList.add('ok');
      }, 'Correggi');
      return;
    }
    if (Math.abs(d) < 0.8) {          // già giusta: lo si annota senza disturbare
      if (!S.alPos || S.alQ === null || S.alQ > 3) { S.alPos = { lat: S.lat, lon: S.lon }; S.alQ = 3; saveAlign(); }
      return;
    }
    const prev = { off: S.alOff, q: S.alQ, pos: S.alPos };
    S.alOff = norm180(S.alOff + d); S.alPos = { lat: S.lat, lon: S.lon }; S.alQ = 3;
    saveAlign();
    toast('✓ Bussola corretta col sole (' + fmtDeg(d) + ').', 8000, () => {
      S.alOff = prev.off; S.alQ = prev.q; S.alPos = prev.pos; saveAlign();
      autoSunAt = Date.now() + 9 * 60000;   // per 10 minuti non riprova da sola
      toast('Correzione annullata.', 3000);
    });
    $('toast').classList.add('ok');
  }
