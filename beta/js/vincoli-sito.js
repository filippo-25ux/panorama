/* Orientis – Vincoli (frane e alluvioni), Sito ed Energia, Clima futuro.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- v35: Vincoli · frane e alluvioni (ISPRA, mosaicatura nazionale dei PAI; inventario IFFI) ----------
     Servizi ArcGIS di ISPRA in Web Mercator: la mappa li carica a tasselli; nel punto si chiede la classe con «identify».
     Dati: ISPRA (CC BY-SA 4.0), dalle Autorità di bacino distrettuali. Indicativi: fanno fede il PAI vigente e le sue norme. */
  const ISPRA = 'https://sinacloud.isprambiente.it/arcgisina/rest/services/';
  const IDRO = {
    fr: { svc: 'PAI_Frane/Aree_pericolosita_frana_PAI', name: 'Frane (PAI)' },
    al: { svc: 'Alluvioni/Aree_pericolosita_idraulica_', name: 'Alluvioni (PAI)' },
    iffi: { svc: 'iffi/Progetto_IFFI_WMS_public', name: 'Frane censite (IFFI)' },
    ifr: { svc: 'PAI_Frane/PAI_Indicatori_rischio_2025', name: 'Indicatori frane' },
    ial: { svc: 'Alluvioni/Popolazione_rischio_alluvioni', name: 'Indicatori alluvioni' }
  };
  function idroTiles(k) {
    return ISPRA + IDRO[k].svc + '/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&dpi=96&f=image';
  }
  let lyErr = 0;
  function lyUpdate() {
    $('lyFr').setAttribute('aria-pressed', String(!!S.lyFr));
    $('lyAl').setAttribute('aria-pressed', String(!!S.lyAl));
    $('lyCone').setAttribute('aria-pressed', String(!S.coneOff));
    if (!mapReady) return;
    satApply();
    const cv = S.coneOff && full && tabNow() === 'mappa' ? 'none' : 'visible';
    for (const id of ['cone', 'coneLine', 'fan']) if (map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== cv) map.setLayoutProperty(id, 'visibility', cv);
    for (const [k, on] of [['fr', S.lyFr && full], ['al', S.lyAl && full]]) {
      const id = 'ly_' + k;
      if (on && !map.getSource(id)) {
        map.addSource(id, { type: 'raster', tiles: [idroTiles(k)], tileSize: 256, minzoom: 9, maxzoom: 18 });
        map.addLayer({ id: id, type: 'raster', source: id, minzoom: 9, paint: { 'raster-opacity': 0.62, 'raster-fade-duration': 150 } }, map.getLayer('catT') ? 'catT' : 'rivers');
      }
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    }
    const any = (S.lyFr || S.lyAl) && full;
    $('lyNote').hidden = !any;
    if (any) setText('lyNote', (map.getZoom() < 9 ? 'Avvicina la mappa per vedere frane e alluvioni. ' : '') +
      (lyErr > 3 ? 'Il servizio ISPRA non risponde ora. ' : '') + 'PAI (ISPRA): indicativo, fanno fede il piano e le sue norme.');
    legRender();
  }

  // v37: legenda dei livelli accesi, con i colori presi dal servizio ISPRA (legend); se non risponde, solo le classi
  const LEG = { fr: null, al: null, t: {} };
  const LEG_LBL = { fr: { P4: 'molto elevata', P3: 'elevata', P2: 'media', P1: 'moderata', AA: 'attenzione' }, al: { P3: 'elevata', P2: 'media', P1: 'bassa' } };
  const LEG_ORD = { fr: ['P4', 'P3', 'P2', 'P1', 'AA'], al: ['P3', 'P2', 'P1'] };
  async function legLoad(k) {
    if (LEG.t[k] && Date.now() - LEG.t[k] < 60000) return;
    LEG.t[k] = Date.now();
    try {
      const j = await wjson(ISPRA + IDRO[k].svc + '/MapServer/legend?f=json', 12000);
      const seen = new Map();
      for (const lay of (j && j.layers) || []) for (const it of lay.legend || []) {
        const c = findCls([{ value: String(it.label || '') + ' ' + String(lay.layerName || '') }]);
        if (!c || !LEG_LBL[k][c.cls] || seen.has(c.cls)) continue;
        seen.set(c.cls, it.imageData ? 'data:' + (it.contentType || 'image/png') + ';base64,' + it.imageData : '');
      }
      if (seen.size) LEG[k] = LEG_ORD[k].filter((c) => seen.has(c)).map((c) => ({ c: c, img: seen.get(c) }));
    } catch (e) { /* resta la legenda senza colori */ }
    legRender();
  }
  function legRender() {
    const el = $('mcLeg');
    const ks = [];
    if (S.lyFr) ks.push('fr');
    if (S.lyAl) ks.push('al');
    if (!ks.length) { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; } return; }
    let h = '';
    for (const k of ks) {
      if (!LEG[k]) legLoad(k);
      const items = LEG[k] || LEG_ORD[k].map((c) => ({ c: c, img: '' }));
      h += '<div class="lgRow"><b>' + (k === 'fr' ? 'Frane PAI' : 'Alluvioni PAI') + '</b>' +
        items.map((it) => '<span>' + (it.img ? '<img alt="" src="' + it.img + '">' : '<i></i>') + it.c + ' ' + LEG_LBL[k][it.c] + '</span>').join('') + '</div>';
    }
    if (mapReady && map.getZoom() < 9) mapHint('Avvicina la mappa per vedere frane e alluvioni.');
    if (lyErr > 3) mapHint('Il servizio ISPRA non risponde ora: riprova più tardi.');
    if (el.innerHTML !== h) el.innerHTML = h;
    el.hidden = false;
  }
  $('lyFr').addEventListener('click', (e) => { e.stopPropagation(); S.lyFr = !S.lyFr; saveSettings(); lyUpdate(); });
  $('lyAl').addEventListener('click', (e) => { e.stopPropagation(); S.lyAl = !S.lyAl; saveSettings(); lyUpdate(); });
  $('lyCone').addEventListener('click', (e) => { e.stopPropagation(); S.coneOff = !S.coneOff; saveSettings(); lyUpdate(); });
  setInterval(() => { if (tabNow() === 'mappa') lyUpdate(); }, 1500);

  // Classe di pericolosità nel punto: si cerca «P1…P4» o «AA» (aree di attenzione) nella risposta del servizio
  const PCLS = { P4: 'molto elevata', P3: 'elevata', P2: 'media', P1: 'moderata', AA: 'area di attenzione' };
  const ACLS = { P3: 'elevata (alluvioni frequenti)', P2: 'media (alluvioni poco frequenti)', P1: 'bassa (scenario raro)' };
  function findCls(res) {
    for (const r of res || []) {
      const vals = [r.value].concat(Object.values(r.attributes || {})).map((v) => String(v == null ? '' : v));
      for (const v of vals) {
        const m = /\b(P\s?[1-4]|AA)\b/i.exec(v);
        if (m) return { cls: m[1].replace(/\s/g, '').toUpperCase(), raw: v };
      }
      for (const v of vals) {
        if (/molto elevata/i.test(v)) return { cls: 'P4', raw: v };
        if (/elevata/i.test(v)) return { cls: 'P3', raw: v };
        if (/media/i.test(v)) return { cls: 'P2', raw: v };
        if (/moderata|bassa/i.test(v)) return { cls: 'P1', raw: v };
        if (/attenzione/i.test(v)) return { cls: 'AA', raw: v };
      }
    }
    return null;
  }
  async function idroIdentify(k, lat, lon, tolPx, layers, geom) {
    const d = 0.01;
    const q = 'geometry=' + encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } })) +
      '&geometryType=esriGeometryPoint&sr=4326&layers=' + encodeURIComponent(layers || 'all') + '&tolerance=' + (tolPx || 1) +
      '&mapExtent=' + [lon - d, lat - d, lon + d, lat + d].join(',') + '&imageDisplay=400,400,96&returnGeometry=' + (geom ? 'true' : 'false') + '&f=json';
    const j = await wjson(ISPRA + IDRO[k].svc + '/MapServer/identify?' + q, 12000);
    if (j && j.error) throw new Error(j.error.message || 'errore');
    return (j && j.results) || [];
  }
  const VIN = { cache: new Map() };
  function vinKey(lat, lon) { return lat.toFixed(4) + ',' + lon.toFixed(4); }
  function vinFor(lat, lon) {
    if (lat === null || lat === undefined) return null;
    const key = vinKey(lat, lon);
    let v = VIN.cache.get(key);
    if (v && !(v.state === 'err' && Date.now() - v.t > 60000)) return v;
    v = { state: 'loading', t: Date.now(), fr: null, al: null, iffi: null };
    VIN.cache.set(key, v);
    if (VIN.cache.size > 60) VIN.cache.delete(VIN.cache.keys().next().value);
    vinFetch(v, lat, lon);
    return v;
  }
  async function vinFetch(v, lat, lon) {
    if (!navigator.onLine) { v.state = 'err'; v.err = 'serve la rete'; vinRefresh(); return; }
    // tolleranza IFFI: circa 300 m (estensione di 0,02° su 400 pixel → ~5 m per pixel)
    // v36: frane IFFI dal punto identificativo di ciascuna frana (livello 1), con posizione, tipo di movimento e stato di attività;
    // indicatori del Comune (popolazione nelle aree a pericolosità) dai servizi ISPRA per Comune
    const [fr, al, iffi, ifr, ial] = await Promise.all([
      idroIdentify('fr', lat, lon, 1).catch(() => null),
      idroIdentify('al', lat, lon, 1).catch(() => null),
      idroIdentify('iffi', lat, lon, 60, 'all:1', true).catch(() => null),
      idroIdentify('ifr', lat, lon, 1, 'all:0').catch(() => null),
      idroIdentify('ial', lat, lon, 1, 'all:0').catch(() => null)]);
    if (fr === null && al === null) { v.state = 'err'; v.err = 'il servizio ISPRA non risponde ora'; vinRefresh(); return; }
    v.fr = fr === null ? undefined : findCls(fr);
    v.al = al === null ? undefined : findCls(al);
    if (iffi === null) v.iffi = undefined;
    else {
      const seen = new Set(), list = [];
      for (const r of iffi) {
        const a = r.attributes || {};
        const id = a.idfrana || a.IDFRANA || r.value;
        if (seen.has(id)) continue;
        seen.add(id);
        const g = r.geometry && isFinite(r.geometry.x) ? geo(lat, lon, r.geometry.y, r.geometry.x).d : null;
        list.push({ id: id, mov: a.movimento || a.MOVIMENTO || '', att: a.attivita || a.ATTIVITA || '', danno: a.danno || '', d: g });
      }
      list.sort((x, y) => (x.d === null ? 1e9 : x.d) - (y.d === null ? 1e9 : y.d));
      v.iffi = { n: list.length, list: list.slice(0, 3) };
    }
    const at = (res) => (res && res[0] && res[0].attributes) || null;
    const num = (x) => { const n = Number(x); return isFinite(n) ? n : null; };
    const a1 = at(ifr), a2 = at(ial);
    v.ind = (a1 || a2) ? {
      com: (a1 && a1.comune) || (a2 && a2.comune) || '',
      pop: num(a1 && (a1.pop_res021 || a1.pop_res011)) || num(a2 && a2.pop_res011),
      fr34: a1 ? (num(a1.pop_fr_p4) || 0) + (num(a1.pop_fr_p3) || 0) : null,
      fr12: a1 ? (num(a1.pop_fr_p2) || 0) + (num(a1.pop_fr_p1) || 0) : null,
      faa: a1 ? num(a1.pop_fr_aa) : null,
      al3: a2 ? num(a2.pop_idr_p3) : null, al2: a2 ? num(a2.pop_idr_p2) : null, al1: a2 ? num(a2.pop_idr_p1) : null
    } : null;
    v.state = 'ok';
    vinRefresh();
  }
  function vinRefresh() { updateMapCard(); ptRefreshRows(); if (tabNow() === 'punto') renderPunto(); }
  function vinShort(v) {
    if (!v) return 'in attesa del punto';
    if (v.state === 'loading') return 'in caricamento…';
    if (v.state === 'err') return v.err;
    const a = [];
    if (v.fr) a.push('Frana ' + v.fr.cls);
    if (v.al) a.push('Alluvione ' + v.al.cls);
    return a.length ? a.join(' · ') : 'nessuna area PAI';
  }
  function vinWarn(v) { return !!(v && v.state === 'ok' && (v.fr || v.al)); }
  function vinHtml(v, lat, lon) {
    if (!v || v.state === 'loading') return '<p class="stoNote">Chiedo a ISPRA…</p>';
    if (v.state === 'err') return '<p class="stoNote">' + escHtml(v.err) + '.</p>';
    const rows = [];
    rows.push(['Frana (PAI)', v.fr === undefined ? 'non disponibile' : v.fr ? v.fr.cls + ' · ' + (PCLS[v.fr.cls] || v.fr.raw) : 'fuori dalle aree a pericolosità', v.fr ? 'warn' : '']);
    rows.push(['Alluvione (PAI)', v.al === undefined ? 'non disponibile' : v.al ? v.al.cls + ' · ' + (ACLS[v.al.cls] || v.al.raw) : 'fuori dalle aree a pericolosità', v.al ? 'warn' : '']);
    rows.push(['Frane censite (IFFI)', v.iffi === undefined ? 'non disponibile' : v.iffi.n ? v.iffi.n + ' entro circa 300 m' : 'nessuna entro circa 300 m', v.iffi && v.iffi.n ? 'warn' : '']);
    for (const f of (v.iffi && v.iffi.list) || []) {
      const t = [f.mov ? f.mov.charAt(0).toUpperCase() + f.mov.slice(1).toLowerCase() : 'Frana', f.att ? f.att.toLowerCase() : ''].filter(Boolean).join(' · ');
      rows.push(['· ' + (f.d !== null ? 'a ' + fmtDist(f.d) : 'vicina'), t, 'sub']);
    }
    rows.push(['Paesaggio e altri vincoli', 'in arrivo', 'na']);
    let h = '<div class="vinRows">' + rows.map((r) => '<span>' + r[0] + '</span><b class="' + r[2] + '">' + escHtml(r[1]) + '</b>').join('') + '</div>';
    const what = [];
    if (v.fr && (v.fr.cls === 'P4' || v.fr.cls === 'P3')) what.push('Frana ' + v.fr.cls + ': di norma nuove costruzioni e ampliamenti non sono ammessi o lo sono solo in casi limitati; manutenzioni e messa in sicurezza sì.');
    else if (v.fr && (v.fr.cls === 'P2' || v.fr.cls === 'P1')) what.push('Frana ' + v.fr.cls + ': di norma gli interventi sono ammessi con uno studio di compatibilità geologica.');
    else if (v.fr && v.fr.cls === 'AA') what.push('Area di attenzione: serve un approfondimento geologico prima di intervenire.');
    if (v.al && v.al.cls === 'P3') what.push('Alluvione P3: di norma vietate nuove costruzioni; ammessi interventi che non aumentano il rischio.');
    else if (v.al) what.push('Alluvione ' + v.al.cls + ': di norma interventi ammessi con studio di compatibilità idraulica.');
    if (v.ind) {
      const n = (x) => (x === null || x === undefined ? '–' : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
      const pc = (x) => (v.ind.pop && x !== null ? ' (' + (Math.round(x / v.ind.pop * 1000) / 10).toString().replace('.', ',') + '%)' : '');
      const ir = [];
      if (v.ind.fr34 !== null) ir.push(['In aree a frana P3–P4', n(v.ind.fr34) + ' abitanti' + pc(v.ind.fr34)]);
      if (v.ind.fr12 !== null) ir.push(['In aree a frana P1–P2', n(v.ind.fr12) + ' abitanti' + pc(v.ind.fr12)]);
      if (v.ind.al3 !== null) ir.push(['In aree alluvionabili P3', n(v.ind.al3) + ' abitanti' + pc(v.ind.al3)]);
      if (v.ind.al2 !== null) ir.push(['In aree alluvionabili P2', n(v.ind.al2) + ' abitanti' + pc(v.ind.al2)]);
      h += '<h4>Il Comune' + (v.ind.com ? ' di ' + escHtml(v.ind.com) : '') + (v.ind.pop ? ' · ' + n(v.ind.pop) + ' abitanti' : '') + '</h4><div class="vinRows">' +
        ir.map((r) => '<span>' + r[0] + '</span><b>' + escHtml(r[1]) + '</b>').join('') + '</div>';
    }
    if (what.length) h += '<h4>Cosa comporta (in sintesi)</h4><p class="vinWhat">' + what.map(escHtml).join('<br>') + '</p>';
    h += '<div class="vinLinks"><button type="button" id="vinMap">Apri sulla mappa ›</button><a href="https://idrogeo.isprambiente.it/app/" target="_blank" rel="noopener">IdroGEO (ISPRA) ›</a></div>';
    h += '<p class="hint">Mosaicatura nazionale ISPRA dei Piani di Assetto Idrogeologico, inventario delle frane IFFI e indicatori di rischio ISPRA per Comune (dati delle Autorità di bacino distrettuali e delle Regioni, CC BY-SA 4.0). Indicativa: fanno fede il PAI vigente, le sue norme di attuazione e il CDU. Le classi e le regole cambiano da distretto a distretto.</p>';
    return h;
  }
  window.__panoVin = (lat, lon) => vinFor(lat, lon);

  /* ---------- v37: Sito ed Energia ----------
     Dati per Comune in sito-it.json (fatto con strumenti/make_sito.py): zona sismica (Dipartimento della Protezione Civile),
     zona climatica e gradi giorno (DPR 412/93, Tabella A), Comuni in area prioritaria per il radon (elenco nazionale ARPA Lombardia).
     Neve e vento: NTC 2018 (§3.4.2 e Tab. 3.3.I) con la quota del punto; trasmittanze: DM 28/10/2025. Sempre indicativi. */
  const SITO = { d: null, state: 'idle', t: 0 };
  async function sitoLoad() {
    if (SITO.d || SITO.state === 'loading' || (SITO.state === 'err' && Date.now() - SITO.t < 60000)) return;
    SITO.state = 'loading'; SITO.t = Date.now();
    try { SITO.d = await cachedJson('sito-it.json?v=37'); SITO.state = 'ok'; } catch (e) { SITO.state = 'err'; }
    if (tabNow() === 'punto') renderPunto();
  }
  // v41: tabelle di norme in dati/norme.js
  const { SIS_TXT, CLI_PER, NEVE_Z, NEVE_P, VENTO_Z, ISOLE, DM_U, DM_HT, REG_N, SITO_LINK, CLIMA_IND } = window.ORI_DATI;
  function ventoZona(com, reg, lat, lon) {
    if (ISOLE.has(com.n + '|' + com.p)) return 9;
    if (com.p === 'TS') return 8;
    if (com.p === 'RC') return 4;
    const z = { '01': 1, '02': 1, '03': 1, '04': 1, '05': 1, '06': 1, '07': 7, '08': 2, '19': 4 }[reg];
    if (z) return z;
    if (reg === '20') {   // Sardegna: a oriente (5) o a occidente (6) della retta Capo Teulada – Isola della Maddalena
      const ax = 8.645, ay = 38.866, bx = 9.400, by = 41.220;
      return (bx - ax) * (lat - ay) - (by - ay) * (lon - ax) < 0 ? 5 : 6;
    }
    return 3;
  }
  function nf(x, d) { return x.toFixed(d).replace('.', ','); }
  // Calcolo per un Comune e una quota: tutto quello che serve alla pastiglia e alla pagina
  function sitoFor(com, lat, lon, quota) {
    if (!com) return null;
    const D = SITO.d;
    const reg = com.r || (D && D.pr ? D.pr[String(com.i).slice(0, 3)] : null);
    const row = D && D.c ? D.c[com.i] : null;
    const o = { com: com, reg: reg, row: row, quota: quota, lat: lat, lon: lon };
    const nz = NEVE_P[com.p];
    if (nz) {
      const Z = NEVE_Z[nz];
      o.neve = { z: Z[0], q: quota === null ? null : quota <= 200 ? Z[1] : quota <= 1500 ? Z[2] * (1 + Math.pow(quota / Z[3], 2)) : NaN };
    }
    if (reg) {
      const vz = ventoZona(com, reg, lat, lon), V = VENTO_Z[vz];
      o.vento = { z: vz, vb0: V[0], v: quota === null ? null : quota <= V[1] ? V[0] : quota <= 1500 ? V[0] * (1 + V[2] * (quota / V[1] - 1)) : NaN };
    }
    return o;
  }

  /* ---------- v39: Clima futuro (PNACC 2024, ISPRA) ----------
     clima-it.json (strumenti/make_clima.py): clima 1981-2010 da E-OBS (griglia 0,1°) e variazioni al 2036-2065 secondo
     l'insieme di modelli EURO-CORDEX (~12 km) negli scenari RCP2.6, RCP4.5, RCP8.5. Si usa il nodo più vicino di ciascuna griglia. */
  const CLIMA = { d: null, state: 'idle', t: 0 };
  async function climaLoad() {
    if (CLIMA.d || CLIMA.state === 'loading' || (CLIMA.state === 'err' && Date.now() - CLIMA.t < 60000)) return;
    CLIMA.state = 'loading'; CLIMA.t = Date.now();
    try { CLIMA.d = await cachedJson('clima-it.json?v=39'); CLIMA.state = 'ok'; } catch (e) { CLIMA.state = 'err'; }
    if (tabNow() === 'punto') renderPunto();
  }
  function climaNear(g, lat, lon) {
    const P = CLIMA.d[g].p, k = Math.cos(lat * Math.PI / 180);
    let bi = -1, bd = Infinity;
    for (let i = 0; i < P[0].length; i++) { const dx = (P[0][i] - lon) * k, dy = P[1][i] - lat, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; bi = i; } }
    return { i: bi, km: Math.sqrt(bd) * 111.2 };
  }
  function climaHtml(lat, lon) {
    climaLoad();
    if (!CLIMA.d) return '<p class="stoNote">' + (CLIMA.state === 'err' ? 'Dati climatici non disponibili ora (serve la rete la prima volta).' : 'Carico i dati climatici…') + '</p>';
    const D = CLIMA.d, R = climaNear('ref', lat, lon), C = climaNear('sc', lat, lon);
    if (C.km > 15) return '<p class="sitTxt">Punto fuori dalla griglia dei dati climatici (in mare o fuori dall’Italia).</p>';
    const sg = (x, dec, pc) => {
      if (x === null || x === undefined) return '–';
      const d = Math.abs(x) < 1 && !pc ? 1 : pc ? 0 : dec, t = nf(Math.abs(x), d);
      if (/^0(,0)?$/.test(t)) return '≈ 0';
      return (x > 0 ? '+' : '−') + t + (pc ? '%' : '');
    };
    let h = '<div class="sitCard"><b>Oggi e al 2036–2065</b><span>Valori 1981–2010 e variazioni previste nei tre scenari: RCP2.6 forte riduzione delle emissioni, RCP4.5 intermedio, RCP8.5 emissioni ancora in crescita</span>' +
      '<table class="sitU cli"><tr><th>Indicatore</th><th>1981–2010</th><th>RCP2.6</th><th>RCP4.5</th><th>RCP8.5</th></tr>';
    let grp = '';
    for (const [k, nm, u, dec] of CLIMA_IND.map((x) => x)) {
      const it = CLIMA_IND.find((x) => x[0] === k), g = it[4];
      const sc = D.sc.i[k]; if (!sc) continue;
      if (g !== grp) { grp = g; h += '<tr class="g"><td colspan="5">' + g + (g === 'Caldo' || g === 'Freddo' || g === 'Piogge e siccità' ? ' · giorni all’anno' : '') + '</td></tr>'; }
      const rv = D.ref.i[k] ? D.ref.i[k][R.i] : null, pc = D.u[k] === '%';
      const dd = k === 'tg' || k === 'tg_jja' || k === 'tg_djf' ? 1 : dec;
      h += '<tr><td>' + nm + (u && u !== 'giorni' ? ', ' + u : '') + '</td><td>' + (rv === null || rv === undefined ? '–' : nf(rv, dec)) + '</td>' +
        ['26', '45', '85'].map((c) => '<td class="' + (c === '45' ? 'm' : '') + '">' + sg(sc[c][C.i], dd, pc) + '</td>').join('') + '</tr>';
    }
    h += '</table></div>';
    h += '<p class="sitNote">Variazioni: media dei modelli EURO-CORDEX (celle di circa 12 km); valori 1981–2010: osservazioni E-OBS (celle di circa 10 km), quindi medie di cella che in collina e montagna possono scostarsi dal punto. ' +
      '¹ Gradi giorno del PNACC (soglie 18/15 °C e 21/24 °C), diversi da quelli di legge del DPR 412/93. Incendi e vento: variazione percentuale.</p>';
    h += '<p class="sitSrc">ISPRA, indicatori del Piano nazionale di adattamento ai cambiamenti climatici (PNACC 2024), dati CMCC; clima di riferimento E-OBS (We acknowledge the E-OBS dataset and the data providers in the ECA&amp;D project). ' +
      '<a href="https://climadat.isprambiente.it/pnacc/dati-indicatori-mappe-pnacc/aree-terrestri/" target="_blank" rel="noopener">Fonte ›</a></p>';
    return h;
  }
