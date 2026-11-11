/* Orientis – Impostazioni (pulsanti), menù bussola, punto di ripresa, scatto, memoria e disegno delle foto, galleria, modifica.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- Impostazioni: pulsanti ---------- */
  function refreshSettingsUI() {
    $('vFov').textContent = S.fov + '°';
    $('fovLens').textContent = LENS_NAME[CAM.kind];
    $('camInfo').textContent = 'Obiettivo in uso: ' + LENS_NAME[CAM.kind] +
      (CAM.kind !== 'tele' && CAM.zoom !== 1 ? ', zoom ' + zoomLabel(CAM.zk) + ' (' + CAM.mode + (CAM.dz > 1 ? ' ' + zoomName(Math.round(CAM.dz * 100) / 100) : '') + ')' : '') +
      '. Il campo visivo si tara separatamente per ogni obiettivo. Fotocamere trovate: ' + (CAM.names.length ? CAM.names.join('; ') : '–') + '.';
    $('vOff').textContent = fmtDeg(Math.round(S.off * 10) / 10);
    $('autoSun').checked = S.autoSun !== false;
    $('catLayer').checked = !!S.catLayer;
    $('declInfo').textContent = 'Declinazione magnetica: ' + fmtDeg(Math.round(S.declAuto * 10) / 10) + ' (calcolata dalla tua posizione). Inclinazione: misurata dai sensori del telefono (accelerometro e giroscopio).';
    const th = window.panoTheme ? window.panoTheme.get() : 'auto';
    document.querySelectorAll('#segT button').forEach((b) => { b.classList.toggle('on', b.dataset.th === th); });
    document.querySelectorAll('#segR button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.r) === S.radius);
    });
    document.querySelectorAll('#segD button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.dn) === F.dens);
    });
    const st = { town: F.town, peak: F.peak, river: F.river, stream: F.stream, land: S.land, sun: F.sun, dem: S.dem, ridge: S.ridge };
    demStateUI();
    refreshRiverUI();
    document.querySelectorAll('[data-f]').forEach((el) => {
      if (el.type === 'checkbox') el.checked = st[el.dataset.f];
      else el.setAttribute('aria-pressed', String(st[el.dataset.f]));
    });
  }

  // Accende o spegne un tipo di luogo (stessa scelta per i pulsanti rotondi e per il pannello)
  function setFilter(k, v) {
    if (k === 'town') F.town = v;
    if (k === 'peak') F.peak = v;
    if (k === 'river') { F.river = v; if (v) { retryRiverAt = 0; maybeFetchRiver(); maybeFetchStream(); } riverMapUpdate(); }
    if (k === 'stream') { F.stream = v; if (v) { retryStreamAt = 0; if (!F.river) setFilter('river', true); maybeFetchStream(); } riverData++; buildRivers(); riverMapUpdate(); }
    if (k === 'sun') { F.sun = v; sunToggle(v); }
    if (k === 'dem') { S.dem = v; DEM.retryAt = 0; demApply(); demUpdate(); syncMarkers(); }
    if (k === 'ridge') S.ridge = v;
    if (k === 'land') {
      S.land = v; retryLandAt = 0;
      if (!v) landNote = '';
      builtFor = null; refreshItems(); maybeFetchLand();
    }
    syncMarkers();
    saveSettings();
    refreshSettingsUI();
  }
  document.querySelectorAll('.flt').forEach((b) => {
    b.innerHTML = iconSvg(b.dataset.f === 'town' ? 'town' : b.dataset.f === 'land' ? 'church' : b.dataset.f, 15);
    b.addEventListener('click', () => setFilter(b.dataset.f, b.getAttribute('aria-pressed') !== 'true'));
  });
  document.querySelectorAll('.swi').forEach((el) => { el.outerHTML = iconSvg(el.dataset.t, 16); });
  document.querySelectorAll('#more input[data-f]').forEach((el) => {
    el.addEventListener('change', () => setFilter(el.dataset.f, el.checked));
  });

  // Pannello: si apre toccando la maniglia o trascinando in su, si chiude trascinando in giù
  function setSheet(open) {
    if (open && !$('bmenu').hidden) setMenu(false);
    $('sheet').classList.toggle('open', open);
    document.body.classList.toggle('sheetopen', open);
    $('grab').setAttribute('aria-expanded', String(open));
    if (!open) $('sheet').scrollTop = 0;
    refreshSettingsUI();
    if (!open) setTimeout(() => { if (map) { map.resize(); updateMap(); } }, 300);
    if (!open && camPaused && pausedBySheet && tabNow() === 'guarda') resumeCam();
    if (!open && tabNow() === 'guarda') showTapHint();
  }
  $('grab').addEventListener('click', () => setSheet(!$('sheet').classList.contains('open')));
  // v24: toccando la scheda (nome e dati) si apre il pannello
  document.querySelector('.peek').addEventListener('click', () => { if (!$('sheet').classList.contains('open')) setSheet(true); });
  let sheetY = null;
  $('sheet').addEventListener('touchstart', (e) => { sheetY = e.touches[0].clientY; }, { passive: true });
  $('sheet').addEventListener('touchend', (e) => {
    if (sheetY === null) return;
    const dy = e.changedTouches[0].clientY - sheetY;
    sheetY = null;
    const open = $('sheet').classList.contains('open');
    if (!open && dy < -40) setSheet(true);
    else if (open && dy > 50 && $('sheet').scrollTop <= 0) setSheet(false);
  }, { passive: true });

  $('more').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k === 'cam') { startCamera().catch(() => {}); return; }
    if (b.dataset.k === 'walk') { startWalk(); return; }
    if (b.dataset.k === 'zero') { S.off = 0; S.pitchOff = 0; S.alOff = 0; S.alPos = null; S.alQ = null; saveAlign(); toast('Taratura azzerata.', 3000); }
    if (b.dataset.th) { window.panoTheme.set(b.dataset.th); refreshSettingsUI(); return; }
    if (b.dataset.dn) F.dens = Number(b.dataset.dn);
    if (b.dataset.r) { S.radius = Number(b.dataset.r); retryAt = 0; retryLandAt = 0; refreshItems(); maybeFetch(); maybeFetchLand(); }
    if (b.dataset.k === 'fov') {
      S.fov = Math.min(130, Math.max(8, S.fov + Number(b.dataset.d))); S.fovs[CAM.kind] = S.fov;
      if (CAM.kind !== 'tele') applyZoom(dzFor((CAM.zoom = zoomVal()), CAM.kind), true);
    }
    if (b.dataset.k === 'off') S.off = Math.min(180, Math.max(-180, S.off + Number(b.dataset.d)));
    saveSettings();
    refreshSettingsUI();
  });

  $('calib').addEventListener('click', () => {
    const aim = frame.aim;
    if (!aim || Math.abs(aim.rel) > 30) return;
    setMenu(false);
    applyCorrection(aim.rel, 0, aim.it.n);
  });
  $('sunBtn').addEventListener('click', () => {
    if (!sunCand) return;
    const c = sunCand; sunCand = null;
    setMenu(false);
    applyCorrection(c.dOff, c.dPitch, 'Sole');
  });
  $('walkBtn').addEventListener('click', () => { setMenu(false); startWalk(); });
  $('advBtn').addEventListener('click', () => {
    setMenu(false); setSheet(true);
    setTimeout(() => { const h = $('advSec'); const sh = $('sheet'); sh.scrollTop = h.offsetTop - 12; }, 300);
  });
  $('autoSun').addEventListener('change', (e) => { S.autoSun = e.target.checked; saveSettings(); lastCompState = ''; });

  /* ---------- Menù della bussola ---------- */
  // Il menù della bussola prende il posto delle informazioni nel pannello: l'immagine resta libera
  function setMenu(open) {
    if (open) setSheet(false);
    $('bmenu').hidden = !open;
    $('sheet').classList.toggle('compmode', open);
    document.body.classList.toggle('compmode', open);
    $('compBtn').setAttribute('aria-expanded', String(open));
  }
  $('compBtn').addEventListener('click', () => setMenu($('bmenu').hidden));
  $('bmClose').addEventListener('click', () => setMenu(false));
  let lastCompState = '';
  let lastAlignBtn = null;
  function updateCompState() {
    const rr = ridgeReady();
    if (rr !== lastAlignBtn) {
      lastAlignBtn = rr;
      $('alignBtnS').textContent = rr ? 'trascina i nomi o la linea dei monti' : 'trascina i nomi sul paesaggio';
    }
    const an = S.autoSun ? 'Col sole visibile si corregge da sola.' : 'Correzione automatica col sole spenta (Avanzate).';
    if ($('autoNote').textContent !== an) { $('autoNote').textContent = an; $('autoNote').parentNode.classList.toggle('off', !S.autoSun); }
    const q = qualInfo();
    const bad = S.compAcc !== null && (S.compAcc > 25 || S.compAcc < 0);
    const txt = (S.alPos && S.alQ !== null) ? (S.alQ <= 4 ? 'Bussola precisa ±' : 'Bussola corretta ±') + Math.round(S.alQ) + '° in questo punto'
      : bad ? 'Da controllare: la bussola è disturbata. Disegna un 8 e allinea.'
      : 'Da controllare: qui la bussola può sbagliare di qualche grado. Basta un gesto.';
    const col = q.color || q.dot || '';
    const k = txt + '|' + col;
    if (k === lastCompState) return;
    lastCompState = k;
    $('fig8').hidden = !bad;
    $('bmState').textContent = txt;
    $('bmDot').style.background = col;
    $('compDot').style.background = col;
    $('compBtn').setAttribute('aria-label', 'Bussola: ' + txt);
  }
  $('toastBtn').addEventListener('click', () => { if (undoState) undoState(); });

  /* ---------- Punto di ripresa ---------- */
  const DIRN = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];

  function fmtCoord(lat, lon) {
    const f = (v) => Math.abs(v).toLocaleString('it-IT', { minimumFractionDigits: 5, maximumFractionDigits: 5 }) + '°';
    return f(lat) + (lat >= 0 ? ' N' : ' S') + ', ' + f(lon) + (lon >= 0 ? ' E' : ' O');
  }
  function fmtWhen(t) {
    return new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function dirText(h) { return (Math.round(h) % 360) + '° ' + DIRS[Math.round(h / 45) % 8]; }
  // «Marina di Camerota» se sei in paese, altrimenti «2,3 km a nord-est di …»
  function placeText() {
    const n = nearPlace;
    if (!n || n.d === undefined || S.lat === null) return '';
    if (n.d <= 500) return n.n;
    return fmtDist(n.d) + ' a ' + DIRN[Math.round(geo(n.lat, n.lon, S.lat, S.lon).b / 45) % 8] + ' di ' + n.n;
  }
  function placeShort() {
    const n = nearPlace;
    if (!n || n.d === undefined) return '';
    return n.d <= 500 ? n.n : (n.d <= 5000 ? 'vicino a ' + n.n : '');
  }
  function spotData() {
    return {
      lat: S.lat, lon: S.lon, alt: S.alt, altAcc: S.altAcc, gpsAcc: S.gpsAcc,
      place: placeText(), placeShort: placeShort(),
      heading: S.heading === null ? null : trueHeading(),
      pitch: S.pitch === null ? null : S.pitch + S.pitchOff,
      ground: S.dem && DEM.ground !== null ? Math.round(DEM.ground) : null, dem: !!(S.dem && DEM.prof),
      comune: COM.cur ? COM.cur.n : null, prov: COM.cur ? COM.cur.p : null, istat: COM.cur ? COM.cur.i : null,
      catasto: CAT.cur && COM.cur && CAT.cur.c === COM.cur.k ? Object.assign({ edge: !!CAT.edge }, CAT.cur) : null,
      aligned: !!S.alPos, lens: CAM.kind, zoom: zoomLabel(CAM.kind === 'tele' ? 'T' : CAM.zk), fov: S.fov, dz: CAM.dz
    };
  }
  let spotLast = 0;
  function updateSpot(heading, pitch) {
    const now = Date.now();
    if (now - spotLast < 500) return;
    spotLast = now;
    setText('spPlace', S.lat === null ? 'in attesa del GPS' : (placeText() || '–'));
    setText('spCom', comuneText());
    setText('spCat', catastoText());
    setText('spAlt', S.alt === null ? 'non disponibile' : Math.round(S.alt) + ' m s.l.m.' + (S.altAcc ? ' (±' + Math.round(S.altAcc) + ' m)' : ''));
    setText('spGround', !S.dem ? 'rilievo spento' : DEM.ground === null ? (DEM.state === 'err' ? 'non disponibile' : 'in caricamento…') : '≈ ' + Math.round(DEM.ground) + ' m s.l.m.');
    setText('spCoord', S.lat === null ? '–' : fmtCoord(S.lat, S.lon));
    setText('spAcc', S.gpsAcc === null ? '–' : '±' + Math.round(S.gpsAcc) + ' m');
    setText('spTime', fmtWhen(now));
    setText('spDir', heading === null ? '–' : dirText(heading) + (pitch !== null ? ', inclinazione ' + (Math.round(pitch) > 0 ? '+' : '') + Math.round(pitch) + '°' : ''));
  }
  $('spCopy').addEventListener('click', async () => {
    if (S.lat === null) return;
    const txt = S.lat.toFixed(6) + ', ' + S.lon.toFixed(6);
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = txt; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e2) { ok = false; }
    }
    toast(ok ? 'Coordinate copiate: ' + txt : 'Copia non riuscita. Coordinate: ' + txt, 4000);
  });

  /* ---------- Scatto a tutto schermo ---------- */
  let shooting = false;
  function setShooting(on) {
    const was = shooting;
    shooting = on;
    if (on) { setSheet(false); setMenu(false); }
    if (S.shotHi && was !== on) startCamera(CAM.kind);   // passa a 4K entrando, torna a Full HD uscendo
    document.body.classList.toggle('shooting', on);
    $('shotTop').hidden = !on;
    $('shotBar').hidden = !on;
    refreshShotNames();
  }
  function refreshShotHi() {
    $('shotHi').setAttribute('aria-pressed', String(S.shotHi));
    $('shotHi').querySelector('span').textContent = S.shotHi ? 'Qualità alta (4K)' : 'Qualità normale';
  }
  $('shotHi').addEventListener('click', () => {
    S.shotHi = !S.shotHi; saveSettings(); refreshShotHi();
    startCamera(CAM.kind);
    toast(S.shotHi ? 'Qualità alta: foto più grandi, la fotocamera può metterci un attimo.' : 'Qualità normale.', 2500);
  });
  function refreshShotNames() {
    refreshShotHi();
    $('shotNames').setAttribute('aria-pressed', String(S.shotNames));
    $('shotNames').querySelector('span').textContent = S.shotNames ? 'Nomi sì' : 'Nomi no';
    document.body.classList.toggle('nonames', !S.shotNames);
  }
  $('shotBtn').addEventListener('click', () => setShooting(true));
  $('shotClose').addEventListener('click', () => setShooting(false));
  $('shotNames').addEventListener('click', () => { S.shotNames = !S.shotNames; saveSettings(); refreshShotNames(); });
  $('shotGo').addEventListener('click', () => { capture(); });
  $('galBtn').addEventListener('click', () => openGallery());
  $('galBtn2').addEventListener('click', () => { setShooting(false); setTab('archivio'); });

  function toBlob(c, q) {
    return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('immagine non creata'))), 'image/jpeg', q || 0.92));
  }
  function makeThumb(src) {
    const f = 240 / Math.max(src.width, src.height);
    const t = document.createElement('canvas');
    t.width = Math.max(1, Math.round(src.width * f)); t.height = Math.max(1, Math.round(src.height * f));
    t.getContext('2d').drawImage(src, 0, 0, t.width, t.height);
    return toBlob(t, 0.8);
  }

  // Scatta: la foto pulita + le etichette visibili (con la loro posizione) + i dati del punto di ripresa.
  // I nomi vengono disegnati sulla foto solo quando la mostri o la condividi: così si possono togliere dopo.
  let capBusy = false;
  async function capture() {
    const v = $('video');
    if (capBusy) return;
    if (!v.videoWidth) { toast('La fotocamera non è ancora pronta.', 2500); return; }
    capBusy = true;
    try {
      const W = window.innerWidth, H = window.innerHeight;
      const sc = Math.max(W / v.videoWidth, H / v.videoHeight) * CAM.css;
      const sw = W / sc, sh = H / sc;
      const sx = (v.videoWidth - sw) / 2, sy = (v.videoHeight - sh) / 2;
      const f = Math.min(1, 4096 / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * f); c.height = Math.round(sh * f);
      c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
      $('flash').classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => $('flash').classList.remove('on')));
      haptic();
      const labels = [];
      const used = frame.used || {};
      for (const id in used) { const L = pool[id] && pool[id].cur; if (L) labels.push(Object.assign({}, L)); }
      const now = Date.now();
      const rec = { id: now, time: now, w: c.width, h: c.height, W0: W, H0: H, labels: labels, meta: spotData(), edit: { names: S.shotNames, rot: 0, crop: null }, tv: 0 };
      const blob = await toBlob(c, 0.92);
      rec.thumb = await (await makeThumb(c)).arrayBuffer();
      await dbPutPhoto(rec, await blob.arrayBuffer());
      imgCache.set(rec.id, c);
      if (galList) galList.unshift(rec); else { try { await galLoad(); } catch (e) {} }
      setThumbs();
      toast('Foto salvata nella galleria.', 1800);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    } catch (e) {
      toast('Foto non salvata: ' + describeError(e), 5000);
    } finally {
      capBusy = false;
    }
  }

  /* ---------- Memoria delle foto (IndexedDB del browser) ---------- */
  let dbP = null;
  function dbOpen() {
    if (!dbP) {
      dbP = new Promise((ok, ko) => {
        if (!window.indexedDB) { ko(new Error('memoria del browser non disponibile')); return; }
        const r = indexedDB.open('panorama-foto', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('img')) d.createObjectStore('img', { keyPath: 'id' });
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error || new Error('memoria del browser non disponibile'));
      }).catch((e) => { dbP = null; throw e; });
    }
    return dbP;
  }
  function dbTx(stores, mode, fn) {
    return dbOpen().then((db) => new Promise((ok, ko) => {
      const tx = db.transaction(stores, mode);
      let out;
      const r = fn(tx);
      if (r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => ok(out);
      tx.onerror = () => ko(tx.error || new Error('errore della memoria'));
      tx.onabort = () => ko(tx.error || new Error('memoria piena?'));
    }));
  }
  const dbAllMeta = () => dbTx(['meta'], 'readonly', (tx) => tx.objectStore('meta').getAll()).then((a) => (a || []).sort((x, y) => y.id - x.id));
  const dbPutPhoto = (rec, buf) => dbTx(['meta', 'img'], 'readwrite', (tx) => { tx.objectStore('img').put({ id: rec.id, buf: buf }); tx.objectStore('meta').put(rec); });
  const dbPutMeta = (rec) => dbTx(['meta'], 'readwrite', (tx) => { tx.objectStore('meta').put(rec); });
  const dbGetImg = (id) => dbTx(['img'], 'readonly', (tx) => tx.objectStore('img').get(id));
  const dbDel = (id) => dbTx(['meta', 'img'], 'readwrite', (tx) => { tx.objectStore('meta').delete(id); tx.objectStore('img').delete(id); });

  const imgCache = new Map();
  async function loadImg(rec) {
    if (imgCache.has(rec.id)) return imgCache.get(rec.id);
    const r = await dbGetImg(rec.id);
    if (!r || !r.buf) throw new Error('immagine mancante');
    const blob = new Blob([r.buf], { type: 'image/jpeg' });
    let img = null;
    if (window.createImageBitmap) { try { img = await createImageBitmap(blob); } catch (e) { img = null; } }
    if (!img) {
      img = await new Promise((ok, ko) => {
        const u = URL.createObjectURL(blob);
        const im = new Image();
        im.onload = () => { ok(im); URL.revokeObjectURL(u); };
        im.onerror = () => ko(new Error('immagine illeggibile'));
        im.src = u;
      });
    }
    imgCache.set(rec.id, img);
    if (imgCache.size > 4) {
      const k = imgCache.keys().next().value;
      if (k !== rec.id) { const o = imgCache.get(k); if (o && o.close) o.close(); imgCache.delete(k); }
    }
    return img;
  }

  /* ---------- Disegno della foto con nomi, raddrizzatura e ritaglio ---------- */
  function circ(cx, cy, r) { return 'M' + (cx - r) + ' ' + cy + ' a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0 Z'; }
  const ICON_OPS = {
    peak: [['s', 'M1.5 12.5 L7 2.5 L12.5 12.5 Z', 1.4]],
    city: [['s', circ(7, 7, 5.4), 1.4], ['f', circ(7, 7, 2.2)]],
    hamlet: [['s', circ(7, 7, 3.4), 1.4]],
    church: [['s', 'M7 1 V3.5 M5.8 2.2 H8.2 M4 13 V6.5 L7 4.5 L10 6.5 V13 Z', 1.3]],
    tower: [['s', 'M4.5 13 V4 H9.5 V13 M4.5 4 V2 M7 4 V2 M9.5 4 V2', 1.3]],
    castle: [['s', 'M1.5 13 V5 H3.5 V3 H5.5 V5 H8.5 V3 H10.5 V5 H12.5 V13 Z', 1.3]],
    stream: [['s', 'M1 7.2 C3 6 4.5 8.4 7 7.2 S11 6 13 7.2', 1.3]],
    river: [['s', 'M1 5 C3 3.8 4.5 6.2 7 5 S11 3.8 13 5 M1 9.5 C3 8.3 4.5 10.7 7 9.5 S11 8.3 13 9.5', 1.3]],
    def: [['s', circ(7, 7, 4.6), 1.5]]
  };
  function drawIcon(ctx, t, cx, cy, size, color) {
    const ops = ICON_OPS[t] || ICON_OPS.def;
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 14, size / 14);
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const o of ops) {
      const p = new Path2D(o[1]);
      if (o[0] === 'f') ctx.fill(p); else { ctx.lineWidth = o[2]; ctx.stroke(p); }
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitText(ctx, txt, x, y, max) {
    if (max <= 0) return;
    if (ctx.measureText(txt).width <= max) { ctx.fillText(txt, x, y); return; }
    let s = txt;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    ctx.fillText(s + '…', x, y);
  }
  // Ingrandimento che serve perché, ruotando, non restino angoli vuoti
  function coverScale(w, h, rot) { const t = Math.abs(rot) * RAD; return Math.cos(t) + Math.sin(t) * Math.max(w / h, h / w); }
  function mapPt(rec, rot, s, x, y) {
    const cx = rec.w / 2, cy = rec.h / 2, a = rot * RAD;
    const dx = (x - cx) * s, dy = (y - cy) * s;
    return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
  }
  // Le etichette restano dritte: si sposta solo il punto a cui sono agganciate
  function drawLabels(ctx, rec, rot, s) {
    const k = rec.w / rec.W0;
    const L2 = rec.labels.map((L) => {
      const a = mapPt(rec, rot, s, L.x * k, L.ay * k);
      return { L: L, ax: a[0], ay: a[1], bx: a[0] + (L.left - L.x) * k, by: a[1] + (L.top - L.ay) * k, bw: L.w * k, bh: L.h * k };
    });
    for (const q of L2) {
      const bottom = q.by + q.bh;
      if (q.ay > bottom) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(q.ax - 0.5 * k, bottom, k, q.ay - bottom); }
      ctx.fillStyle = typeColor(q.L.t);
      ctx.beginPath(); ctx.arc(q.ax, q.ay, 3 * k, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.75 * k; ctx.stroke();
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // il carattere del disegno può essere un po' più largo di quello dello schermo: l'etichetta si allarga
    for (const q of L2) {
      const L = q.L;
      let need = 0;
      if (L.m === 'name') { ctx.font = '500 ' + (13 * k) + 'px ' + FONT; need = ctx.measureText(L.n).width + 38 * k; }
      if (L.m === 'sel') {
        ctx.font = '600 ' + (13 * k) + 'px ' + FONT; need = ctx.measureText(L.n).width;
        ctx.font = '400 ' + (11 * k) + 'px ' + FONT; need = Math.max(need, ctx.measureText(L.sub).width) + 44 * k;
      }
      if (need > q.bw) { q.bx -= (need - q.bw) / 2; q.bw = need; }
    }
    for (const q of L2) {
      const L = q.L, col = typeColor(L.t);
      const DARK = { peak: '#2f8f48', land: '#7b4fd0', river: '#2b86c5', town: '#1d1d1f' }[kindOf(L.t)];
      if (L.m === 'dot') {
        ctx.fillStyle = 'rgba(28,28,30,0.55)'; roundRect(ctx, q.bx, q.by, q.bw, q.bh, q.bh / 2); ctx.fill();
        drawIcon(ctx, L.t, q.bx + q.bw / 2, q.by + q.bh / 2, 10 * k, col);
      } else if (L.m === 'name') {
        ctx.fillStyle = 'rgba(28,28,30,0.58)'; roundRect(ctx, q.bx, q.by, q.bw, q.bh, Math.min(13 * k, q.bh / 2)); ctx.fill();
        drawIcon(ctx, L.t, q.bx + 16 * k, q.by + q.bh / 2, 11 * k, col);
        ctx.fillStyle = '#f5f5f7'; ctx.font = '500 ' + (13 * k) + 'px ' + FONT;
        fitText(ctx, L.n, q.bx + 27 * k, q.by + q.bh / 2, q.bw - 36 * k);
      } else {
        ctx.fillStyle = '#ffffff'; roundRect(ctx, q.bx, q.by, q.bw, q.bh, 13 * k); ctx.fill();
        drawIcon(ctx, L.t, q.bx + 16 * k, q.by + 6 * k + 8 * k, 11 * k, DARK);
        ctx.fillStyle = '#1d1d1f'; ctx.font = '600 ' + (13 * k) + 'px ' + FONT;
        fitText(ctx, L.n, q.bx + 27 * k, q.by + 6 * k + 8 * k, q.bw - 36 * k);
        ctx.fillStyle = '#6e6e73'; ctx.font = '400 ' + (11 * k) + 'px ' + FONT;
        fitText(ctx, L.sub, q.bx + 27 * k, q.by + q.bh - 6 * k - 6.5 * k, q.bw - 36 * k);
      }
    }
  }
  function captionText(rec) {
    const m = rec.meta || {};
    const where = m.placeShort || (m.comune ? m.comune + (m.prov ? ' (' + m.prov + ')' : '') : '');
    return [where, fmtWhen(rec.time), m.heading !== null && m.heading !== undefined ? 'verso ' + dirText(m.heading) : ''].filter(Boolean).join(' · ');
  }
  // Fascia in basso (solo nella foto condivisa con i nomi): luogo, data, direzione e fonti dei nomi
  function drawCaption(ctx, rec, W, H) {
    const fs = Math.max(12, Math.round(W * 0.024));
    const pad = Math.round(fs * 0.8);
    const h = pad * 2 + fs * 1.3 + fs * 0.85 * 1.3;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, H - h, W, h);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff'; ctx.font = '600 ' + fs + 'px ' + FONT;
    fitText(ctx, captionText(rec), pad, H - h + pad, W - pad * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '400 ' + Math.round(fs * 0.85) + 'px ' + FONT;
    fitText(ctx, 'Nomi: © OpenStreetMap contributors · GeoNames (CC BY 4.0) · ISTAT' + ((rec.meta || {}).dem ? ' · Rilievo: Terrain Tiles (EU-DEM, USGS)' : ''), pad, H - h + pad + fs * 1.3, W - pad * 2);
  }
  function renderPhoto(img, rec, o) {
    o = o || {};
    const e = o.edit || rec.edit || {};
    const rot = e.rot || 0;
    const names = o.names !== undefined ? o.names : e.names !== false;
    const s = coverScale(rec.w, rec.h, rot);
    const cr = (o.crop === false || !e.crop) ? { x: 0, y: 0, w: 1, h: 1 } : e.crop;
    const cx0 = cr.x * rec.w, cy0 = cr.y * rec.h, cw = cr.w * rec.w, ch = cr.h * rec.h;
    const f = Math.min(1, (o.maxLong || 4096) / Math.max(cw, ch));
    const c = o.canvas || document.createElement('canvas');
    c.width = Math.max(1, Math.round(cw * f)); c.height = Math.max(1, Math.round(ch * f));
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(f, 0, 0, f, -cx0 * f, -cy0 * f);
    ctx.save();
    ctx.translate(rec.w / 2, rec.h / 2); ctx.rotate(rot * RAD); ctx.scale(s, s);
    ctx.drawImage(img, -rec.w / 2, -rec.h / 2, rec.w, rec.h);
    ctx.restore();
    if (names && rec.labels && rec.labels.length) drawLabels(ctx, rec, rot, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (names && o.caption) drawCaption(ctx, rec, c.width, c.height);
    return c;
  }

  /* ---------- Galleria ---------- */
  let galList = null, galIdx = 0, galToken = 0, galPrep = null, galPrepTimer = null, galMsgTimer = null;
  async function galLoad() { if (!galList) galList = await dbAllMeta(); return galList; }
  const thumbUrls = new Map();
  function thumbUrl(rec) {
    const key = rec.id + ':' + (rec.tv || 0);
    if (!thumbUrls.has(key)) thumbUrls.set(key, URL.createObjectURL(new Blob([rec.thumb], { type: 'image/jpeg' })));
    return thumbUrls.get(key);
  }
  function setThumbs() {
    const rec = galList && galList[0];
    const bg = rec && rec.thumb ? 'url(' + thumbUrl(rec) + ')' : '';
    document.querySelectorAll('.gal .thumb').forEach((el) => { el.style.backgroundImage = bg; });
  }
  function galMsg(txt, ms) {
    $('galToast').textContent = txt;
    $('galToast').hidden = false;
    clearTimeout(galMsgTimer);
    if (ms) galMsgTimer = setTimeout(() => { $('galToast').hidden = true; }, ms);
  }
  function standalone() {
    return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  async function openGallery(id) {
    try { await galLoad(); } catch (e) { toast('Galleria non disponibile: ' + describeError(e), 5000); return; }
    galIdx = id ? Math.max(0, galList.findIndex((r) => r.id === id)) : 0;
    $('gal').hidden = false;
    let dismissed = false;
    try { dismissed = localStorage.getItem('pano.hintHome') === '1'; } catch (e) {}
    $('galHint').hidden = standalone() || dismissed;
    buildStrip();
    galShow();
  }
  $('galBack').addEventListener('click', () => { if (TAB.cur) { setTab('guarda'); return; } $('gal').hidden = true; $('galToast').hidden = true; });
  $('galHintX').addEventListener('click', () => {
    $('galHint').hidden = true;
    try { localStorage.setItem('pano.hintHome', '1'); } catch (e) {}
  });
  function buildStrip() {
    const box = $('galStrip');
    box.innerHTML = '';
    galList.forEach((rec, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Foto ' + (i + 1));
      if (rec.thumb) b.style.backgroundImage = 'url(' + thumbUrl(rec) + ')';
      b.addEventListener('click', () => { galIdx = i; galShow(); });
      box.appendChild(b);
    });
  }
  // v26: dati della foto ordinati in due gruppi (Dove · Ripresa), una riga per voce
  function infoRows(rec) {
    const m = rec.meta || {};
    const has = (v) => v !== null && v !== undefined;
    const dove = [], ripresa = [];
    if (m.place) dove.push(['Luogo', m.place]);
    if (m.comune) dove.push(['Comune', m.comune + (m.prov ? ' (' + m.prov + ')' : '')]);
    if (m.catasto) dove.push(['Catasto', 'foglio ' + m.catasto.f + ', particella ' + m.catasto.p + (m.catasto.edge ? ' · vicino al confine' : '')]);
    if (has(m.lat)) dove.push(['Coordinate', fmtCoord(m.lat, m.lon) + (has(m.gpsAcc) ? ' (±' + Math.round(m.gpsAcc) + ' m)' : '')]);
    const q = [];
    if (has(m.alt)) q.push(Math.round(m.alt) + ' m GPS');
    if (has(m.ground)) q.push('terreno ≈ ' + m.ground + ' m');
    if (q.length) dove.push(['Quota', q.join(' · ')]);
    ripresa.push(['Data', fmtWhen(rec.time)]);
    if (has(m.heading)) ripresa.push(['Direzione', dirText(m.heading) + (has(m.pitch) ? ', inclinazione ' + (Math.round(m.pitch) > 0 ? '+' : '') + Math.round(m.pitch) + '°' : '')]);
    if (m.lens) ripresa.push(['Obiettivo', LENS_NAME[m.lens] + (typeof m.zoom === 'string' && m.zoom !== 'T' ? ' ' + m.zoom : m.zoom && m.zoom !== 1 && m.zoom !== 'T' ? ' ' + zoomName(m.zoom) : '')]);
    if (has(m.heading)) ripresa.push(['Bussola', m.aligned ? 'allineata in questo punto' : 'non allineata']);
    return { dove: dove, ripresa: ripresa };
  }
  function infoText(rec) {   // testo semplice (copia e condivisione)
    const r = infoRows(rec);
    return r.dove.concat(r.ripresa).map((x) => x[0] + ': ' + x[1]).join('\n');
  }
  function showInfo(rec) {
    const box = $('galInfo');
    box.innerHTML = '';
    if (!rec) return;
    const r = infoRows(rec);
    const sum = document.createElement('button');
    sum.type = 'button'; sum.className = 'giSum';
    sum.setAttribute('aria-expanded', String(galInfoOpen));
    // riga breve: Comune e particella (la fascia sulla foto ha già luogo, data e direzione)
    const m = rec.meta || {};
    const short = m.comune ? [m.comune + (m.prov ? ' (' + m.prov + ')' : ''), m.catasto ? 'foglio ' + m.catasto.f + ', part. ' + m.catasto.p : ''].filter(Boolean).join(' · ')
      : m.lat !== null && m.lat !== undefined ? fmtCoord(m.lat, m.lon) : '';
    sum.innerHTML = '<span></span><i>' + (galInfoOpen ? 'Meno' : 'Dettagli') + ' ›</i>';
    sum.firstChild.textContent = short || 'Dati della foto';
    sum.addEventListener('click', () => { galInfoOpen = !galInfoOpen; galShow(); });   // ridisegna: la foto cambia misura
    box.appendChild(sum);
    if (!galInfoOpen) return;
    for (const [title, rows] of [['Dove', r.dove], ['Ripresa', r.ripresa]]) {
      if (!rows.length) continue;
      const h = document.createElement('h4'); h.textContent = title; box.appendChild(h);
      const dl = document.createElement('dl');
      for (const [k, v] of rows) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        dl.appendChild(dt); dl.appendChild(dd);
      }
      box.appendChild(dl);
    }
  }
  let galInfoOpen = false;
  function editKey(rec) { return rec.id + ':' + JSON.stringify(rec.edit || {}); }
  async function galShow() {
    const n = galList.length;
    $('galEmpty').hidden = n > 0;
    $('galCount').textContent = n ? (galIdx + 1) + ' di ' + n : '';
    ['galShare', 'galEdit', 'galDel'].forEach((id) => { $(id).disabled = !n; });
    resetDel();
    Array.prototype.forEach.call($('galStrip').children, (b, i) => {
      b.classList.toggle('on', i === galIdx);
      if (i === galIdx && b.scrollIntoView) b.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
    const cv = $('galCv');
    if (!n) {
      cv.width = 1; cv.height = 1; cv.getContext('2d').clearRect(0, 0, 1, 1);
      $('galCap').textContent = ''; $('galInfo').textContent = '';
      return;
    }
    const rec = galList[galIdx];
    showInfo(rec);
    $('galCap').textContent = '';
    const tok = ++galToken;
    try {
      const img = await loadImg(rec);
      if (tok !== galToken) return;
      const r = $('galStage').getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      renderPhoto(img, rec, { canvas: cv, maxLong: Math.max(r.width, r.height) * dpr });
      // fascia con luogo, data e direzione appoggiata al bordo basso della foto
      const sc = Math.min(r.width / cv.width, r.height / cv.height);
      const dw = cv.width * sc, dh = cv.height * sc;
      const cap = $('galCap');
      cap.style.left = ((r.width - dw) / 2) + 'px';
      cap.style.right = ((r.width - dw) / 2) + 'px';
      cap.style.bottom = ((r.height - dh) / 2) + 'px';
      cap.textContent = captionText(rec);
      clearTimeout(galPrepTimer);
      galPrepTimer = setTimeout(() => { if (tok === galToken) prepareShare(rec); }, 500);
    } catch (e) {
      $('galInfo').textContent = 'Foto non leggibile: ' + describeError(e);
    }
  }
  let gx = null;
  $('galStage').addEventListener('touchstart', (e) => { gx = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  $('galStage').addEventListener('touchend', (e) => {
    if (gx === null || !galList) return;
    const dx = e.changedTouches[0].clientX - gx;
    gx = null;
    if (Math.abs(dx) < 50) return;
    const n = galIdx + (dx < 0 ? 1 : -1);
    if (n >= 0 && n < galList.length) { galIdx = n; galShow(); }
  }, { passive: true });

  // Condividi: la foto viene preparata in anticipo, perché Safari vuole il tocco «fresco»
  function fileName(rec) {
    const d = new Date(rec.time);
    const p = (x) => String(x).padStart(2, '0');
    return 'panorama-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.jpg';
  }
  async function buildShareFile(rec) {
    const img = await loadImg(rec);
    const c = renderPhoto(img, rec, { maxLong: 4096, caption: true });
    const b = await toBlob(c, 0.92);
    return new File([b], fileName(rec), { type: 'image/jpeg' });
  }
  function prepareShare(rec) {
    const key = editKey(rec);
    if (galPrep && galPrep.key === key) return galPrep;
    const prep = { key: key, file: null };
    prep.p = buildShareFile(rec).then((f) => { prep.file = f; return f; });
    prep.p.catch(() => {});
    galPrep = prep;
    return prep;
  }
  $('galShare').addEventListener('click', async () => {
    const rec = galList && galList[galIdx];
    if (!rec) return;
    const prep = prepareShare(rec);
    let file = prep.file;
    if (!file) {
      galMsg('Preparo la foto…');
      try { file = await prep.p; } catch (e) { galMsg('Foto non pronta: ' + describeError(e), 4000); return; }
      $('galToast').hidden = true;
    }
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) {
        if (e && e.name === 'AbortError') return;
        if (e && e.name === 'NotAllowedError') { galMsg('La foto è pronta: premi di nuovo Condividi.', 3500); return; }
      }
    }
    const u = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = u; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
    galMsg('Foto scaricata.', 2500);
  });

  // Elimina: serve un secondo tocco di conferma
  let delArm = null;
  function resetDel() {
    clearTimeout(delArm); delArm = null;
    $('galDel').classList.remove('confirm');
    $('galDel').querySelector('span').textContent = 'Elimina';
  }
  $('galDel').addEventListener('click', async () => {
    const rec = galList && galList[galIdx];
    if (!rec) return;
    if (!delArm) {
      $('galDel').classList.add('confirm');
      $('galDel').querySelector('span').textContent = 'Sì, elimina';
      delArm = setTimeout(resetDel, 3500);
      return;
    }
    resetDel();
    try { await dbDel(rec.id); } catch (e) { galMsg('Non eliminata: ' + describeError(e), 4000); return; }
    galList.splice(galIdx, 1);
    imgCache.delete(rec.id);
    if (galIdx >= galList.length) galIdx = Math.max(0, galList.length - 1);
    buildStrip(); galShow(); setThumbs();
    galMsg('Foto eliminata.', 2000);
  });

  /* ---------- Modifica: ritaglia, raddrizza, nomi sì/no ---------- */
  const ED = { rec: null, img: null, edit: null, box: null, drag: null, raf: 0 };
  $('galEdit').addEventListener('click', async () => {
    const rec = galList && galList[galIdx];
    if (!rec) return;
    try { ED.img = await loadImg(rec); } catch (e) { galMsg('Foto non leggibile: ' + describeError(e), 4000); return; }
    ED.rec = rec;
    const e = rec.edit || {};
    ED.edit = { names: e.names !== false, rot: e.rot || 0, crop: e.crop ? Object.assign({}, e.crop) : { x: 0, y: 0, w: 1, h: 1 } };
    $('edit').hidden = false;
    edSync();
    requestAnimationFrame(edDraw);
  });
  function edSync() {
    $('edRot').value = String(ED.edit.rot);
    $('edRotV').textContent = fmtDeg(ED.edit.rot);
    $('edNames').setAttribute('aria-pressed', String(ED.edit.names));
    $('edNames').textContent = ED.edit.names ? 'Nomi sì' : 'Nomi no';
  }
  function edDraw() {
    ED.raf = 0;
    if ($('edit').hidden) return;
    const sr = $('edStage').getBoundingClientRect();
    const st = $('edCv').getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = renderPhoto(ED.img, ED.rec, { canvas: $('edCv'), edit: ED.edit, crop: false, maxLong: Math.max(st.width, st.height) * dpr });
    const sc = Math.min(st.width / c.width, st.height / c.height);
    const dw = c.width * sc, dh = c.height * sc;
    ED.box = { x: st.left - sr.left + (st.width - dw) / 2, y: st.top - sr.top + (st.height - dh) / 2, w: dw, h: dh };
    edCropUI();
  }
  function edLater() { if (!ED.raf) ED.raf = requestAnimationFrame(edDraw); }
  function edCropUI() {
    const b = ED.box, cr = ED.edit.crop, el = $('edCrop');
    if (!b) return;
    el.style.left = (b.x + cr.x * b.w) + 'px';
    el.style.top = (b.y + cr.y * b.h) + 'px';
    el.style.width = (cr.w * b.w) + 'px';
    el.style.height = (cr.h * b.h) + 'px';
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  $('edCrop').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const hd = (e.target && e.target.dataset && e.target.dataset.h) || 'move';
    ED.drag = { hd: hd, x: e.clientX, y: e.clientY, c: Object.assign({}, ED.edit.crop) };
    try { $('edCrop').setPointerCapture(e.pointerId); } catch (err) {}
  });
  $('edCrop').addEventListener('pointermove', (e) => {
    if (!ED.drag || !ED.box) return;
    const b = ED.box, c0 = ED.drag.c, hd = ED.drag.hd, MIN = 0.12;
    const dx = (e.clientX - ED.drag.x) / b.w, dy = (e.clientY - ED.drag.y) / b.h;
    if (hd === 'move') {
      ED.edit.crop = { x: clamp(c0.x + dx, 0, 1 - c0.w), y: clamp(c0.y + dy, 0, 1 - c0.h), w: c0.w, h: c0.h };
    } else {
      let x1 = c0.x, y1 = c0.y, x2 = c0.x + c0.w, y2 = c0.y + c0.h;
      if (hd.indexOf('w') >= 0) x1 = clamp(x1 + dx, 0, x2 - MIN);
      if (hd.indexOf('e') >= 0) x2 = clamp(x2 + dx, x1 + MIN, 1);
      if (hd.indexOf('n') >= 0) y1 = clamp(y1 + dy, 0, y2 - MIN);
      if (hd.indexOf('s') >= 0) y2 = clamp(y2 + dy, y1 + MIN, 1);
      ED.edit.crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    edCropUI();
  });
  const edEnd = () => { ED.drag = null; };
  $('edCrop').addEventListener('pointerup', edEnd);
  $('edCrop').addEventListener('pointercancel', edEnd);
  $('edRot').addEventListener('input', () => { ED.edit.rot = Number($('edRot').value); $('edRotV').textContent = fmtDeg(ED.edit.rot); edLater(); });
  $('edNames').addEventListener('click', () => { ED.edit.names = !ED.edit.names; edSync(); edLater(); });
  $('edReset').addEventListener('click', () => { ED.edit = { names: true, rot: 0, crop: { x: 0, y: 0, w: 1, h: 1 } }; edSync(); edLater(); });
  $('edCancel').addEventListener('click', () => { $('edit').hidden = true; });
  $('edSave').addEventListener('click', async () => {
    const rec = ED.rec, e = ED.edit, cr = e.crop;
    const whole = cr.x <= 0.001 && cr.y <= 0.001 && cr.w >= 0.999 && cr.h >= 0.999;
    const old = rec.edit;
    rec.edit = { names: e.names, rot: e.rot, crop: whole ? null : cr };
    try {
      const tc = renderPhoto(ED.img, rec, { names: false, maxLong: 240 });
      rec.thumb = await (await toBlob(tc, 0.8)).arrayBuffer();
      rec.tv = (rec.tv || 0) + 1;
      await dbPutMeta(rec);
    } catch (err) {
      rec.edit = old;
      galMsg('Modifica non salvata: ' + describeError(err), 4000);
      return;
    }
    $('edit').hidden = true;
    buildStrip(); galShow(); setThumbs();
  });
  window.addEventListener('resize', () => { if (!$('edit').hidden) edLater(); else if (!$('gal').hidden && galList) galShow(); });
