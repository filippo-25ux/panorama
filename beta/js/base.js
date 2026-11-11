/* Orientis – Costanti, utilità, impostazioni e memoria locale, geografia.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  const $ = (id) => document.getElementById(id);
  const RAD = Math.PI / 180;
  const EARTH = 6371000;
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const TYPE_LABEL = { city: 'città', town: 'cittadina', village: 'paese', hamlet: 'frazione', peak: 'vetta', church: 'chiesa', tower: 'torre', castle: 'castello', river: 'fiume', stream: 'torrente' };
  const TYPE_WEIGHT = { city: 4, town: 3, peak: 2.5, village: 2, hamlet: 1, church: 1.5, tower: 1.7, castle: 1.8, river: 2.2, stream: 1.4 };
  const LAND_TYPES = { church: 1, tower: 1, castle: 1 };
  const PEAKS_URL = 'peaks-it.json'; // vette (GeoNames, CC BY 4.0): [nome, lat, lon, quota]
  const REFR = 0.13;                // coefficiente di rifrazione atmosferica
  // Importanza: le vette alte contano di più di una collinetta
  function weightOf(it) {
    if (it.t === 'peak' && it.e !== null && it.e !== undefined) return 1.5 + Math.min(2, Math.max(0, (it.e - 300) / 1000));
    return TYPE_WEIGHT[it.t];
  }
  // Testo sotto il nome dell'etichetta: per le vette anche la quota
  function subOf(it) {
    const q = (it.t === 'peak' && it.e !== null && it.e !== undefined) ? ' ' + Math.round(it.e).toLocaleString('it-IT') + ' m' : '';
    return TYPE_LABEL[it.t] + q + ', ' + fmtDist(it.d) + (it.hid ? ', dietro i rilievi' : '');
  }
  // Angolo sopra/sotto l'orizzonte, con curvatura terrestre e rifrazione
  // (i paesi non hanno quota nell'archivio: la prende dal rilievo del terreno, se disponibile)
  function elevOf(it) {
    const e = (it.e !== null && it.e !== undefined) ? it.e : (it.ge !== undefined ? it.ge : null);
    const o = obsAlt();
    if (e === null || o === null) return 0;
    return angTo(e, it.d, o);
  }
  function angTo(e, d, o) {
    const drop = d * d / (2 * EARTH) * (1 - REFR);
    return Math.atan2(e - drop - o, d) / RAD;
  }
  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
  ];
  const DENS = { 1: 4, 2: 7, 3: 12 };   // quanti nomi mostrare (Pochi / Normali / Molti)
  const MAX_DOTS = 24;                  // (prima della v23) luoghi mostrati solo con l'icona
  const DOTS = { 1: 2, 2: 4, 3: 8 };     // v23: meno pallini senza nome (Pochi / Normali / Molti)
  const F = { town: true, peak: true, river: true, stream: false, sun: false, dens: 2 };
  const TYPE_COLOR = { peak: '#8fd99a', church: '#c8a2ff', tower: '#c8a2ff', castle: '#c8a2ff', river: '#7fc8ff', stream: '#7fc8ff' };
  const typeColor = (t) => TYPE_COLOR[t] || '#ffffff';
  // Icone per tipo (stesse forme in camera, sulla mappa e nei filtri)
  function iconSvg(t, size) {
    const z = size || 14;
    let body;
    if (t === 'peak') body = '<path class="s" d="M1.5 12.5 L7 2.5 L12.5 12.5 Z" stroke-width="1.4"/>';
    else if (t === 'city') body = '<circle class="s" cx="7" cy="7" r="5.4" stroke-width="1.4"/><circle class="f" cx="7" cy="7" r="2.2"/>';
    else if (t === 'hamlet') body = '<circle class="s" cx="7" cy="7" r="3.4" stroke-width="1.4"/>';
    else if (t === 'church') body = '<path class="s" d="M7 1 V3.5 M5.8 2.2 H8.2 M4 13 V6.5 L7 4.5 L10 6.5 V13 Z" stroke-width="1.3"/>';
    else if (t === 'tower') body = '<path class="s" d="M4.5 13 V4 H9.5 V13 M4.5 4 V2 M7 4 V2 M9.5 4 V2" stroke-width="1.3"/>';
    else if (t === 'castle') body = '<path class="s" d="M1.5 13 V5 H3.5 V3 H5.5 V5 H8.5 V3 H10.5 V5 H12.5 V13 Z" stroke-width="1.3"/>';
    else if (t === 'sun') body = '<circle class="f" cx="7" cy="7" r="4"/>';
    else if (t === 'ridge') body = '<path class="s" d="M0.5 10 L3.5 6 L6 8.5 L9 4 L13.5 8.5" stroke-width="1.3" stroke-dasharray="1.6 1.8"/>';
    else if (t === 'relief') body = '<path class="f" d="M0.5 12.5 L4.6 6 L6.8 9 L9.2 4.5 L13.5 12.5 Z" opacity="0.85"/>';
    else if (t === 'stream') body = '<path class="s" d="M1 7.2 C3 6 4.5 8.4 7 7.2 S11 6 13 7.2" stroke-width="1.3"/>';
    else if (t === 'river') body = '<path class="s" d="M1 5 C3 3.8 4.5 6.2 7 5 S11 3.8 13 5 M1 9.5 C3 8.3 4.5 10.7 7 9.5 S11 8.3 13 9.5" stroke-width="1.3"/>';
    else body = '<circle class="s" cx="7" cy="7" r="4.6" stroke-width="1.5"/>';
    return '<svg class="ic" aria-hidden="true" width="' + z + '" height="' + z + '" viewBox="0 0 14 14">' + body + '</svg>';
  }
  // Il luogo è acceso nei filtri?
  function visible(it) {
    if (it.t === 'peak') return F.peak;
    if (LAND_TYPES[it.t]) return S.land;
    return F.town;
  }

  /* Declinazione magnetica: modello WMM2025 (epoca 2026,85), griglia di 5° in decimi di grado.
     Righe da -70° a +75° di latitudine, colonne da -180° a +180° di longitudine. */
  const { DECL } = window.ORI_DATI;   // dati/declinazione.js

  function declAt(lat, lon) {
    const G = DECL;
    const la = Math.min(G.la0 + (G.rows.length - 1) * G.step, Math.max(G.la0, lat));
    let lo = ((lon + 180) % 360 + 360) % 360 - 180;
    const fy = (la - G.la0) / G.step, fx = (lo - G.lo0) / G.step;
    const y = Math.min(G.rows.length - 2, Math.max(0, Math.floor(fy)));
    const x = Math.min(G.rows[0].length - 2, Math.max(0, Math.floor(fx)));
    const ty = fy - y, tx = fx - x;
    const a = G.rows[y][x], b = G.rows[y][x + 1], c = G.rows[y + 1][x], d = G.rows[y + 1][x + 1];
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) / 10;
  }

  /* Posizione del sole (formule astronomiche standard): azimut da nord in senso orario, altezza sull'orizzonte */
  function sunPos(date, lat, lon) {
    const d = date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545;
    const M = RAD * (357.5291 + 0.98560028 * d);
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI;
    const e = RAD * 23.4397;
    const dec = Math.asin(Math.sin(L) * Math.sin(e));
    const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    const phi = lat * RAD;
    const H = RAD * (280.16 + 360.9856235 * d) + lon * RAD - ra;
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    return { az: (az / RAD + 180 + 360) % 360, alt: alt / RAD };
  }

  /* Cerca nell'immagine il disco chiaro e compatto del sole. Restituisce il centro in pixel o null. */
  function findSun(d, w, h) {
    const n = w * h;
    const mask = new Uint8Array(n);
    let bright = 0;
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (Math.min(r, g, b) >= 235 && Math.max(r, g, b) >= 250) { mask[i] = 1; bright++; }
    }
    if (bright === 0 || bright > n * 0.08) return null; // cielo coperto o muro bianco: nessun sole riconoscibile
    const seen = new Uint8Array(n);
    const stack = [];
    let best = null;
    for (let s = 0; s < n; s++) {
      if (!mask[s] || seen[s]) continue;
      stack.length = 0; stack.push(s); seen[s] = 1;
      let area = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      while (stack.length) {
        const p = stack.pop();
        const x = p % w, y = (p / w) | 0;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
        if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
        if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
        if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const fill = area / (bw * bh), ratio = bw / bh;
      if (area >= 4 && area <= n * 0.04 && fill >= 0.5 && ratio >= 0.5 && ratio <= 2) {
        if (!best || area > best.area) best = { x: sx / area + 0.5, y: sy / area + 0.5, area: area };
      }
    }
    return best;
  }

  const S = { oriB: null, oriG: null,
    heading: null, compAcc: null, pitch: null, alOff: 0, alPos: null, alQ: null,
    lat: null, lon: null, gpsAcc: null, alt: null, altAcc: null, gpsMsg: null,
    fov: 70, off: 0, pitchOff: 0, radius: 25000, land: false, declAuto: 3,
    fovs: { std: 70, uw: 100, tele: 17 },   // campo visivo verticale di partenza per obiettivo
    shotNames: true, shotHi: false, dem: true, ridge: true, autoSun: true
  };
  // Fotocamera: obiettivi trovati, obiettivo in uso, zoom a scatti
  const CAM = { ids: {}, kind: 'std', base: 'std', names: [], scanned: false, track: null, hw: null, zoom: 1, zk: '1', dz: 1, css: 1, mode: '', stops: ['1', '2'] };
  const LENS_NAME = { uw: 'ultra grandangolo', std: 'standard', tele: 'teleobiettivo' };
  // Metà del campo visivo verticale sullo schermo (tangente), tenendo conto dello zoom
  // (CAM.zoom è lo scatto scelto rispetto all'obiettivo più ampio; CAM.dz l'ingrandimento applicato all'obiettivo in uso)
  function tanVis() { return Math.tan(S.fov * RAD / 2) / CAM.dz; }
  // Per uno scatto di zoom: l'obiettivo più stretto che copre ancora l'inquadratura (meno ingrandimento digitale = foto più nitida)
  function lensFor(z) {
    if (CAM.base === 'uw' && CAM.ids.std && Math.tan(S.fovs.std * RAD / 2) >= Math.tan(S.fovs.uw * RAD / 2) / z * 0.98) return 'std';
    return CAM.base;
  }
  function dzFor(z, kind) { return Math.max(1, Math.tan(S.fovs[kind] * RAD / 2) / (Math.tan(S.fovs[CAM.base] * RAD / 2) / z)); }
  let pitchWasReset = null;
  let staticItems = [];   // archivio interno (places-it.json)
  let onlineItems = [];   // vette e frazioni da OpenStreetMap
  let landItems = [];     // chiese, torri e castelli da OpenStreetMap
  let items = [];         // elenco unito, solo i luoghi entro il raggio scelto
  let builtFor = null;
  let lastFetch = null, lastFetchLand = null;
  let loading = false, loadingLand = false;
  let retryAt = 0, retryLandAt = 0;
  let statusMsg = 'In attesa del GPS…';
  let netNote = '', landNote = '', peakNote = '';
  let here = '';
  let nearPlace = null;
  let sunCand = null;
  let toastTimer = null, undoState = null;
  const walk = { active: false, samples: [], until: 0 };
  const align = { step: null, target: null, first: null, list: [], h0: null, prev: 0, prevQ: null, prevPitch: 0, prevPos: null };
  const pool = {};
  const shownText = {};

  /* ---------- Impostazioni e memoria locale ---------- */
  let fovWasReset = false;
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('pano.settings') || '{}');
      if (typeof s.fov === 'number') S.fovs.std = s.fov;
      if (s.fovs) for (const k in S.fovs) if (typeof s.fovs[k] === 'number') S.fovs[k] = s.fovs[k];
      if (!s.pitchSensors && S.fovs.std === 65) S.fovs.std = 70;   // campo visivo standard più realistico
      if (!s.v22 && Object.keys(s).length) { S.fovs.std = 70; S.fovs.uw = 100; S.fovs.tele = 17; fovWasReset = true; }   // v22: tarati sull'immagine piccola
      S.fov = S.fovs.std;
      if (s.shotNames === false) S.shotNames = false;
      if (s.shotHi === true) S.shotHi = true;
      if (typeof s.off === 'number') S.off = s.off;
      // Dalla v10 l'inclinazione viene solo da accelerometro e giroscopio: la vecchia correzione si azzera una volta
      if (typeof s.pitchOff === 'number' && s.pitchOff !== 0 && !s.pitchSensors) pitchWasReset = s.pitchOff;
      if (s.land === true) S.land = true;
      if (s.dem === false) S.dem = false;
      if (s.ridge === false) S.ridge = false;
      if (s.autoSun === false) S.autoSun = false;
      if (s.catLayer === true) S.catLayer = true;
      S.lyFr = s.lyFr === true; S.lyAl = s.lyAl === true; S.coneOff = s.coneOff === true; S.sat = s.sat === true; S.esriKey = typeof s.esriKey === 'string' ? s.esriKey : '';
      if (s.radius === 10000 || s.radius === 25000 || s.radius === 50000) S.radius = s.radius;
      if (s.f) { F.town = s.f.town !== false; F.peak = s.f.peak !== false; F.sun = s.f.sun === true; F.river = s.f.river !== false; F.stream = s.f.stream === true; if (DENS[s.f.dens]) F.dens = s.f.dens; }
    } catch (e) { /* si usano i valori di partenza */ }
  }
  function saveSettings() {
    try { localStorage.setItem('pano.settings', JSON.stringify({ fov: S.fovs.std, fovs: S.fovs, shotNames: S.shotNames, shotHi: S.shotHi, off: S.off, pitchOff: 0, pitchSensors: true, radius: S.radius, land: S.land, dem: S.dem, ridge: S.ridge, autoSun: S.autoSun, catLayer: !!S.catLayer, lyFr: !!S.lyFr, lyAl: !!S.lyAl, coneOff: !!S.coneOff, sat: !!S.sat, esriKey: S.esriKey || '', v22: true, f: F })); } catch (e) {}
  }
  function loadCache() {
    try {
      const rv = JSON.parse(localStorage.getItem('pano.cacheRiver') || 'null');   // v27: fiumi salvati (14 giorni)
      if (rv && Array.isArray(rv.rivers) && Date.now() - rv.time < 14 * 86400000) { riverRaw = rv.rivers; lastFetchRiver = { lat: rv.lat, lon: rv.lon, radius: rv.radius }; }
      const st = JSON.parse(localStorage.getItem('pano.cacheStream') || 'null');   // v28: torrenti salvati (14 giorni)
      if (st && Array.isArray(st.rivers) && Date.now() - st.time < 14 * 86400000) { streamRaw = st.rivers; lastFetchStream = { lat: st.lat, lon: st.lon, radius: st.radius }; }
      const c = JSON.parse(localStorage.getItem('pano.cache') || 'null');
      if (c && c.radius === S.radius && Array.isArray(c.items) && Date.now() - c.time < 14 * 86400000) {
        onlineItems = c.items;
        lastFetch = { lat: c.lat, lon: c.lon, radius: c.radius };
      }
      const l = JSON.parse(localStorage.getItem('pano.cacheLand') || 'null');
      if (l && Array.isArray(l.items) && Date.now() - l.time < 14 * 86400000) {
        landItems = l.items;
        lastFetchLand = { lat: l.lat, lon: l.lon, radius: l.radius };
      }
    } catch (e) {}
  }
  function saveCache() {
    try {
      localStorage.setItem('pano.cache', JSON.stringify({
        lat: lastFetch.lat, lon: lastFetch.lon, radius: lastFetch.radius, time: Date.now(), items: onlineItems
      }));
    } catch (e) {}
  }
  function saveCacheLand() {
    try {
      localStorage.setItem('pano.cacheLand', JSON.stringify({
        lat: lastFetchLand.lat, lon: lastFetchLand.lon, radius: lastFetchLand.radius, time: Date.now(), items: landItems
      }));
    } catch (e) {}
  }

  /* ---------- Geografia ---------- */
  function geo(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD, dp = p2 - p1;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const d = 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return { d: d, b: (Math.atan2(y, x) / RAD + 360) % 360 };
  }

  function norm180(a) { return ((a + 540) % 360) - 180; }

  function fmtDist(m) {
    if (m < 1000) return (Math.round(m / 10) * 10) + ' m';
    return (m / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  }

  function fmtDeg(v) {
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '°';
  }

  function recompute() {
    if (S.lat === null) return;
    let near = null;
    for (const it of items) {
      const g = geo(S.lat, S.lon, it.lat, it.lon);
      it.d = g.d;
      it.b = g.b;
      it.skip = g.d < 150;
      it.score = weightOf(it) / Math.sqrt(Math.max(g.d, 300) / 1000);
      if (!LAND_TYPES[it.t] && it.t !== 'peak' && (!near || g.d < near.d)) near = it;
    }
    nearPlace = near;
    demApply();
    if (near && near.d <= 500) here = 'Sei a ' + near.n;
    else if (near && near.d <= 3000) here = 'Vicino a ' + near.n + ' (' + fmtDist(near.d) + ')';
    else here = '';
  }
