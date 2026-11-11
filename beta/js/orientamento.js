/* Orientis – Ghiera della bussola, allineamento, creste, percorso del sole.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- Ghiera della bussola ---------- */
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Inter", "Segoe UI", Roboto, sans-serif';
  const tape = $('tape'), tctx = tape.getContext('2d');
  const TAPE_H = 30;
  // v23: ghiera a filetti (tacca ogni 2°, filetto lungo ogni 10° con il numero, punti cardinali), tacca centrale gialla
  function drawTape(hd) {
    const W = window.innerWidth, d = window.devicePixelRatio || 1;
    if (tape.width !== Math.round(W * d)) {
      tape.width = Math.round(W * d); tape.height = Math.round(TAPE_H * d);
      tape.style.width = W + 'px'; tape.style.height = TAPE_H + 'px';
    }
    tctx.setTransform(d, 0, 0, d, 0, 0);
    tctx.clearRect(0, 0, W, TAPE_H);
    if (hd === null) return;
    const ppd = 4.75, cx = W / 2, half = cx / ppd + 2;
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    tctx.textAlign = 'center'; tctx.textBaseline = 'top';
    tctx.font = '500 10px ' + FONT;
    tctx.lineCap = 'butt';
    for (let a = Math.ceil((hd - half) / 1) * 1; a <= hd + half; a += 1) {
      const deg = ((a % 360) + 360) % 360;
      const x = cx + (a - hd) * ppd;
      const fade = Math.max(0, Math.min(1, Math.min(x, W - x) / 36));
      if (fade <= 0) continue;
      const card = names[deg] !== undefined;
      const major = deg % 10 === 0, minor = deg % 2 === 0;
      if (!major && !minor && !card) continue;
      tctx.strokeStyle = deg === 0 ? '#ff6b5a' : '#ffffff';
      tctx.globalAlpha = fade * (major || card ? 0.95 : 0.6);
      tctx.lineWidth = major || card ? 1 : 0.6;
      tctx.beginPath(); tctx.moveTo(x, major || card ? 17 : 21); tctx.lineTo(x, 26); tctx.stroke();
      if (card || (major && Math.abs(((deg + 22.5) % 45) - 22.5) > 4)) {
        tctx.fillStyle = deg === 0 ? '#ff6b5a' : '#ffffff';
        tctx.globalAlpha = fade * 0.9;
        tctx.font = (card ? '600 10px ' : '500 10px ') + FONT;
        tctx.fillText(card ? names[deg] : String(deg), x, 3);
      }
    }
    tctx.globalAlpha = 1;
    tctx.strokeStyle = '#ffc928'; tctx.lineWidth = 2; tctx.lineCap = 'round';
    tctx.beginPath(); tctx.moveTo(cx, 14); tctx.lineTo(cx, 28); tctx.stroke();
  }

  /* ---------- Qualità dell'allineamento ---------- */
  const qcol = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d);
  function qualInfo() {
    if (S.alPos && S.alQ !== null) {
      const v = S.alQ;
      return { txt: 'allineata ±' + Math.round(v) + '°', color: v <= 5 ? qcol('--q-good', '#6fe29a') : v <= 12 ? qcol('--q-mid', '#ffb347') : qcol('--q-bad', '#ff6b5a') };
    }
    const bad = S.compAcc !== null && (S.compAcc > 25 || S.compAcc < 0);
    return { txt: 'non allineata', color: bad ? qcol('--q-bad', '#ff6b5a') : null, dot: bad ? qcol('--q-bad', '#ff6b5a') : qcol('--q-none', '#b8c2cc') };
  }
  let lastQ = '';
  function updateQual() {
    const q = qualInfo(), k = q.txt + '|' + q.color;
    if (k === lastQ) return;
    lastQ = k;
    document.querySelector('#qual span').textContent = q.txt;
    document.querySelector('#qual i').style.background = q.color || q.dot || '';
  }

  /* ---------- Allineamento guidato (valido solo per il punto in cui sei) ---------- */
  function saveAlign() {
    try {
      if (S.alPos) localStorage.setItem('pano.align', JSON.stringify({ off: S.alOff, q: S.alQ, lat: S.alPos.lat, lon: S.alPos.lon, t: Date.now() }));
      else localStorage.removeItem('pano.align');
    } catch (e) {}
  }
  (function loadAlign() {
    try {
      const a = JSON.parse(localStorage.getItem('pano.align') || 'null');
      if (a && typeof a.off === 'number' && Date.now() - a.t < 2 * 3600 * 1000) { S.alOff = a.off; S.alQ = (typeof a.q === 'number') ? a.q : null; S.alPos = { lat: a.lat, lon: a.lon }; }
    } catch (e) {}
  })();
  function checkAlignMoved() {
    if (!S.alPos || S.lat === null || align.step) return;
    if (geo(S.lat, S.lon, S.alPos.lat, S.alPos.lon).d > 200) {
      S.alOff = 0; S.alQ = null; S.alPos = null; saveAlign();
      toast('Allineamento azzerato perché ti sei spostato. Rifallo da qui con «Allinea la bussola».', 7000);
    }
  }

  function alCands(excl) {
    const hd = trueHeading(), out = [];
    for (const it of items) {
      if (it.skip || it.d === undefined || LAND_TYPES[it.t] || it.d < 2000 || (it.hid && it.t === 'peak')) continue;
      if (Math.abs(norm180(it.b - hd)) > 60) continue;
      if (excl && (it === excl || Math.abs(norm180(it.b - excl.b)) < 8)) continue;
      out.push(it);
    }
    out.sort((a, b) => b.score - a.score);
    const res = out.slice(0, 7);
    const sun = sunItem();
    if (sun && !(excl && excl.sun)) res.unshift(sun);
    return res;
  }
  function sunItem() {
    if (S.lat === null) return null;
    const s = sunPos(new Date(), S.lat, S.lon);
    if (s.alt < 3 || s.alt > 75) return null;
    return { id: 'sun', n: 'Sole', b: s.az, alt: s.alt, sun: true, score: 1e9 };
  }

  function alChips() {
    const box = $('alChips');
    box.textContent = '';
    align.list.forEach((it, i) => {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'chip' + (align.target === it ? ' on' : ''); c.dataset.i = String(i);
      c.appendChild(document.createTextNode(it.n + ' '));
      const s = document.createElement('i'); s.textContent = it.sun ? 'azimut ' + Math.round(it.b) + '°' : fmtDist(it.d);
      c.appendChild(s);
      box.appendChild(c);
    });
    if (!align.list.length) { const m = document.createElement('span'); m.textContent = 'Nessun luogo adatto in questa direzione: ruota il telefono.'; box.appendChild(m); }
  }

  function alUI(title, text, ok, cancel, mode) {
    $('alTitle').textContent = title;
    $('alText').textContent = text;
    $('alOk').textContent = ok;
    $('alCancel').textContent = cancel;
    const fine = mode === 'fine', ridge = mode === 'ridge';
    $('alLeft').hidden = !(fine || ridge); $('alRight').hidden = !(fine || ridge);
    $('alChips').hidden = fine || ridge || mode === 'intro';
    $('alignLayer').hidden = !(fine || ridge);
    $('alInfo').hidden = !ridge; $('alAlt').hidden = !ridge;
    $('alOk').disabled = (mode === 'pick' || mode === 'verify') && !align.target;
  }

  function alPick() {
    align.step = 'pick'; align.target = null; align.list = alCands(null);
    const sunNote = (align.list[0] && align.list[0].sun) ? ' Il Sole è in cima all’elenco: usa solo lo schermo, non guardarlo a occhio nudo.' : '';
    alUI('Allinea la bussola', 'Guarda un luogo che riconosci davvero (o il Sole) e mettilo al centro del mirino. Poi toccane il nome qui sotto e premi «Allinea qui».' + sunNote, 'Allinea qui', 'Annulla', 'pick');
    alChips();
  }

  function alStart() {
    if (S.heading === null || S.lat === null || (!items.length && !ridgeReady())) { toast('Servono sensori, GPS e luoghi caricati.', 3500); return; }
    alSnapshot();
    document.body.classList.add('aligning');
    $('alignBar').hidden = false;
    alBegin();
  }
  // Col rilievo pronto si allinea sul profilo dei monti; altrimenti su un luogo o sul sole
  function alBegin() { alRidge(); }   // v19: sempre un solo gesto
  function ridgeReady() {
    const P = DEM.prof;
    return !!(S.dem && P && S.lat !== null && geo(P.lat, P.lon, S.lat, S.lon).d < 300);
  }
  function alRidge() {
    align.step = 'ridge'; align.target = null; align.r0 = S.alOff; align.relief = null;
    const rr = ridgeReady();
    alUI('Allinea', 'Trascina col dito a destra o a sinistra finché i nomi cadono sui luoghi' + (rr ? ', o una delle linee azzurre sui monti (la più lontana è la più precisa, se si vede bene)' : '') + '. Se combacia al centro ma non ai lati, allarga o stringi con due dita.', 'Fatto', 'Annulla', 'ridge');
    $('alAlt').textContent = 'Preferisci scegliere un luogo o il sole?';
  }

  function alSnapshot() { align.prev = S.alOff; align.prevQ = S.alQ; align.prevPitch = S.pitchOff; align.prevPos = S.alPos; align.prevFov = S.fov; align.prevFovKind = CAM.kind; }
  function alRestore() {
    S.alOff = align.prev; S.alQ = align.prevQ; S.alPos = align.prevPos; S.pitchOff = align.prevPitch;
    alRestoreFov();
    saveSettings(); refreshSettingsUI(); saveAlign();
  }
  // Campo visivo cambiato con due dita durante l'allineamento: torna com'era
  function alRestoreFov() {
    if (typeof align.prevFov !== 'number' || !align.prevFovKind) return;
    if (S.fovs[align.prevFovKind] === align.prevFov && (CAM.kind !== align.prevFovKind || S.fov === align.prevFov)) return;
    S.fovs[align.prevFovKind] = align.prevFov;
    if (CAM.kind === align.prevFovKind) { S.fov = align.prevFov; if (CAM.kind !== 'tele') applyZoom(dzFor((CAM.zoom = zoomVal()), CAM.kind), true); }
  }
  function setFovLive(f) {
    S.fov = Math.round(Math.min(130, Math.max(8, f)) * 2) / 2;
    S.fovs[CAM.kind] = S.fov;
  }

  function alIntro() {
    alSnapshot();
    align.step = 'intro';
    document.body.classList.add('aligning');
    $('alignBar').hidden = false;
    alUI('Prima di iniziare: allinea la bussola', 'Disegna un «8» in aria con il telefono, poi tocca «Allinea ora» e trascina col dito finché i nomi cadono sui luoghi. Con il sole visibile la bussola si corregge anche da sola.', 'Allinea ora', 'Più tardi', 'intro');
    $('alChips').textContent = '';
  }
  let introDone = false;
  setInterval(() => {
    if (introDone || align.step || $('hud').hidden || tabNow() !== 'guarda') return;   // v34: solo in Guarda
    if (S.heading === null || S.lat === null || !items.length) return;
    introDone = true;
    if (!S.alPos) alIntro();
  }, 1500);

  function alFinish() {
    align.step = null; align.target = null; align.first = null; align.h0 = null;
    document.body.classList.remove('aligning');
    $('alignBar').hidden = true; $('alignLayer').hidden = true;
  }

  $('alignBtn').addEventListener('click', () => { setMenu(false); alStart(); });

  $('alChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    align.target = align.list[Number(c.dataset.i)] || null;
    alChips();
    $('alOk').disabled = !align.target;
  });

  $('alLeft').addEventListener('click', () => { S.alOff = norm180(S.alOff + 1); });
  $('alRight').addEventListener('click', () => { S.alOff = norm180(S.alOff - 1); });

  $('alAlt').addEventListener('click', () => {
    if (align.step !== 'ridge') return;
    S.alOff = align.r0; alRestoreFov();
    alPick();
  });

  $('alCancel').addEventListener('click', () => {
    if (align.step === 'intro') { alFinish(); return; }
    if (align.step === 'verify') { saveAlign(); toast('Allineamento salvato (verifica saltata).', 3500); }
    else { alRestore(); toast('Allineamento annullato.', 2500); }
    alFinish();
  });

  $('alOk').addEventListener('click', () => {
    if (align.step === 'intro') { alBegin(); return; }
    if (align.step === 'ridge') {
      if (CAM.kind !== 'tele') applyZoom(dzFor((CAM.zoom = zoomVal()), CAM.kind), true);
      S.alPos = { lat: S.lat, lon: S.lon }; S.alQ = ridgeReady() ? 2 : 3;
      saveAlign(); saveSettings(); refreshSettingsUI();
      const dFov = S.fov - (typeof align.prevFov === 'number' && align.prevFovKind === CAM.kind ? align.prevFov : S.fov);
      const snap = { off: align.prev, q: align.prevQ, pos: align.prevPos, fov: align.prevFov, kind: align.prevFovKind };
      // v19: esito netto, con Annulla
      toast('✓ Fatto: bussola corretta di ' + fmtDeg(Math.round(norm180(S.alOff - align.r0) * 10) / 10) + (dFov ? ', campo visivo ' + S.fov + '°' : '') + '.', 8000, () => {
        S.alOff = snap.off; S.alQ = snap.q; S.alPos = snap.pos;
        align.prevFov = snap.fov; align.prevFovKind = snap.kind; alRestoreFov();
        saveAlign(); saveSettings(); refreshSettingsUI();
        toast('Correzione annullata.', 3000);
      });
      $('toast').classList.add('ok');
      alFinish();
      return;
    }
    if (align.step === 'pick') {
      if (!align.target) return;
      const rel = norm180(align.target.b - trueHeading());
      S.alOff = norm180(S.alOff + rel);
      S.alPos = { lat: S.lat, lon: S.lon };
      S.alQ = align.target.sun ? 3 : 6;
      align.first = align.target; align.h0 = S.heading; align.step = 'fine';
      alUI('Rifinisci', 'Tieni fermo il telefono. Trascina il dito a destra o a sinistra finché l’etichetta evidenziata coincide con il luogo vero (oppure usa i pulsanti da 1°). Poi premi «Fatto».', 'Fatto', 'Annulla', 'fine');
    } else if (align.step === 'fine') {
      const moved = Math.abs(norm180(S.heading - align.h0));
      if (moved > 6) { alRestore(); toast('Hai mosso il telefono durante la rifinitura: riprova tenendolo fermo.', 5000); alFinish(); return; }
      align.h0 = null; align.step = 'verify'; align.target = null;
      align.list = alCands(align.first);
      alUI('Verifica', 'Ora inquadra un altro luogo che riconosci, in una direzione diversa, mettilo al centro e toccane il nome. Se vuoi puoi saltare.', 'Verifica', 'Salta verifica', 'verify');
      alChips();
    } else if (align.step === 'verify') {
      if (!align.target) return;
      const rel = norm180(align.target.b - trueHeading());
      const r = Math.round(Math.abs(rel) * 10) / 10;
      if (Math.abs(rel) <= 5) {
        S.alOff = norm180(S.alOff + rel / 2);
        S.alQ = Math.max(2, Math.ceil(r) + 1);
        saveAlign();
        toast('Allineata ✓ Scarto sul secondo luogo: ' + r + '°.', 6000);
      } else {
        S.alQ = 15;
        saveAlign();
        toast('Scarto di ' + r + '° sul secondo luogo: qui la bussola è disturbata (metallo, cemento armato). Spostati o riprova.', 9000);
      }
      alFinish();
    }
    if (align.step === 'fine') saveAlign();
  });

  // Un dito: sposta di lato (direzione). Due dita (solo col profilo): allarga o stringi (campo visivo) e sposta.
  let alDrag = null, alPinch = null;
  const alPtr = new Map();
  const alLayer = $('alignLayer');
  const alPpd = () => { const W = window.innerWidth, H = window.innerHeight; return (W / 2) / (tanVis() * W / H) * RAD; };
  function alTwo() { const v = [...alPtr.values()]; return { d: Math.max(20, Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y)), cx: (v[0].x + v[1].x) / 2 }; }
  alLayer.addEventListener('pointerdown', (e) => {
    if (align.step !== 'fine' && align.step !== 'ridge') return;
    alPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { alLayer.setPointerCapture(e.pointerId); } catch (err) {}
    if (alPtr.size === 2 && align.step === 'ridge') {
      const t = alTwo();
      alDrag = null; alPinch = { d0: t.d, cx0: t.cx, tan0: Math.tan(S.fov * RAD / 2), off0: S.alOff };
    } else if (alPtr.size === 1) alDrag = { x: e.clientX, base: S.alOff };
  });
  alLayer.addEventListener('pointermove', (e) => {
    if (!alPtr.has(e.pointerId)) return;
    alPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (alPinch && alPtr.size >= 2) {
      const t = alTwo();
      setFovLive(2 * Math.atan(alPinch.tan0 / (t.d / alPinch.d0)) / RAD);
      S.alOff = norm180(alPinch.off0 - (t.cx - alPinch.cx0) / alPpd());
    } else if (alDrag) {
      S.alOff = norm180(alDrag.base - (e.clientX - alDrag.x) / alPpd());
    }
  });
  const alEnd = (e) => {
    alPtr.delete(e.pointerId);
    if (alPinch && alPtr.size < 2) {
      alPinch = null;
      if (CAM.kind !== 'tele') applyZoom(dzFor((CAM.zoom = zoomVal()), CAM.kind), true);
      refreshSettingsUI();
    }
    if (alPtr.size === 1) { const v = [...alPtr.values()][0]; alDrag = { x: v.x, base: S.alOff }; } else if (!alPtr.size) alDrag = null;
  };
  alLayer.addEventListener('pointerup', alEnd);
  alLayer.addEventListener('pointercancel', alEnd);

  /* ---------- Linea delle creste (profilo dell'orizzonte calcolato dal rilievo) ---------- */
  const ridgeCv = $('ridge'), ridgeCtx = ridgeCv.getContext('2d');
  let ridgeDrawn = false;
  function profAlt(P, az) {
    const f = ((az % 360) + 360) % 360 / DEM_STEP, a0 = Math.floor(f) % P.nA, a1 = (a0 + 1) % P.nA, w = f - Math.floor(f);
    const h0 = P.hz[a0], h1 = P.hz[a1];
    if (h0 < -45 || h1 < -45) return null;
    return h0 * (1 - w) + h1 * w;
  }
  // Livello k del profilo (0 vicino, 1 medio, 2 lontano) nella direzione az, con la distanza della cresta
  function profLvl(P, az, k) {
    const f = ((az % 360) + 360) % 360 / DEM_STEP, a0 = Math.floor(f) % P.nA, a1 = (a0 + 1) % P.nA, w = f - Math.floor(f);
    const h0 = P.hzL[k * P.nA + a0], h1 = P.hzL[k * P.nA + a1];
    if (h0 < -45 || h1 < -45) return null;
    return { alt: h0 * (1 - w) + h1 * w, d: w < 0.5 ? P.hzLD[k * P.nA + a0] : P.hzLD[k * P.nA + a1] };
  }
  function fmtKm(m) { return m < 9500 ? (Math.round(m / 100) / 10).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 1000) + ' km'; }
  // v29: tre livelli di creste, dal più vicino (più marcato) al più lontano (più chiaro), ognuno con la sua distanza.
  // Una linea più lontana si disegna solo dove sporge sopra quella più vicina (altrimenti coinciderebbero).
  const RIDGE_ALPHA = [1, 0.72, 0.48];
  let ridgeLabels = [], ridgeAvoid = [];   // ridgeAvoid: nomi e colonne di tasti già sullo schermo
  function drawRidge(W, H, heading, pitch, tanH, tanV) {
    const P = DEM.prof, aligning = align.step === 'ridge';
    if (!(aligning || (S.ridge && ridgeReady())) || !P || !P.hzL || heading === null || pitch === null) {
      if (ridgeDrawn) { ridgeCtx.setTransform(1, 0, 0, 1, 0, 0); ridgeCtx.clearRect(0, 0, ridgeCv.width, ridgeCv.height); ridgeDrawn = false; ridgeLabels = []; }
      return;
    }
    const d = window.devicePixelRatio || 1;
    if (ridgeCv.width !== Math.round(W * d) || ridgeCv.height !== Math.round(H * d)) { ridgeCv.width = Math.round(W * d); ridgeCv.height = Math.round(H * d); ridgeCv.style.width = W + 'px'; ridgeCv.style.height = H + 'px'; }
    ridgeCtx.setTransform(d, 0, 0, d, 0, 0);
    ridgeCtx.clearRect(0, 0, W, H);
    ridgeDrawn = true;
    const segD = [];           // per ogni segmento: livello, punti e distanze delle creste (per scrivere la distanza)
    const cur = [null, null, null], curD = [null, null, null];
    let lo = 90, hi = -90;
    for (let x = 0; x <= W + 2; x += 3) {
      const rel = Math.atan((x - W / 2) / (W / 2) * tanH) / RAD;
      let prev = null;
      for (let k = 0; k < 3; k++) {
        const q = profLvl(P, heading + rel, k);
        if (q === null) { cur[k] = null; continue; }
        if (k === 2) { lo = Math.min(lo, q.alt); hi = Math.max(hi, q.alt); }
        const gap = prev === null ? 1 : q.alt - prev;
        // niente linea dove la cresta «vera» non c'è: il punto più alto è proprio al limite del livello (il pendio continua oltre);
        // si confronta sempre con l'ultima linea disegnata davanti
        if (gap < 0.04 || (k < 2 && q.d > P.LV[k] * 0.96)) { cur[k] = null; continue; }
        prev = q.alt;
        const y = H / 2 + Math.tan((pitch - q.alt) * RAD) / tanV * H / 2;
        // un salto di distanza (es. da una cresta vicina a una vetta lontana che sporge) apre un nuovo tratto, con la sua distanza
        if (cur[k] && curD[k].d.length) {
          const ld = curD[k].d[curD[k].d.length - 1];
          if (Math.abs(q.d - ld) > Math.max(600, 0.3 * Math.min(q.d, ld))) {
            const px = cur[k][cur[k].length - 2], py = cur[k][cur[k].length - 1];
            cur[k] = [px, py]; curD[k] = { k: k, p: cur[k], d: [] }; segD.push(curD[k]);
          }
        }
        if (!cur[k]) { cur[k] = []; curD[k] = { k: k, p: cur[k], d: [] }; segD.push(curD[k]); }
        cur[k].push(x, y); curD[k].d.push(q.d);
      }
    }
    ridgeCtx.lineJoin = 'round'; ridgeCtx.lineCap = 'round';
    // intensità secondo la distanza vera del tratto: vicino marcato, lontano più chiaro
    for (const sg of segD) { const dd = sg.d.slice().sort((a, b) => a - b); sg.dm = dd[dd.length >> 1] || 0; sg.c = sg.dm < 6000 ? 0 : sg.dm < 15000 ? 1 : 2; }
    // v32: vicina a tratti lunghi, media a tratti corti, lontana a puntini (bozza B); ombra scura sotto lo stesso tratteggio
    // v33: linee continue (scelta finale: bozza A), più sottili e più chiare man mano che si allontanano
    const DASH = [[], [], []], WID = [1.6, 1.35, 1.15], ALPHA = [0.92, 0.72, 0.55];
    for (const c of [2, 1, 0]) {
      const k = aligning ? 1.6 : 1;
      ridgeCtx.globalAlpha = aligning ? Math.min(1, ALPHA[c] + 0.1) : ALPHA[c];
      ridgeCtx.setLineDash(DASH[c].map((v) => v * (aligning ? 1.3 : 1)));
      ridgeCtx.lineCap = 'round';
      for (const pass of [0, 1]) {
        ridgeCtx.strokeStyle = pass ? (aligning ? qcol('--accent', '#8fd3ff') : '#ffffff') : 'rgba(0,0,0,0.32)';
        ridgeCtx.lineWidth = WID[c] * k + (pass ? 0 : 1.4);
        for (const sg of segD) {
          if (sg.c !== c || sg.p.length < 4) continue;
          ridgeCtx.beginPath(); ridgeCtx.moveTo(sg.p[0], sg.p[1]);
          for (let i = 2; i < sg.p.length; i += 2) ridgeCtx.lineTo(sg.p[i], sg.p[i + 1]);
          ridgeCtx.stroke();
        }
      }
    }
    ridgeCtx.lineCap = 'round';
    ridgeCtx.setLineDash([]);
    // Distanze scritte sulle linee: una per tratto abbastanza lungo (i più lunghi prima), senza ripetere distanze simili né sovrapporle
    ridgeLabels = [];
    ridgeCtx.font = '600 11.5px -apple-system, system-ui, sans-serif';
    ridgeCtx.textAlign = 'center'; ridgeCtx.textBaseline = 'middle';
    segD.sort((a, b) => b.d.length - a.d.length);
    for (const sg of segD) {
      if (ridgeLabels.length >= 4 || sg.d.length * 3 < 45) continue;
      const dd = sg.d.slice().sort((a, b) => a - b), dm = dd[dd.length >> 1];
      if (!(dm > 0) || ridgeLabels.some((r) => Math.abs(r.d - dm) < Math.max(400, dm * 0.15))) continue;
      // punto del tratto dentro i margini che non copra nomi, tasti o altre distanze
      const txt = fmtKm(dm), tw = ridgeCtx.measureText(txt).width + 14;
      const idx = [];
      for (let i = 0; i < sg.p.length; i += 2) {
        const x = sg.p[i], y = sg.p[i + 1];
        if (x >= 30 && x <= W - 30 && y >= 40 && y <= H - 40) idx.push(i);
      }
      // prima il centro del tratto (es. la cima di una vetta che sporge), poi via via verso i bordi
      const mid = (sg.p.length >> 2) << 1;
      idx.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
      const free = (lx, ly) => !ridgeLabels.some((r) => Math.abs(r.x - lx) < (r.w + tw) / 2 + 4 && Math.abs(r.y - ly) < 20) &&
        !ridgeAvoid.some((r) => lx + tw / 2 > r.l - 4 && lx - tw / 2 < r.r + 4 && ly + 9 > r.t - 4 && ly - 9 < r.b + 4);
      let lx = null, ly = null;
      for (let n = 0; n < idx.length && lx === null; n += 2) {
        const x = sg.p[idx[n]], y = sg.p[idx[n] + 1];
        if (free(x, y - 15)) { lx = x; ly = y - 15; } else if (free(x, y + 15)) { lx = x; ly = y + 15; }
      }
      if (lx === null) continue;
      ridgeLabels.push({ k: sg.k, c: sg.c, x: lx, y: ly, w: tw, d: dm, txt: txt });
      // v32: distanza scritta in bianco con un leggero bordo scuro, senza pastiglia (bozza A)
      ridgeCtx.globalAlpha = aligning ? 1 : [1, 0.9, 0.8][sg.c];
      ridgeCtx.lineJoin = 'round'; ridgeCtx.lineWidth = 3; ridgeCtx.strokeStyle = 'rgba(0,0,0,0.45)';
      ridgeCtx.strokeText(txt, lx, ly + 0.5);
      ridgeCtx.fillStyle = '#ffffff';
      ridgeCtx.fillText(txt, lx, ly + 0.5);
    }
    ridgeCtx.globalAlpha = 1;
    if (!aligning) return;
    align.relief = hi >= lo ? hi - lo : 0;
    const corr = Math.round(norm180(S.alOff - align.r0) * 10) / 10;
    setText('alInfo', 'Correzione ' + fmtDeg(corr) + ' · campo visivo ' + String(S.fov).replace('.', ',') + '°' +
      (align.relief < 1 ? ' · qui le creste sono quasi piatte: meglio un luogo o il sole' : ''));
  }
  window.__panoRidge = () => ridgeLabels;
  window.__pano = { S: S, items: () => items, trueHeading: trueHeading, align: align, sunPos: sunPos, dem: () => DEM };

  /* ---------- Percorso del sole ---------- */
  const sunUI = { on: false, date: null };
  let sunCache = null;
  const SUN_H0 = -0.833; // sole a filo d'orizzonte (raggio solare + rifrazione)
  const dayNoon = (y, m, d) => new Date(y, m, d, 12, 0, 0);
  const fmtTime = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  function sunDayData() {
    const b = sunUI.date;
    const P = (S.dem && DEM.prof) ? DEM.prof : null;
    const key = b.getFullYear() + '-' + b.getMonth() + '-' + b.getDate() + '|' + S.lat.toFixed(2) + ',' + S.lon.toFixed(2) + '|' + (P ? DEM.gen : 0);
    if (sunCache && sunCache.key === key) return sunCache;
    const start = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 0, 0, 0).getTime();
    const pts = [];
    let prev = null, rise = null, set = null, maxAlt = -90;
    let pv = null, rRise = null, rSet = null, seen = false;
    for (let k = 0; k <= 1440; k++) {
      const t = start + k * 60000, s = sunPos(new Date(t), S.lat, S.lon);
      if (s.alt > maxAlt) maxAlt = s.alt;
      if (prev) {
        const a0 = prev.alt - SUN_H0, a1 = s.alt - SUN_H0;
        if (a0 < 0 && a1 >= 0 && !rise) { const f = -a0 / (a1 - a0); rise = { t: prev.t + f * 60000, az: (prev.az + norm180(s.az - prev.az) * f + 360) % 360, alt: SUN_H0 }; }
        if (a0 >= 0 && a1 < 0 && !set) { const f = a0 / (a0 - a1); set = { t: prev.t + f * 60000, az: (prev.az + norm180(s.az - prev.az) * f + 360) % 360, alt: SUN_H0 }; }
      }
      // Con il rilievo: di quanto il bordo del sole sta sopra le montagne in quella direzione
      let m = 0;
      if (P) {
        m = sunOverRidge(P, s);
        if (pv) {
          if (pv.m < 0 && m >= 0 && !rRise) { const f = -pv.m / (m - pv.m); rRise = { t: pv.t + f * 60000, az: (pv.az + norm180(s.az - pv.az) * f + 360) % 360, alt: pv.alt + (s.alt - pv.alt) * f }; }
          if (pv.m >= 0 && m < 0) { const f = pv.m / (pv.m - m); rSet = { t: pv.t + f * 60000, az: (pv.az + norm180(s.az - pv.az) * f + 360) % 360, alt: pv.alt + (s.alt - pv.alt) * f }; }
        }
        if (m >= 0) seen = true;
        pv = { t: t, az: s.az, alt: s.alt, m: m };
      }
      if (k % 10 === 0) pts.push({ t: t, az: s.az, alt: s.alt, hid: !!P && m < 0 });
      prev = { t: t, az: s.az, alt: s.alt };
    }
    const arc = [];
    if (rise) arc.push({ t: rise.t, az: rise.az, alt: SUN_H0, hid: !!P });
    for (const p of pts) if ((!rise || p.t > rise.t) && (!set || p.t < set.t) && p.alt > SUN_H0) arc.push(p);
    if (set) arc.push({ t: set.t, az: set.az, alt: SUN_H0, hid: !!P });
    const out = { key: key, arc: arc, rise: rise, set: set, maxAlt: maxAlt, astroRise: rise, astroSet: set, ridge: !!P, hidden: false };
    if (P && rise && set) {
      if (!seen) { out.rise = null; out.set = null; out.hidden = true; }    // il sole non supera mai i monti
      else { out.rise = rRise || rise; out.set = rSet || set; }
    }
    sunCache = out;
    return sunCache;
  }
  // Rifrazione per un'altezza vera h (gradi), formula di Saemundsson
  function refrAt(h) { const x = Math.max(-1, h); return 1.02 / Math.tan((x + 10.3 / (x + 5.11)) * RAD) / 60; }
  // Margine (gradi) tra il bordo superiore del sole e l'orizzonte reale (monti, oppure orizzonte libero)
  function sunOverRidge(P, s) {
    const f = ((s.az % 360) + 360) % 360 / DEM_STEP, a0 = Math.floor(f) % P.nA, a1 = (a0 + 1) % P.nA, w = f - Math.floor(f);
    const hz = P.hz[a0] * (1 - w) + P.hz[a1] * w;
    return Math.min(s.alt - SUN_H0, s.alt + refrAt(s.alt) + 0.267 - hz);   // mai prima dell'alba sull'orizzonte libero
  }

  function sunInfoText(dd) {
    if (dd.hidden) return 'In questa data il sole non supera i monti attorno a te (sull’orizzonte libero: alba ' + fmtTime(dd.astroRise.t) + ', tramonto ' + fmtTime(dd.astroSet.t) + ').';
    if (!dd.rise || !dd.set) return 'In questa data il sole non sorge o non tramonta alla tua latitudine.';
    const late = dd.ridge && (dd.rise.t - dd.astroRise.t > 60000 || dd.astroSet.t - dd.set.t > 60000);
    const extra = late ? ' · senza i monti: alba ' + fmtTime(dd.astroRise.t) + ', tramonto ' + fmtTime(dd.astroSet.t) : (dd.ridge ? ' · nessun monte copre alba e tramonto' : '');
    const mins = Math.round((dd.set.t - dd.rise.t) / 60000);
    return 'Alba ' + fmtTime(dd.rise.t) + ' (' + Math.round(dd.rise.az) + '° ' + DIRS[Math.round(dd.rise.az / 45) % 8] + ') · Tramonto ' + fmtTime(dd.set.t) +
      ' (' + Math.round(dd.set.az) + '° ' + DIRS[Math.round(dd.set.az / 45) % 8] + ') · luce ' + Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min · altezza massima ' + Math.round(dd.maxAlt) + '°' + extra;
  }

  function sunRefreshUI() {
    const d = sunUI.date;
    $('sdDate').textContent = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    $('sdRange').value = String(Math.round((dayNoon(d.getFullYear(), d.getMonth(), d.getDate()) - dayNoon(d.getFullYear(), 0, 1)) / 86400000));
    $('sdInfo').textContent = S.lat === null ? 'Attendo il GPS…' : sunInfoText(sunDayData());
    let line = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    if (S.lat !== null) { const dd = sunDayData(); if (dd.rise && dd.set) line += ' · alba ' + fmtTime(dd.rise.t) + ' · tramonto ' + fmtTime(dd.set.t); }
    $('sunLine').textContent = line;
  }

  function sunSetDate(d) {
    sunUI.date = dayNoon(d.getFullYear(), d.getMonth(), d.getDate());
    sunRefreshUI();
  }

  function sunToday() { const n = new Date(); return dayNoon(n.getFullYear(), n.getMonth(), n.getDate()); }

  function sunToggle(on) {
    sunUI.on = on;
    if (on) sunSetDate(sunToday());          // parte sempre da oggi
    $('sunRow').hidden = !on;
    $('sunLine').hidden = !on;
  }
  $('sdPrev').addEventListener('click', () => { const d = new Date(sunUI.date); d.setDate(d.getDate() - 1); sunSetDate(d); });
  $('sdNext').addEventListener('click', () => { const d = new Date(sunUI.date); d.setDate(d.getDate() + 1); sunSetDate(d); });
  $('sdRange').addEventListener('input', (e) => { sunSetDate(dayNoon(sunUI.date.getFullYear(), 0, 1 + Number(e.target.value))); });
  document.querySelector('#sunRow .sdChips').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sd === 'today') { sunSetDate(sunToday()); return; }
    const p = b.dataset.sd.split('-');
    sunSetDate(dayNoon(sunUI.date.getFullYear(), Number(p[0]) - 1, Number(p[1])));
  });
  setInterval(() => { if (sunUI.on && S.lat !== null) sunRefreshUI(); }, 2000);

  const sunCv = $('sunPath'), sunCtx = sunCv.getContext('2d');
  let sunDrawn = false;
  function drawSunPath(W, H, heading, pitch, tanH, tanV) {
    const d = window.devicePixelRatio || 1;
    if (!sunUI.on || heading === null || pitch === null || S.lat === null) {
      if (sunDrawn) { sunCtx.setTransform(1, 0, 0, 1, 0, 0); sunCtx.clearRect(0, 0, sunCv.width, sunCv.height); sunDrawn = false; }
      return;
    }
    if (sunCv.width !== Math.round(W * d) || sunCv.height !== Math.round(H * d)) { sunCv.width = Math.round(W * d); sunCv.height = Math.round(H * d); sunCv.style.width = W + 'px'; sunCv.style.height = H + 'px'; }
    sunCtx.setTransform(d, 0, 0, d, 0, 0);
    sunCtx.clearRect(0, 0, W, H);
    sunDrawn = true;
    const dd = sunDayData();
    const col = qcol('--sun', '#ffd166');
    const proj = (az, alt) => {
      const rel = norm180(az - heading);
      if (Math.abs(rel) > 80 || Math.abs(pitch - alt) > 80) return null;
      return { x: W / 2 + Math.tan(rel * RAD) / tanH * W / 2, y: H / 2 + Math.tan((pitch - alt) * RAD) / tanV * H / 2 };
    };
    const now = Date.now();
    const isToday = sunUI.date.toDateString() === new Date().toDateString();
    const P = dd.arc.map((a) => ({ a: a, p: proj(a.az, a.alt) }));
    sunCtx.lineCap = 'round'; sunCtx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (let i = 1; i < P.length; i++) {
        const A = P[i - 1], B = P[i];
        if (!A.p || !B.p || Math.abs(A.p.x - B.p.x) > W) continue;
        const past = isToday && B.a.t < now, hid = A.a.hid && B.a.hid;   // tratto dietro i monti: tratteggiato
        sunCtx.globalAlpha = (past ? 0.4 : 1) * (hid ? 0.6 : 1);
        sunCtx.setLineDash(hid ? [2, 7] : []);
        sunCtx.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.55)' : col;
        sunCtx.lineWidth = pass === 0 ? 7 : 3.5;
        sunCtx.beginPath(); sunCtx.moveTo(A.p.x, A.p.y); sunCtx.lineTo(B.p.x, B.p.y); sunCtx.stroke();
      }
    }
    sunCtx.globalAlpha = 1;
    sunCtx.setLineDash([]);
    sunCtx.font = '700 13px -apple-system, system-ui, sans-serif';
    sunCtx.textAlign = 'center'; sunCtx.textBaseline = 'bottom';
    for (const q of P) {
      if (!q.p || new Date(q.a.t).getMinutes() !== 0 || q.a.alt <= SUN_H0 + 0.01 || q.a.hid) continue;
      if (q.p.x < 6 || q.p.x > W - 6) continue;
      sunCtx.beginPath(); sunCtx.arc(q.p.x, q.p.y, 5, 0, 6.2832);
      sunCtx.fillStyle = '#ffffff'; sunCtx.fill(); sunCtx.lineWidth = 2; sunCtx.strokeStyle = '#7a5200'; sunCtx.stroke();
      sunCtx.lineWidth = 3; sunCtx.strokeStyle = 'rgba(0,0,0,0.7)';
      const h = String(new Date(q.a.t).getHours());
      sunCtx.strokeText(h, q.p.x, q.p.y - 9); sunCtx.fillStyle = col; sunCtx.fillText(h, q.p.x, q.p.y - 9);
    }
    for (const [ev, name] of [[dd.rise, 'Alba'], [dd.set, 'Tramonto']]) {
      if (!ev) continue;
      const p = proj(ev.az, ev.alt === undefined ? SUN_H0 : ev.alt);
      if (!p || p.x < 30 || p.x > W - 30) continue;
      sunCtx.beginPath(); sunCtx.moveTo(p.x - 9, p.y + 6); sunCtx.lineTo(p.x + 9, p.y + 6); sunCtx.lineTo(p.x, p.y - 9); sunCtx.closePath();
      sunCtx.fillStyle = col; sunCtx.fill(); sunCtx.lineWidth = 2; sunCtx.strokeStyle = 'rgba(0,0,0,0.7)'; sunCtx.stroke();
      const txt = name + ' ' + fmtTime(ev.t);
      sunCtx.textBaseline = 'top';
      sunCtx.lineWidth = 3; sunCtx.strokeStyle = 'rgba(0,0,0,0.7)';
      sunCtx.strokeText(txt, p.x, p.y + 12); sunCtx.fillStyle = '#ffffff'; sunCtx.fillText(txt, p.x, p.y + 12);
      sunCtx.textBaseline = 'bottom';
    }
  }

  function sunMapUpdate() {
    const on = sunUI.on && S.lat !== null;
    if (!on) {
      if (sunMapKey !== 'off') {
        for (const id of ['sunsweep', 'sunrise', 'sunset']) map.getSource(id).setData({ type: 'FeatureCollection', features: [] });
        sunMapKey = 'off';
        for (const k of ['rise', 'set']) if (sunLbl[k]) { sunLbl[k].marker.remove(); sunLbl[k] = null; }
        $('sunLegend').classList.remove('on');
      }
      return;
    }
    $('sunLegend').classList.add('on');
    sunMapKey = 'on';
    const dd = sunDayData();
    if (!dd.rise || !dd.set) return;
    const mpp = 78271.517 * Math.cos(S.lat * RAD) / Math.pow(2, map.getZoom());
    const c = map.getContainer();
    const R = mpp * Math.max(c.clientWidth, c.clientHeight) * 0.9;
    const line = (az) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[S.lon, S.lat], dest(S.lat, S.lon, az, R)] }, properties: {} });
    map.getSource('sunrise').setData(line(dd.rise.az));
    map.getSource('sunset').setData(line(dd.set.az));
    const ld = mpp * Math.min(c.clientWidth, c.clientHeight) * (full ? 0.2 : 0.3);
    for (const [k, ev, name] of [['rise', dd.rise, 'Alba'], ['set', dd.set, 'Tramonto']]) {
      if (!sunLbl[k]) {
        const el = document.createElement('div');
        el.className = 'sunlbl ' + k;
        sunLbl[k] = { el: el, marker: new window.maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([S.lon, S.lat]).addTo(map) };
      }
      sunLbl[k].el.textContent = name + ' ' + fmtTime(ev.t);
      sunLbl[k].marker.setLngLat(dest(S.lat, S.lon, ev.az, ld));
    }
    map.getSource('sunsweep').setData(sector(S.lat, S.lon, dd.rise.az, dd.set.az > dd.rise.az ? dd.set.az : dd.set.az + 360, R));
  }
  let sunMapKey = null;
  const sunLbl = { rise: null, set: null };
