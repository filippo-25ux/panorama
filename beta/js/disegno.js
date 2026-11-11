/* Orientis – Disegno sul video.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- Disegno ---------- */
  function setText(id, text) {
    if (shownText[id] !== text) {
      shownText[id] = text;
      $(id).textContent = text;
    }
  }

  const DOT_W = 20;   // v23: pallino senza nome
  const kindOf = (t) => (t === 'peak' ? 'peak' : LAND_TYPES[t] ? 'land' : (t === 'river' || t === 'stream') ? 'river' : 'town');
  function makeLabel(it) {
    const pill = document.createElement('div');
    pill.className = 'pill k-' + kindOf(it.t) + (it.t === 'stream' ? ' k-stream' : '');
    pill.dataset.id = String(it.id);
    pill.innerHTML = iconSvg(it.t, 11);
    const tx = document.createElement('span');
    tx.className = 'tx';
    const b = document.createElement('b');
    b.textContent = it.n;
    const i = document.createElement('i');
    i.textContent = subOf(it);
    tx.appendChild(b);
    tx.appendChild(i);
    pill.appendChild(tx);
    const pin = document.createElement('div');
    pin.className = 'pin';
    pin.style.setProperty('--pc', typeColor(it.t));
    $('labels').appendChild(pill);
    $('labels').appendChild(pin);
    pill.style.display = 'flex';
    const w = pill.offsetWidth, h = pill.offsetHeight;
    pill.classList.add('sel');
    const wSel = pill.offsetWidth, hSel = pill.offsetHeight;
    pill.classList.remove('sel');
    pill.style.display = 'none';
    return { pill: pill, pin: pin, sub: i, w: w, h: h, wSel: wSel, hSel: hSel, subText: i.textContent };
  }

  function hideLabel(lab) {
    lab.pill.style.display = 'none';
    lab.pin.style.display = 'none';
  }

  // v23: colonne di filtri e zoom a metà schermo, ma sempre sopra la scheda in basso (che col menù Bussola si allunga)
  function placeColumns(H) {
    const low = (shooting ? $('shotBar') : $('sheet')).getBoundingClientRect().top - 12;
    for (const el of [$('filters'), $('zoom')]) {
      const h = el.offsetHeight;
      if (!h) continue;
      const c = Math.round(Math.max(130 + h / 2, Math.min(H / 2, low - h / 2))) + 'px';
      if (el.style.top !== c) el.style.top = c;
    }
  }
  function frame() {
    const W = window.innerWidth, H = window.innerHeight;
    const heading = (S.heading === null) ? null : trueHeading();
    const pitch = (S.pitch === null) ? null : S.pitch + S.pitchOff;

    drawTape(heading);
    updateQual();
    placeColumns(H);
    if (!full) placeMini();
    else if ($('miniWrap').style.top) { const st = $('miniWrap').style; st.top = st.left = st.width = st.height = ''; }
    if (heading !== null) {
      setText('deg', Math.round(heading) + '°');
      setText('card', DIRS[Math.round(heading / 45) % 8]);
    }

    // Riga con i dati tecnici
    const parts = [];
    parts.push(S.gpsMsg ? 'GPS ' + S.gpsMsg : (S.gpsAcc !== null ? 'GPS ±' + Math.round(S.gpsAcc) + ' m' : 'GPS in attesa'));
    if (S.compAcc !== null && S.compAcc > 25) parts.push('bussola ±' + Math.round(S.compAcc) + '° (poco affidabile: allontanati da metalli e muovi il telefono a 8)');
    else if (S.compAcc !== null && S.compAcc >= 0) parts.push('bussola ±' + Math.round(S.compAcc) + '°');
    else if (S.compAcc !== null) parts.push('bussola da calibrare');
    if (pitch !== null) {
      const t = Math.round(pitch);
      parts.push('inclinazione ' + (t > 0 ? '+' : '') + t + '°');
    }
    if (S.alOff) parts.push('allineamento ' + fmtDeg(Math.round(S.alOff * 10) / 10) + ' (solo qui)');
    if (netNote) parts.push(netNote);
    if (landNote) parts.push(landNote);
    if (peakNote) parts.push(peakNote);
    if (S.dem && DEM.note) parts.push(DEM.note);
    setText('foot', parts.join(' · '));
    setText('here', here);

    const used = {};
    let aim = null;
    const ready = heading !== null && pitch !== null && S.lat !== null && (items.length > 0 || rivers.length > 0);
    const tanV = tanVis(), tanH = tanV * W / H;

    if (ready) {
      const halfH = Math.atan(tanH) / RAD;

      const cand = [];
      for (const it of items) {
        if (it.skip || it.d === undefined || !visible(it)) continue;
        if (it.hid && it.t === 'peak') continue;   // vetta coperta da rilievi più vicini
        const rel = norm180(it.b - heading);
        if (Math.abs(rel) <= halfH + 3) cand.push({ it: it, rel: rel });
      }
      for (const c of riverCands(heading, halfH)) cand.push(c);   // v27: fiumi

      // Il luogo "nel mirino": il più importante entro 5° dal centro, altrimenti il più vicino al centro
      for (const c of cand) {
        if (Math.abs(c.rel) <= 5 && (!aim || Math.abs(aim.rel) > 5 || c.it.score > aim.it.score)) aim = c;
      }
      if (!aim) {
        for (const c of cand) {
          if (!aim || Math.abs(c.rel) < Math.abs(aim.rel)) aim = c;
        }
      }

      // Etichette: prima quella nel mirino, poi le più importanti con il nome, poi le altre solo con l'icona
      cand.sort((a, b) => b.it.score - a.it.score);
      const order = aim ? [aim].concat(cand.filter((c) => c !== aim)) : cand;
      const placed = [];
      const topLimit = document.querySelector('.degpill').getBoundingClientRect().bottom + 8;
      const cols = [];
      for (const el of [$('filters'), $('zoom')]) {   // v23: le etichette non coprono le due colonne di tasti
        const r = el.getBoundingClientRect();
        if (r.height > 0 && getComputedStyle(el).display !== 'none') { const o = { l: r.left - 4, r: r.right + 4, t: r.top - 4, b: r.bottom + 4 }; placed.push(o); cols.push(o); }
      }
      const bottomLimit = (shooting ? $('shotBar') : $('sheet')).getBoundingClientRect().top - 10;
      let names = 0, dots = 0;
      const nNames = DENS[F.dens], maxDots = DOTS[F.dens];
      const nameRects = [], pinXs = [];

      for (const c of order) {
        if (names >= nNames && dots >= maxDots) break;
        const it = c.it;
        const elev = elevOf(it);
        const x = W / 2 + Math.tan(c.rel * RAD) / tanH * W / 2;
        const ay = H / 2 + Math.tan((pitch - elev) * RAD) / tanV * H / 2;
        if (ay > bottomLimit || ay < topLimit + 30) continue;

        // un luogo che cade dietro una colonna di tasti si mostra solo se è quello nel mirino
        if (c !== aim && cols.some((r) => x > r.l && x < r.r && ay > r.t - 40)) continue;
        let lab = pool[it.id];
        if (!lab) lab = pool[it.id] = makeLabel(it);
        const isSel = c === aim || (align.step === 'fine' && align.target === it);
        // v23: un nome che non trova posto non diventa un pallino accanto agli altri nomi
        const modes = isSel ? ['sel', 'dot'] : names < nNames ? ['name'] : ['dot'];
        let got = null;
        for (const m of modes) {
          if (m === 'dot' && dots >= maxDots && !isSel) continue;
          if (m === 'dot' && !isSel && pinXs.some((px) => Math.abs(px - x) < 18)) continue;   // linee troppo vicine
          const lw = m === 'sel' ? lab.wSel : m === 'dot' ? DOT_W : lab.w;
          const lh = m === 'sel' ? lab.hSel : m === 'dot' ? DOT_W : lab.h;
          const left = Math.min(Math.max(x - lw / 2, 6), W - lw - 6);
          const lanes = m === 'dot' ? 1 : 12;
          for (let lane = 0; lane < lanes; lane++) {
            const t = ay - 10 - lh - lane * (lh + 4);
            if (t < topLimit) break;
            let clash = false;
            for (const r of placed) {
              if (left < r.r && left + lw > r.l && t < r.b && t + lh > r.t) { clash = true; break; }
            }
            // un pallino non sta a ridosso di un nome: almeno 14 px di aria
            if (!clash && m === 'dot') for (const r of nameRects) {
              if (left < r.r + 14 && left + lw > r.l - 14 && t < r.b + 14 && t + lh > r.t - 14) { clash = true; break; }
            }
            if (!clash) { got = { m: m, left: left, top: t, w: lw, h: lh }; break; }
          }
          if (got) break;
        }
        if (!got) continue;
        if (got.m === 'dot') dots++; else { names++; nameRects.push({ l: got.left, r: got.left + got.w, t: got.top, b: got.top + got.h }); }
        pinXs.push(x);

        placed.push({ l: got.left - 2, r: got.left + got.w + 2, t: got.top - 2, b: got.top + got.h + 2 });
        used[it.id] = true;

        const subText = subOf(it);
        if (lab.subText !== subText) { lab.subText = subText; lab.sub.textContent = subText; }
        lab.pill.classList.toggle('sel', got.m === 'sel');
        lab.pill.classList.toggle('dot', got.m === 'dot');
        lab.pill.style.display = 'flex';
        lab.pill.style.left = got.left + 'px';
        lab.pill.style.top = got.top + 'px';
        lab.pin.style.display = 'block';
        lab.pin.style.left = x + 'px';
        lab.pin.style.top = (got.top + got.h) + 'px';
        lab.pin.style.height = Math.max(0, ay - got.top - got.h) + 'px';
        lab.cur = { m: got.m, left: got.left, top: got.top, w: got.w, h: got.h, x: x, ay: ay, n: it.n, sub: subText, t: it.t };
      }
      ridgeAvoid = placed;
    }

    for (const id in pool) {
      if (!used[id]) hideLabel(pool[id]);
    }
    frame.used = used;

    // Marcatore del sole
    const mark = $('sunMark');
    let sunShown = false;
    if (heading !== null && pitch !== null && S.lat !== null) {
      const sun = sunPos(new Date(), S.lat, S.lon);
      if (sun.alt > -1) {
        const rel = norm180(sun.az - heading);
        if (Math.abs(rel) < 85 && Math.abs(pitch - sun.alt) < 85) {
          const sx = W / 2 + Math.tan(rel * RAD) / tanH * W / 2;
          const sy = H / 2 + Math.tan((pitch - sun.alt) * RAD) / tanV * H / 2;
          if (sx > -20 && sx < W + 20 && sy > 100 && sy < H - 150) {
            mark.style.display = 'block';
            mark.style.left = sx + 'px';
            mark.style.top = sy + 'px';
            sunShown = true;
          }
        }
      }
    }
    if (!sunShown) mark.style.display = 'none';
    drawSunPath(W, H, heading, pitch, tanH, tanV);
    drawRidge(W, H, heading, pitch, tanH, tanV);
    VIEW = { W: W, H: H, heading: heading, pitch: pitch, tanH: tanH, tanV: tanV };

    // Orizzonte geometrico (0°) calcolato con accelerometro e giroscopio
    const hz = $('horizon');
    if (align.step && pitch !== null) {
      const hy = H / 2 + Math.tan(pitch * RAD) / tanV * H / 2;
      const ok = hy > 0 && hy < H;
      hz.classList.toggle('on', ok);
      if (ok) hz.style.top = Math.round(hy) + 'px';
    } else hz.classList.remove('on');

    // Scheda in basso e pulsanti di calibrazione
    if (heading === null || S.pitch === null) {
      setText('aimName', 'Sensori non attivi');
      setText('aimInfo', 'Controlla il permesso ai sensori di movimento.');
    } else if (aim) {
      let info = subOf(aim.it) + ' · ' + Math.round(aim.it.b) + '° ' + DIRS[Math.round(aim.it.b / 45) % 8];
      if (Math.abs(aim.rel) > 1.5) {
        info += ', ' + (aim.rel > 0 ? 'più a destra di ' : 'più a sinistra di ') + Math.round(Math.abs(aim.rel)) + '°';
      }
      setText('aimName', aim.it.n);
      setText('aimInfo', info);
    } else {
      setText('aimName', 'Punta verso un paese');
      setText('aimInfo', statusMsg);
    }
    const canCal = !!(aim && Math.abs(aim.rel) <= 30);
    $('calib').hidden = !canCal;
    $('calibNone').hidden = canCal;
    if (aim) setText('calibQ', 'Al centro c\'è ' + aim.it.n + '?');
    const sunOk = sunCand && Date.now() - sunCand.t < 2000;
    $('sunBtn').hidden = !sunOk;
    $('compBtn').classList.toggle('sunready', !!sunOk);
    updateCompState();
    if ($('sheet').classList.contains('open')) updateSpot(heading, pitch);
    if (sunOk) setText('sunSub', 'Il sole è ben visibile: tocca per correggere la bussola di ' + fmtDeg(Math.round(sunCand.dOff * 10) / 10));
    const aid = aim ? aim.it.id : null;
    if (aid !== aimId) { aimId = aid; refreshMarkerClasses(); }
    frame.aim = aim;
    ptFrame();
  }
  // v20: il disegno parte da qui. Massimo 30 volte al secondo; se il telefono è fermo, 4 volte al secondo.
  let lastDraw = 0, lastKey = '', lastHP = '', lastMoveAt = Date.now();
  const phoneStill = () => Date.now() - lastMoveAt > 1500;   // v25: telefono fermo da 1,5 s
  function tick(now) {
    if (!camPaused) {
      const hk = S.heading === null ? 'x' : Math.round(trueHeading() * 20);
      const pk = S.pitch === null ? 'x' : Math.round((S.pitch + S.pitchOff) * 20);
      const key = hk + '|' + pk + '|' + S.alOff + '|' + S.off + '|' + selId + '|' + S.fov + '|' + CAM.dz + '|' + window.innerWidth + 'x' + window.innerHeight + '|' + (align.step || '') + '|' + document.body.className;
      const dt = now - lastDraw;
      if (key !== lastKey && hk + '|' + pk !== lastHP) { lastHP = hk + '|' + pk; lastMoveAt = Date.now(); }
      if (dt >= 32 && (key !== lastKey || dt > 250)) { lastDraw = now; lastKey = key; frame(); }
    }
    requestAnimationFrame(tick);
  }
