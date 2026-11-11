/* Orientis – Mini-mappa (MapLibre), foto satellitare, ricerca dei Comuni.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- Mini-mappa (MapLibre GL) ---------- */
  const MAPLIBRE = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl';
  let map = null, mapReady = false, mapLoading = false, mapFailed = false;
  let follow = true, full = false, selId = null, aimId = null, markers = [];

  function loadMapLib(cb) {
    if (window.maplibregl) { cb(); return; }
    if (mapLoading) return;
    mapLoading = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = MAPLIBRE + '.css';
    document.head.appendChild(l);
    const s = document.createElement('script');
    s.src = MAPLIBRE + '.js';
    s.onload = cb;
    s.onerror = () => { mapLoading = false; };
    document.head.appendChild(s);
  }

  function dest(lat, lon, brg, dist) {
    const d = dist / EARTH, b = brg * RAD, p1 = lat * RAD, l1 = lon * RAD;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [l2 / RAD, p2 / RAD];
  }

  function sector(lat, lon, a0, a1, R) {
    const pts = [[lon, lat]];
    const n = Math.max(2, Math.ceil((a1 - a0) / 5));
    for (let i = 0; i <= n; i++) pts.push(dest(lat, lon, a0 + (a1 - a0) * i / n, R));
    pts.push([lon, lat]);
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
  }

  function tryInitMap() {
    if (map || mapFailed || !window.maplibregl || S.lat === null) return;
    const g = window.maplibregl;
    try {
      map = new g.Map({
        container: 'miniMap',
        style: {
          version: 8,
          sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 } },
          layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#d9ded8' } },
            { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.35 } }]
        },
        center: [S.lon, S.lat], zoom: 10,
        attributionControl: false, dragRotate: false, pitchWithRotate: false
      });
    } catch (e) { map = null; mapFailed = true; return; }  // WebGL non disponibile: la mappa non compare
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      const empty = { type: 'FeatureCollection', features: [] };
      for (const id of ['sunsweep', 'sunrise', 'sunset', 'fan', 'cone', 'acc', 'me', 'rivers']) map.addSource(id, { type: 'geojson', data: empty });
      // v27: fiumi con nome, sotto il cono
      // v38: foto satellitare (sopra la mappa OSM, sotto tutto il resto) e confine del Comune cercato
      map.addSource('sat', SAT_SRC());
      map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150 } });
      map.addSource('comB', { type: 'geojson', data: empty });
      map.on('error', satOnError);
      map.addLayer({ id: 'comB', type: 'line', source: 'comB', paint: { 'line-color': '#e8590c', 'line-width': 2.2, 'line-dasharray': [3, 1.5], 'line-opacity': 0.9 } });
      map.addLayer({ id: 'rivers', type: 'line', source: 'rivers', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2b86c5', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['get', 's'], 0.7, 1.2], 15, ['case', ['get', 's'], 1.8, 3]], 'line-opacity': 0.85 } });
      map.addLayer({ id: 'sunsweep', type: 'fill', source: 'sunsweep', paint: { 'fill-color': '#ffd166', 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'sunrise', type: 'line', source: 'sunrise', paint: { 'line-color': '#ff9f1c', 'line-width': 3, 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'sunset', type: 'line', source: 'sunset', paint: { 'line-color': '#e4572e', 'line-width': 3, 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'fan', type: 'fill', source: 'fan', paint: { 'fill-color': '#8fd3ff', 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'cone', type: 'fill', source: 'cone', paint: { 'fill-color': '#ffc928', 'fill-opacity': 0.34 } });
      map.addLayer({ id: 'coneLine', type: 'line', source: 'cone', paint: { 'line-color': '#e0a800', 'line-width': 1, 'line-opacity': 0.6 } });
      // v26: cerchio della precisione del GPS (si vede soprattutto sulla mappa grande, da vicino)
      map.addLayer({ id: 'acc', type: 'fill', source: 'acc', paint: { 'fill-color': '#0a84ff', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'accLine', type: 'line', source: 'acc', paint: { 'line-color': '#0a84ff', 'line-width': 1, 'line-opacity': 0.55 } });
      map.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': '#1d1d1f', 'circle-stroke-width': 1.4 } });
      mapReady = true;
      $('miniWrap').hidden = false;
      document.body.classList.add('hasmap');
      map.dragPan.disable(); map.scrollZoom.disable(); map.touchZoomRotate.disable(); map.doubleClickZoom.disable();
      // v30: nella Mappa il tocco sceglie un punto; in Guarda il tondo si allarga dentro la scheda
      map.on('click', (e) => {
        if (full && tabNow() === 'mappa') { ptSet(e.lngLat.lat, e.lngLat.lng, 'mappa'); return; }
        if (!full && tabNow() === 'guarda' && !inSheet) setInSheet(true);
      });
      if (tabNow() === 'mappa') mapEnter();
      syncMarkers();
      riverMapUpdate();
      updateMap();
    });
    map.on('dragstart', () => setFollow(false));
    map.on('move', () => { if (catOn() && CATT.mode === 'img') catPlace(); });
    map.on('moveend', () => { if (catOn()) catUpdate(); });
    window.__panoMap = map;
  }

  // v24: livello catasto. Le immagini delle particelle (WMS dell'Agenzia delle Entrate) si possono mostrare anche se il
  // servizio non permette di leggerne i dati al sito: le si mette sopra la mappa grande (che lì non ruota) e le si sposta con lei.
  const CATL = { img: null, box: null, t: 0 };
  function catOn() { return !!S.catLayer && full && mapReady; }
  function catPlace() {
    if (!CATL.img || !CATL.box) return;
    const a = map.project([CATL.box[0], CATL.box[3]]), b = map.project([CATL.box[2], CATL.box[1]]);
    const st = CATL.img.style;
    st.left = a.x + 'px'; st.top = a.y + 'px'; st.width = (b.x - a.x) + 'px'; st.height = (b.y - a.y) + 'px';
  }
  function catHint(t) { $('catHint').hidden = !t; $('catHint').textContent = t || ''; if (t && tabNow() === 'mappa') mapHint(t); }
  // v37: consiglio d'uso in basso sulla mappa (come «Tocca il paesaggio»): 4 secondi, lo stesso testo non torna prima di 40 s
  const MH = { t: 0, seen: {} };
  function mapHint(t) {
    if (!t || !full || tabNow() !== 'mappa') return;
    const now = Date.now();
    if (MH.seen[t] && now - MH.seen[t] < 40000) return;
    MH.seen[t] = now;
    const h = $('mapHint'), mc = $('mapCard');
    h.textContent = t;
    h.style.bottom = ((mc && !mc.hidden ? mc.offsetHeight : 0) + 18) + 'px';
    clearTimeout(MH.t);
    h.hidden = false; h.classList.remove('off');
    MH.t = setTimeout(() => { h.classList.add('off'); MH.t = setTimeout(() => { h.hidden = true; }, 700); }, 4000);
  }

  /* ---------- v38: foto satellitare ----------
     Di serie Sentinel-2 cloudless di EOX (aperta, circa 10 m, uso non commerciale con citazione).
     Con una chiave Esri (account sviluppatore ArcGIS gratuito) si usa World Imagery, molto più dettagliata. */
  // Chiave API di ArcGIS Location Platform: NON sta nel codice (il repository è pubblico). Si incolla una volta nelle Impostazioni
  // e resta solo su quel telefono (S.esriKey). Se Esri non risponde (chiave scaduta, quota esaurita) si torna a EOX.
  // v40: di serie le foto Esri passano dal proxy Cloudflare, che tiene la chiave come segreto (ESRI_KEY): nessuno deve incollarla.
  // Il proxy dice se ce l'ha rispondendo «orientis 3 esri» a /ping. Una chiave incollata nelle Impostazioni ha la precedenza.
  let ESRI_KEY = '', ESRI_PROXY = false, esriPing = 0;   // 0 da chiedere, 1 in corso, 2 fatto
  const esriOn = () => !!ESRI_KEY || ESRI_PROXY;
  function satRebuild() {
    if (mapReady && map.getSource('sat')) { try { map.removeLayer('sat'); map.removeSource('sat'); map.addSource('sat', SAT_SRC()); map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150 } }, 'comB'); } catch (er) {} }
    satApply();
  }
  function esriSet(k) {
    k = String(k || '').trim();
    if (k === ESRI_KEY) return;
    ESRI_KEY = k; satErr = 0;
    satRebuild();
  }
  async function esriProxyCheck() {
    if (esriPing) return;
    esriPing = 1;
    let yes = false;
    try {
      const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 5000);
      const r = await fetch(CAT_BASE + '/ping', { cache: 'no-store', signal: ac.signal });
      clearTimeout(tm);
      const t = r.ok ? await r.text() : '';
      yes = /^orientis \d+ esri/.test(t);
    } catch (e) { /* senza proxy: foto EOX */ }
    esriPing = 2;
    if (yes && !ESRI_PROXY) { ESRI_PROXY = true; satErr = 0; satRebuild(); } else satApply();
  }
  const SAT_YEARS = ['2024', '2023', '2021'];   // se un anno non risponde si passa al precedente
  let satY = 0, satErr = 0;
  function SAT_SRC() {
    if (ESRI_KEY) return { type: 'raster', tiles: ['https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=' + ESRI_KEY], tileSize: 256, maxzoom: 19 };
    if (ESRI_PROXY) return { type: 'raster', tiles: [CAT_BASE + '/esri/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 };
    return { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-' + SAT_YEARS[satY] + '_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 15 };
  }
  function satAttr() {
    const y = SAT_YEARS[satY];
    return esriOn() ? 'Foto: Powered by Esri · Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      : 'Foto: <a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless ' + y + '</a> by EOX IT Services GmbH (contiene dati Copernicus Sentinel ' + y + ' modificati), licenza CC BY-NC-SA 4.0';
  }
  // anno non disponibile: dopo qualche errore dei tasselli satellitari si prova l'anno precedente
  function satOnError(e) {
    if (!e || e.sourceId !== 'sat') return;
    if (ESRI_KEY) { if (++satErr < 6) return; satErr = 0; ESRI_KEY = ''; }
    else if (ESRI_PROXY) { if (++satErr < 6) return; satErr = 0; ESRI_PROXY = false; }
    else { if (satY >= SAT_YEARS.length - 1 || ++satErr < 4) return; satErr = 0; satY++; }
    try { map.removeLayer('sat'); map.removeSource('sat'); map.addSource('sat', SAT_SRC()); map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150 } }, 'comB'); satApply(); } catch (er) {}
  }
  function satApply() {
    const on = !!S.sat && full && tabNow() === 'mappa';
    if (on && esriPing < 2 && !ESRI_KEY) { esriProxyCheck(); }   // la foto si mostra quando si sa da dove prenderla
    $('satBtn').setAttribute('aria-pressed', String(!!S.sat));
    document.body.classList.toggle('sat', on);
    if (!mapReady || !map.getLayer('sat')) return;
    const v = on && (esriPing === 2 || ESRI_KEY) ? 'visible' : 'none';
    if (map.getLayoutProperty('sat', 'visibility') !== v) map.setLayoutProperty('sat', 'visibility', v);
    const sh = $('miniAttr').querySelector('.s');
    if (sh) sh.innerHTML = on ? (esriOn() ? 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> · Maxar, Earthstar Geographics' : '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless ' + SAT_YEARS[satY] + '</a> · Copernicus') : '© OSM';
  }
  $('esriKey').addEventListener('change', () => { S.esriKey = $('esriKey').value.trim(); saveSettings(); esriSet(S.esriKey); });
  $('satBtn').addEventListener('click', (e) => {
    e.stopPropagation(); S.sat = !S.sat; saveSettings(); satApply();
    if (S.sat && !esriOn() && mapReady && map.getZoom() > 15) mapHint('Foto satellitare con poco dettaglio da vicino (circa 10 m).');
  });

  /* ---------- v38: ricerca dei Comuni per nome ---------- */
  const FIND = { idx: null, state: 'idle' };
  const fNorm = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  async function findLoad() {
    if (FIND.idx || FIND.state === 'loading') return;
    FIND.state = 'loading';
    try { FIND.idx = (await cachedJson('comuni/indice.json?v=38')).c.map((r) => r.concat([fNorm(r[0].replace('/', ' '))])); FIND.state = 'ok'; } catch (e) { FIND.state = 'err'; }
    findRender();
  }
  function findRender() {
    const q = fNorm($('findIn').value), L = $('findList');
    if (!FIND.idx) { L.innerHTML = '<p>' + (FIND.state === 'err' ? 'Elenco dei Comuni non disponibile ora (serve la rete la prima volta).' : 'Carico l’elenco dei Comuni…') + '</p>'; return; }
    if (q.length < 2) { L.innerHTML = '<p>Scrivi almeno due lettere del nome.</p>'; return; }
    const a = [], b = [];
    for (const r of FIND.idx) {
      const n = r[6];
      if (n.startsWith(q)) a.push(r); else if (n.includes(' ' + q) || (q.length >= 3 && n.includes(q))) b.push(r);
    }
    const res = a.concat(b).slice(0, 12);
    L.innerHTML = res.length ? res.map((r) => '<button type="button" role="option" data-i="' + r[2] + '">' + escHtml(r[0]) + '<span>' + r[1] + '</span></button>').join('')
      : '<p>Nessun Comune con questo nome.</p>';
  }
  function findOpen(on) {
    $('findBox').hidden = !on;
    $('findBtn').setAttribute('aria-expanded', String(on));
    if (on) { mapInfoOpen(false); findLoad(); findRender(); setTimeout(() => $('findIn').focus(), 50); }
    else $('findIn').blur();
  }
  async function findGo(istat) {
    const r = FIND.idx && FIND.idx.find((x) => x[2] === istat);
    if (!r) return;
    findOpen(false);
    setFollow(false);
    let c = null;
    try {
      if (!COM.data[r[3]]) COM.data[r[3]] = (await cachedJson('comuni/R' + r[3] + '.json')).c;
      c = COM.data[r[3]].find((x) => x[2] === istat);
    } catch (e) { c = null; }
    if (mapReady) {
      if (c) {
        const ring = (q) => { const o = []; for (let i = 0; i < q.length; i += 2) o.push([q[i] / 1e4, q[i + 1] / 1e4]); return o; };
        map.getSource('comB').setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: c[5].flatMap((pl) => pl.map(ring)) } });
        const mc = $('mapCard');
        map.fitBounds([[c[4][0], c[4][1]], [c[4][2], c[4][3]]], { padding: { top: 70, left: 40, right: 60, bottom: (mc && !mc.hidden ? mc.offsetHeight : 160) + 20 }, maxZoom: 15, duration: 600 });
      } else map.jumpTo({ center: [r[5], r[4]], zoom: 12 });
    }
    ptSet(r[4], r[5], 'mappa', { name: r[0], type: 'comune' });
  }
  $('findBtn').addEventListener('click', (e) => { e.stopPropagation(); findOpen($('findBox').hidden); });
  $('findX').addEventListener('click', (e) => { e.stopPropagation(); findOpen(false); });
  $('findBox').addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('button[data-i]'); if (b) findGo(b.dataset.i); });
  $('findIn').addEventListener('input', findRender);
  $('findIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('findList').querySelector('button[data-i]'); if (b) findGo(b.dataset.i); } if (e.key === 'Escape') findOpen(false); });
  window.__panoFind = (q) => { $('findIn').value = q; findRender(); };
  // v37: note della mappa (prescrizioni) dietro al tasto «i»
  function mapInfoHtml() {
    const row = (sw, t) => '<dt style="' + sw + '"></dt><dd>' + t + '</dd>';
    return '<h4>Note sulla mappa</h4><dl>' +
      row('background:rgba(10,132,255,.18);border:1px solid #0a84ff;border-radius:50%', '<b>Cerchio azzurro</b>: l’errore possibile del GPS attorno alla tua posizione.') +
      row('background:rgba(255,201,40,.5);border:1px solid #e0a800', '<b>Cono giallo</b>: dove guarda la fotocamera; la fascia celeste è l’incertezza della bussola. Si spegne con «Cono».') +
      row('background:#fff;border:1px solid #888', '<b>Catasto</b> (Agenzia delle Entrate): indicativo, può essere spostato di alcuni metri rispetto alla mappa. Non ha valore di certificato.') +
      row('background:#d9480f', '<b>Frane e alluvioni</b>: mosaicatura nazionale dei PAI (ISPRA), indicativa: fanno fede il piano dell’Autorità di bacino e le sue norme.') +
      row('background:var(--line)', 'Mappa © OpenStreetMap contributors · rilievo Terrarium (Mapzen/AWS).') +
      row('background:#3d5a40', satAttr() + '. Comuni e confini: ISTAT.') +
      '</dl><button type="button" class="mi-close" id="mapInfoClose">Chiudi</button>';
  }
  function mapInfoOpen(on) {
    const el = $('mapInfo');
    if (on) el.innerHTML = mapInfoHtml();
    el.hidden = !on;
    $('mapInfoBtn').setAttribute('aria-expanded', String(on));
  }
  $('mapInfoBtn').addEventListener('click', (e) => { e.stopPropagation(); if ($('mapInfo').hidden) findOpen(false); mapInfoOpen($('mapInfo').hidden); });
  $('mapInfo').addEventListener('click', (e) => { e.stopPropagation(); if (e.target.id === 'mapInfoClose') mapInfoOpen(false); });
  // v31: col server aggiornato («/tile») il catasto arriva a tasselli, come la mappa: più veloce, e i tasselli già visti
  // restano nella memoria del server e del telefono. Col server di prima resta l'immagine unica.
  const CAT_BASE = 'https://orientis-catasto.filippotiso.workers.dev';
  const CATT = { mode: null, checking: false };
  async function catCheckTiles() {
    if (CATT.mode || CATT.checking) return;
    CATT.checking = true;
    try {
      const r = await fetch(CAT_BASE + '/ping', { cache: 'no-store' });
      const t = r.ok ? await r.text() : '';
      CATT.mode = /^orientis/.test(t) ? 'tiles' : 'img';
    } catch (e) { CATT.mode = 'img'; }
    CATT.checking = false;
    catUpdate();
  }
  function catTiles(on) {
    if (!mapReady) return;
    if (on && !map.getSource('catT')) {
      map.addSource('catT', { type: 'raster', tiles: [CAT_BASE + '/tile/{z}/{x}/{y}.png'], tileSize: 256, minzoom: 15, maxzoom: 19 });
      map.addLayer({ id: 'catT', type: 'raster', source: 'catT', minzoom: 15.5, paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 150 } }, 'rivers');
    }
    if (map.getLayer('catT')) map.setLayoutProperty('catT', 'visibility', on ? 'visible' : 'none');
  }
  window.__panoCatMode = () => CATT.mode;
  function catUpdate() {
    $('catBtn').setAttribute('aria-pressed', String(!!S.catLayer));
    $('catNote').hidden = !catOn();
    if (!catOn()) { if (CATL.img) CATL.img.style.display = 'none'; catTiles(false); catHint(''); return; }
    if (!CATT.mode) { catCheckTiles(); return; }
    if (CATT.mode === 'tiles') {
      if (CATL.img) CATL.img.style.display = 'none';
      catTiles(true);
      catHint(map.getZoom() < 15.5 ? 'Avvicina la mappa per vedere le particelle catastali.' : '');
      return;
    }
    if (!CATL.img) {
      CATL.img = document.createElement('img');
      CATL.img.id = 'catImg'; CATL.img.alt = '';
      CATL.img.addEventListener('load', () => { CATL.img.style.display = 'block'; catHint(''); });
      CATL.img.addEventListener('error', () => { CATL.img.style.display = 'none'; catHint(navigator.onLine ? 'Mappa catastale non disponibile ora (servizio dell’Agenzia).' : 'Per il catasto serve la rete.'); });
      map.getCanvasContainer().appendChild(CATL.img);
    }
    if (map.getZoom() < 15.5) { CATL.img.style.display = 'none'; catHint('Avvicina la mappa per vedere le particelle catastali.'); return; }
    const c = map.getContainer(), bb = map.getBounds();
    const r = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(2048, Math.round(c.clientWidth * r)), h = Math.min(2048, Math.round(c.clientHeight * r));
    const box = [bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()];
    const tol = (box[2] - box[0]) * 0.03;
    if (CATL.box && CATL.img.src && box.every((v, i) => Math.abs(v - CATL.box[i]) < tol)) { catPlace(); return; }   // vista quasi uguale: niente nuova immagine
    CATL.box = box;
    CATL.img.src = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap' +
      '&SRS=EPSG:4258&BBOX=' + box.map((v) => v.toFixed(6)).join(',') + '&WIDTH=' + w + '&HEIGHT=' + h +
      '&LAYERS=CP.CadastralZoning,CP.CadastralParcel&STYLES=&FORMAT=image/png&TRANSPARENT=true';
    catPlace();
    catHint('Caricamento delle particelle…');
  }
  function setCatLayer(v) {
    S.catLayer = !!v; saveSettings(); refreshSettingsUI(); catUpdate();
  }
  $('catBtn').addEventListener('click', (e) => { e.stopPropagation(); setCatLayer(!S.catLayer); });
  $('catLayer').addEventListener('change', () => setCatLayer($('catLayer').checked));
  // «Mappa» nel Punto di ripresa: mappa grande centrata su di te, vicina, col catasto acceso
  $('spCatMap').addEventListener('click', () => openCatMap(S.lat, S.lon));
  // v30: Mappa vicina col catasto acceso, centrata su un punto
  function openCatMap(lat, lon) {
    if (!mapReady) { toast('La mappa non è ancora pronta.', 2500); return; }
    setSheet(false);
    S.catLayer = true; saveSettings();
    setTab('mappa');
    if (!full) setFull(true);
    setFollow(false);
    requestAnimationFrame(() => { if (map) { map.jumpTo({ center: [lon, lat], zoom: 17.5, bearing: 0 }); catUpdate(); } });
  }

  function setFollow(v) {
    follow = v;
    $('miniCenter').hidden = v;
    if (v) updateMap();
  }

  function updateMap() {
    if (!mapReady || S.lat === null) return;
    sunMapUpdate();
    const hd = (S.heading === null) ? 0 : trueHeading();
    if (follow) map.jumpTo({ center: [S.lon, S.lat], bearing: full ? 0 : hd });
    const mpp = 78271.517 * Math.cos(S.lat * RAD) / Math.pow(2, map.getZoom());
    const c = map.getContainer();
    const R = mpp * Math.max(c.clientWidth, c.clientHeight) * 0.9;
    const W = window.innerWidth, H = window.innerHeight;
    const halfH = Math.atan(tanVis() * W / H) / RAD;
    const acc = (S.compAcc !== null && S.compAcc >= 0) ? S.compAcc : 20;
    if (S.heading === null) return;
    map.getSource('cone').setData(sector(S.lat, S.lon, hd - halfH, hd + halfH, R));
    map.getSource('fan').setData(sector(S.lat, S.lon, hd - halfH - acc, hd + halfH + acc, R));
    if (S.gpsAcc) {
      const ring = [];
      for (let i = 0; i <= 72; i++) ring.push(dest(S.lat, S.lon, i * 5, S.gpsAcc));
      map.getSource('acc').setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} });
    }
    map.getSource('me').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [S.lon, S.lat] }, properties: {} });
  }


  function syncMarkers() {
    if (!mapReady) return;
    markers.forEach((m) => m.marker.remove());
    markers = [];
    const list = items.filter((it) => it.d !== undefined && visible(it)).sort((a, b) => b.score - a.score).slice(0, 40);
    for (const it of list) {
      const el = document.createElement('div');
      el.className = 'mk' + (LAND_TYPES[it.t] ? ' land' : it.t === 'peak' ? ' peak' : '');
      el.style.setProperty('--ic', typeColor(it.t));
      const mi = document.createElement('i');
      mi.innerHTML = iconSvg(it.t, 10);
      el.appendChild(mi);
      const sp = document.createElement('span');
      sp.textContent = it.n;
      el.appendChild(sp);
      el.addEventListener('click', (e) => { e.stopPropagation(); selectItem(it); });
      const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([it.lon, it.lat]).addTo(map);
      markers.push({ id: it.id, el: el, marker: marker });
    }
    refreshMarkerClasses();
  }

  function refreshMarkerClasses() {
    for (const m of markers) {
      m.el.classList.toggle('sel', m.id === selId);
      m.el.classList.toggle('aim', m.id === aimId);
    }
  }

  function setFull(v) {
    full = v;
    $('miniWrap').classList.toggle('full', v);
    document.body.classList.toggle('mapfull', v);
    $('miniExpand').textContent = v ? '✕' : '⤢';
    if (map) {
      for (const h of [map.dragPan, map.scrollZoom, map.touchZoomRotate, map.doubleClickZoom]) { if (v) h.enable(); else h.disable(); }
      if (v) map.touchZoomRotate.disableRotation();
    }
    if (!v) { $('miniCard').hidden = true; selId = null; refreshMarkerClasses(); }
    setFollow(true);
    requestAnimationFrame(() => { if (map) { map.resize(); updateMap(); catUpdate(); lyUpdate(); } });
  }

  function selectItem(it) {
    selId = it.id;
    refreshMarkerClasses();
    if (!full) setFull(true);
    setFollow(false);
    $('miniCard').hidden = false;
    $('mapCard').hidden = true;
    $('miniCardBack').textContent = tabNow() === 'mappa' ? 'Chiudi' : 'Torna alla camera';
    $('miniCardName').textContent = it.n;
    $('miniCardInfo').textContent = TYPE_LABEL[it.t] + ', ' + fmtDist(it.d) + ', direzione ' + Math.round(it.b) + '°' +
      (it.e !== null && it.e !== undefined ? ', quota ' + Math.round(it.e) + ' m' : '');
    requestAnimationFrame(() => { if (map) { map.resize(); map.jumpTo({ center: [it.lon, it.lat], bearing: 0 }); } });
  }

  $('miniExpand').addEventListener('click', () => { if (inSheet) setInSheet(false); else setFull(!full); });
  $('miniCenter').addEventListener('click', () => setFollow(true));
  $('miniCardBack').addEventListener('click', () => {
    if (tabNow() === 'mappa') { $('miniCard').hidden = true; selId = null; refreshMarkerClasses(); updateMapCard(); setFollow(true); }
    else setFull(false);
  });
  $('labels').addEventListener('click', (e) => {
    const p = e.target.closest('.pill');
    if (!p) return;
    const it = items.find((x) => String(x.id) === p.dataset.id) || rivers.map((r) => r.item).find((x) => x.id === p.dataset.id);
    if (it) { if (mapReady) setTab('mappa'); selectItem(it); }
  });
