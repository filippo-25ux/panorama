/* Orientis – Archivio interno (GeoNames + ISTAT), dati online OpenStreetMap, fiumi e torrenti.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- Archivio interno (GeoNames + ISTAT, Italia) ---------- */
  function typeFromPop(p, seat) {
    if (p >= 100000) return 'city';
    if (p >= 10000) return 'town';
    if (seat || p >= 250) return 'village';
    return 'hamlet';
  }

  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  async function loadStatic() {
    try {
      const arr = await fetchJSON('../places-it.json', 20000);
      staticItems = staticItems.concat(arr.map((a, i) => ({ id: 's' + i, n: a[0], lat: a[1], lon: a[2], t: typeFromPop(a[3], a[4]), e: null })));
      builtFor = null;
      refreshItems();
    } catch (e) {
      netNote = 'Archivio interno non caricato: ' + describeError(e);
    }
    try {
      const pk = await fetchJSON(PEAKS_URL, 20000);
      staticItems = staticItems.concat(pk.map((a, i) => ({ id: 'p' + i, n: a[0], lat: a[1], lon: a[2], t: 'peak', e: a[3] })));
      builtFor = null;
      refreshItems();
    } catch (e) {
      if (!/HTTP 404/.test(describeError(e))) peakNote = 'Archivio vette non caricato: ' + describeError(e);
    }
  }

  // Unisce archivio interno e dati online, tenendo solo i luoghi entro il raggio scelto
  function rebuildItems() {
    if (S.lat === null) return;
    const r = S.radius;
    const dLat = r / 111000;
    const dLon = r / (111000 * Math.cos(S.lat * RAD));

    const online = [];
    const byName = {};
    for (const o of onlineItems) {
      if (geo(S.lat, S.lon, o.lat, o.lon).d > r) continue;
      online.push(o);
      (byName[norm(o.n)] = byName[norm(o.n)] || []).push(o);
    }

    const merged = online.slice();
    for (const s of staticItems) {
      if (Math.abs(s.lat - S.lat) > dLat || Math.abs(s.lon - S.lon) > dLon) continue;
      if (geo(S.lat, S.lon, s.lat, s.lon).d > r) continue;
      const twins = byName[norm(s.n)];
      if (twins && twins.some((o) => geo(o.lat, o.lon, s.lat, s.lon).d < 3000)) continue;
      merged.push(s);
    }
    if (S.land) {
      const rl = Math.min(r, 10000);
      for (const l of landItems) {
        if (geo(S.lat, S.lon, l.lat, l.lon).d <= rl) merged.push(l);
      }
    }

    items = merged;
    builtFor = { lat: S.lat, lon: S.lon, radius: r, land: S.land };
    let nT = 0, nP = 0;
    for (const it of merged) { if (it.t === 'peak') nP++; else if (!LAND_TYPES[it.t]) nT++; }
    $('nTown').textContent = nT; $('nPeak').textContent = nP;
    clearPool();
    recompute();
    syncMarkers();
    statusMsg = items.length
      ? items.length + ' luoghi entro ' + (r / 1000) + ' km. Punta verso un paese.'
      : 'Nessun luogo trovato in questa zona (l’archivio interno copre solo l’Italia).';
  }

  function refreshItems() {
    if (S.lat === null) return;
    const moved = builtFor ? geo(builtFor.lat, builtFor.lon, S.lat, S.lon).d : Infinity;
    if (!builtFor || moved > 1000 || builtFor.radius !== S.radius || builtFor.land !== S.land) rebuildItems();
    else recompute();
  }

  /* ---------- Dati online (OpenStreetMap) ---------- */
  function convertPlaces(els) {
    const out = [];
    for (const el of els) {
      const tg = el.tags || {};
      if (typeof el.lat !== 'number') continue;
      const t = tg.natural === 'peak' ? 'peak' : tg.place;
      const name = tg['name:it'] || tg.name;
      if (!TYPE_WEIGHT[t] || LAND_TYPES[t] || !name) continue;
      const e = parseFloat(tg.ele);
      out.push({ id: el.id, n: name, t: t, lat: el.lat, lon: el.lon, e: isNaN(e) ? null : e });
    }
    return out;
  }

  function convertLand(els) {
    const out = [];
    for (const el of els) {
      const tg = el.tags || {};
      const lat = typeof el.lat === 'number' ? el.lat : (el.center && el.center.lat);
      const lon = typeof el.lon === 'number' ? el.lon : (el.center && el.center.lon);
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      let t = null;
      if (tg['tower:type'] === 'bell_tower' || /^(church|cathedral)$/.test(tg.building || '')) t = 'church';
      else if (tg.historic === 'castle') t = 'castle';
      else if (tg.man_made === 'tower' || tg.historic === 'tower' || tg.historic === 'city_gate') t = 'tower';
      if (!t) continue;
      const name = tg['name:it'] || tg.name || (t === 'church' ? 'Campanile' : t === 'castle' ? 'Castello' : 'Torre');
      const e = parseFloat(tg.ele);
      out.push({ id: 'l' + el.type + el.id, n: name, t: t, lat: lat, lon: lon, e: isNaN(e) ? null : e });
    }
    return out;
  }

  function shortHost(url) { return url.replace(/^https:\/\//, '').split('/')[0]; }
  function describeError(e) { return (e && e.name === 'AbortError') ? 'tempo scaduto' : ((e && e.message) || 'errore'); }

  async function fetchJSON(url, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function overpass(q) {
    const errors = [];
    for (const url of ENDPOINTS) {
      try {
        const json = await fetchJSON(url + '?data=' + encodeURIComponent(q), 20000);
        if (!json.elements || (json.elements.length === 0 && json.remark)) throw new Error('risposta incompleta');
        return json.elements;
      } catch (e) {
        errors.push(shortHost(url) + ': ' + describeError(e));
      }
    }
    throw new Error(errors.join(' | '));
  }

  function clearPool() {
    for (const id in pool) {
      pool[id].pill.remove();
      pool[id].pin.remove();
      delete pool[id];
    }
  }

  function maybeFetch() {
    if (S.lat === null || loading || Date.now() < retryAt) return;
    const moved = lastFetch ? geo(lastFetch.lat, lastFetch.lon, S.lat, S.lon).d : Infinity;
    if (lastFetch && lastFetch.radius === S.radius && moved < S.radius * 0.3) return;

    loading = true;
    const lat = S.lat, lon = S.lon, radius = S.radius;
    const around = 'around:' + radius + ',' + lat.toFixed(5) + ',' + lon.toFixed(5);
    const q = '[out:json][timeout:25];(' +
      'node(' + around + ')[place~"^(city|town|village|hamlet)$"][name];' +
      'node(' + around + ')[natural=peak][name];' +
      ');out;';
    overpass(q).then((els) => {
      onlineItems = convertPlaces(els);
      lastFetch = { lat: lat, lon: lon, radius: radius };
      saveCache();
      netNote = '';
      builtFor = null;
      refreshItems();
    }).catch((e) => {
      retryAt = Date.now() + 90000;
      netNote = staticItems.length
        ? 'Dati online (frazioni, vette minori) non disponibili: uso solo l’archivio interno.'
        : 'Errori: ' + ((e && e.message) || '').slice(0, 260);
    }).then(() => { loading = false; });
  }

  function maybeFetchLand() {
    if (!S.land || S.lat === null || loadingLand || Date.now() < retryLandAt) return;
    const R = Math.min(S.radius, 10000);
    const moved = lastFetchLand ? geo(lastFetchLand.lat, lastFetchLand.lon, S.lat, S.lon).d : Infinity;
    if (lastFetchLand && lastFetchLand.radius === R && moved < R * 0.3) return;

    loadingLand = true;
    landNote = 'Cerco chiese e torri…';
    const lat = S.lat, lon = S.lon;
    const around = 'around:' + R + ',' + lat.toFixed(5) + ',' + lon.toFixed(5);
    const q = '[out:json][timeout:25];(' +
      'nwr(' + around + ')["man_made"="tower"]["name"];' +
      'nwr(' + around + ')["tower:type"="bell_tower"];' +
      'nwr(' + around + ')["historic"~"^(castle|tower|city_gate)$"]["name"];' +
      'nwr(' + around + ')["building"~"^(church|cathedral)$"]["name"];' +
      ');out center;';
    overpass(q).then((els) => {
      landItems = convertLand(els);
      lastFetchLand = { lat: lat, lon: lon, radius: R };
      saveCacheLand();
      landNote = landItems.length ? '' : 'Nessuna chiesa o torre trovata in questa zona.';
      builtFor = null;
      refreshItems();
    }).catch(() => {
      retryLandAt = Date.now() + 90000;
      landNote = landItems.length ? 'Chiese e torri: uso i dati salvati.' : 'Chiese e torri non disponibili (server occupati). Riprovo tra poco.';
    }).then(() => { loadingLand = false; });
  }

  /* ---------- v27: fiumi (OpenStreetMap: waterway=river con nome) ----------
     I tracciati si scaricano entro la Distanza scelta (al massimo 25 km) e restano salvati sul telefono.
     Sulla fotocamera ogni fiume ha un solo nome, dove la linea di sguardo lo incrocia (il tratto visibile più vicino
     al centro dell'inquadratura), e solo se quel tratto si vede davvero: il rilievo del terreno decide se l'acqua
     è coperta da colline più vicine. Senza rilievo i fiumi restano solo sulla mappa. */
  let riverRaw = [];                 // [{ n, lines: [[lon, lat, lon, lat, …]] }]
  let rivers = [];                   // fiumi entro la distanza, con i punti campione e l'etichetta
  let lastFetchRiver = null, loadingRiver = false, retryRiverAt = 0, riverNote = '';
  let riverAt = null, riverGen = null, riverData = 0, riverBuilt = -1;
  function convertRivers(els) {
    const by = {};
    for (const el of els) {
      if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
      const tg = el.tags || {};
      const n = tg['name:it'] || tg.name;
      if (!n) continue;
      const flat = [];
      let last = null;
      el.geometry.forEach((p, i) => {   // un punto ogni 40 m circa basta (i campioni si infittiscono dopo)
        if (last && i < el.geometry.length - 1 && geo(last.lat, last.lon, p.lat, p.lon).d < 40) return;
        flat.push(Math.round(p.lon * 1e5) / 1e5, Math.round(p.lat * 1e5) / 1e5);
        last = p;
      });
      (by[n] = by[n] || []).push(flat);
    }
    return Object.keys(by).map((n) => ({ n: n, lines: by[n] }));
  }
  function saveCacheRiver() {
    try {
      localStorage.setItem('pano.cacheRiver', JSON.stringify({
        lat: lastFetchRiver.lat, lon: lastFetchRiver.lon, radius: lastFetchRiver.radius, time: Date.now(), rivers: riverRaw
      }));
    } catch (e) {}
  }
  function maybeFetchRiver() {
    if (!F.river || S.lat === null || loadingRiver || Date.now() < retryRiverAt) return;
    const R = Math.min(S.radius, 25000);
    const moved = lastFetchRiver ? geo(lastFetchRiver.lat, lastFetchRiver.lon, S.lat, S.lon).d : Infinity;
    if (lastFetchRiver && lastFetchRiver.radius === R && moved < R * 0.3) return;
    loadingRiver = true;
    const lat = S.lat, lon = S.lon;
    const q = '[out:json][timeout:30];way(around:' + R + ',' + lat.toFixed(5) + ',' + lon.toFixed(5) + ')["waterway"="river"]["name"];out geom;';
    overpass(q).then((els) => {
      riverRaw = convertRivers(els);
      lastFetchRiver = { lat: lat, lon: lon, radius: R };
      saveCacheRiver();
      riverNote = riverRaw.length ? '' : 'nessun fiume con nome entro ' + (R / 1000) + ' km';
      riverData++;
      buildRivers(); riverMapUpdate();
    }).catch(() => {
      retryRiverAt = Date.now() + 90000;
      riverNote = riverRaw.length ? 'uso i dati salvati (server occupati)' : 'non disponibili ora (server occupati): riprovo tra poco';
    }).then(() => { loadingRiver = false; refreshRiverUI(); });
  }
  /* v28: torrenti (waterway=stream) solo a richiesta (interruttore «Anche i torrenti», spento all'inizio):
     solo con nome, lunghi almeno 3 km (somma dei tratti scaricati) ed entro 10 km. OpenStreetMap non dice quanto è
     grande un torrente: la lunghezza è l'unica misura affidabile per lasciare fuori fossi e canali. */
  const STREAM_R = 10000, STREAM_MIN = 3000;
  let streamRaw = [], lastFetchStream = null, loadingStream = false, retryStreamAt = 0, streamNote = '';
  function lineLen(L) { let m = 0; for (let i = 0; i + 3 < L.length; i += 2) m += geo(L[i + 1], L[i], L[i + 3], L[i + 2]).d; return m; }
  function maybeFetchStream() {
    if (!F.river || !F.stream || S.lat === null || loadingStream || Date.now() < retryStreamAt) return;
    const R = Math.min(S.radius, STREAM_R);
    const moved = lastFetchStream ? geo(lastFetchStream.lat, lastFetchStream.lon, S.lat, S.lon).d : Infinity;
    if (lastFetchStream && lastFetchStream.radius === R && moved < R * 0.3) return;
    loadingStream = true;
    const lat = S.lat, lon = S.lon;
    const q = '[out:json][timeout:30];way(around:' + R + ',' + lat.toFixed(5) + ',' + lon.toFixed(5) + ')["waterway"="stream"]["name"];out geom;';
    overpass(q).then((els) => {
      streamRaw = convertRivers(els).filter((r) => r.lines.reduce((m, L) => m + lineLen(L), 0) >= STREAM_MIN);
      lastFetchStream = { lat: lat, lon: lon, radius: R };
      try { localStorage.setItem('pano.cacheStream', JSON.stringify({ lat: lat, lon: lon, radius: R, time: Date.now(), rivers: streamRaw })); } catch (e) {}
      streamNote = streamRaw.length ? '' : 'nessun torrente lungo con nome entro ' + (R / 1000) + ' km';
      riverData++;
      buildRivers(); riverMapUpdate();
    }).catch(() => {
      retryStreamAt = Date.now() + 90000;
      streamNote = streamRaw.length ? 'uso i dati salvati (server occupati)' : 'non disponibili ora (server occupati): riprovo tra poco';
    }).then(() => { loadingStream = false; refreshRiverUI(); });
  }
  // Punti campione lungo i fiumi (uno ogni 25–120 m), con distanza, direzione, quota dell'acqua e visibilità
  function buildRivers() {
    if (S.lat === null) return;
    const P = (S.dem && DEM.prof) ? DEM.prof : null;
    const gen = P ? DEM.gen : -1;
    if (riverAt && riverGen === gen && riverBuilt === riverData && geo(riverAt.lat, riverAt.lon, S.lat, S.lon).d < 120) return;
    riverAt = { lat: S.lat, lon: S.lon }; riverGen = gen; riverBuilt = riverData;
    const RR = Math.min(S.radius, 25000), old = {};
    for (const r of rivers) old[r.item.id] = r.item;
    const out = [];
    const all = riverRaw.map((r) => ({ r: r, s: false })).concat(F.stream ? streamRaw.map((r) => ({ r: r, s: true })) : []);
    for (const w of all) {
      const r = w.r, R = w.s ? Math.min(RR, STREAM_R) : RR;
      const smp = [];
      let nVis = 0;
      const add = (lon, lat) => {
        const g0 = geo(S.lat, S.lon, lat, lon);
        if (g0.d > R || g0.d < 150) return;
        let g = null, vis = false;
        if (P && g0.d <= P.R) {
          g = demGet(lat, lon, demZoomFor(g0.d));
          if (g !== null) {
            const lim = g0.d - Math.max(80, g0.d * 0.02);   // le sponde subito davanti all'acqua non contano
            vis = lim < DEM_NEAR || demOccl(P, g0.b, lim) <= angTo(g + 1, g0.d, P.obs) + 0.05;
          }
        }
        if (vis) nVis++;
        smp.push({ lat: lat, lon: lon, d: g0.d, b: g0.b, g: g, vis: vis });
      };
      for (const L of r.lines) {
        for (let i = 0; i + 3 < L.length; i += 2) {
          const lo0 = L[i], la0 = L[i + 1], lo1 = L[i + 2], la1 = L[i + 3];
          // passo dei campioni: fitto vicino (25 m), più largo lontano (fino a 120 m): sempre meno di 1° di direzione
          const dm = geo(S.lat, S.lon, (la0 + la1) / 2, (lo0 + lo1) / 2).d;
          const n = Math.max(1, Math.ceil(geo(la0, lo0, la1, lo1).d / Math.max(25, Math.min(120, dm / 100))));
          for (let k = 0; k < n; k++) add(lo0 + (lo1 - lo0) * k / n, la0 + (la1 - la0) * k / n);
        }
        if (L.length >= 2) add(L[L.length - 2], L[L.length - 1]);
      }
      if (!smp.length) continue;
      const id = (w.s ? 's:' : 'r:') + r.n;
      const item = old[id] || { id: id, n: r.n, t: w.s ? 'stream' : 'river', lat: 0, lon: 0, e: null, d: 0, b: 0 };
      out.push({ n: r.n, s: w.s, lines: r.lines, smp: smp, nVis: nVis, item: item });
    }
    rivers = out;
    refreshRiverUI();
    riverMapUpdate();
  }
  // Fiumi da mettere sulla fotocamera: per ognuno il punto visibile più vicino al centro dell'inquadratura
  function riverCands(heading, halfH) {
    const out = [];
    if (!F.river || !S.dem || !DEM.prof) return out;
    buildRivers();
    for (const r of rivers) {
      if (!r.nVis) continue;
      let best = null, bk = Infinity;
      for (const s of r.smp) {
        if (!s.vis) continue;
        const a = Math.abs(norm180(s.b - heading));
        if (a > halfH) continue;
        const k = a + s.d / 20000;   // a parità di direzione, il tratto più vicino
        if (k < bk) { bk = k; best = s; }
      }
      if (!best) continue;
      const it = r.item;
      it.lat = best.lat; it.lon = best.lon; it.d = best.d; it.b = best.b; it.e = best.g; it.ge = best.g;
      it.skip = false; it.hid = false;
      it.score = TYPE_WEIGHT[it.t] / Math.sqrt(Math.max(best.d, 300) / 1000);
      out.push({ it: it, rel: norm180(best.b - heading) });
    }
    return out;
  }
  function riverMapUpdate() {
    if (!mapReady || !map.getSource('rivers')) return;
    const feats = !F.river ? [] : rivers.map((r) => ({ type: 'Feature', properties: { n: r.n, s: !!r.s },
      geometry: { type: 'MultiLineString', coordinates: r.lines.map((L) => { const c = []; for (let i = 0; i + 1 < L.length; i += 2) c.push([L[i], L[i + 1]]); return c; }) } }));
    map.getSource('rivers').setData({ type: 'FeatureCollection', features: feats });
  }
  function refreshRiverUI() {
    const n = rivers.filter((r) => !r.s).length, ns = rivers.length - n;
    setText('nRiver', n ? String(n) : '');
    setText('nStream', F.stream && ns ? String(ns) : '');
    setText('streamNote', F.stream && streamNote ? streamNote : 'solo con nome, lunghi almeno 3 km, entro 10 km');
    const base = 'il nome dove lo sguardo incrocia il fiume, se si vede';
    setText('riverNote', riverNote ? riverNote : (!S.dem ? 'sulla fotocamera serve il rilievo del terreno; ora solo sulla mappa' : base));
  }
  window.__panoRivers = () => rivers;
