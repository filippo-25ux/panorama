/* Orientis – Avvio impostazioni, fotocamera, zoom, Comune e catasto, struttura Mappa · Guarda · Punto · Archivio.
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  galLoad().then(setThumbs).catch(() => {});

  loadSettings();
  $('esriKey').value = S.esriKey || ''; esriSet(S.esriKey);
  if (pitchWasReset !== null) { saveSettings(); }
  loadCache();
  refreshSettingsUI();
  loadStatic();

  /* ---------- Fotocamera (si riavvia da sola se si ferma) ---------- */
  let camBusy = false;

  // Apre la fotocamera dell'obiettivo scelto (kind: 'uw' ultra grandangolo, 'std' standard, 'tele')
  async function startCamera(kind) {
    if (camBusy) return;
    camBusy = true;
    try {
      const v = $('video');
      const old = v.srcObject;
      stopDet();   // v20: la copia per il sole va chiusa insieme al flusso
      v.classList.add('switching');
      v.style.transform = '';
      if (old && old.getTracks) old.getTracks().forEach((t) => t.stop());
      const want = kind || CAM.kind;
      const id = CAM.ids[want];
      // Risoluzione sicura (Full HD) per guardare; alta (4K) solo nella schermata di scatto, se scelta
      const hi = shooting && S.shotHi;
      const size = hi ? { width: { ideal: 3840 }, height: { ideal: 2160 } } : { width: { ideal: 1920 }, height: { ideal: 1080 } };
      // v21: tolto il limite di 30 fotogrammi della v20 (con quel vincolo Safari mostrava l'immagine piccola); iPhone usa già 30 di serie
      let stream = null;
      if (id) {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ deviceId: { exact: id } }, size), audio: false }); }
        catch (e) { stream = null; }
      }
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ facingMode: { ideal: 'environment' } }, size), audio: false });
      }
      v.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => { setTimeout(checkCamera, 500); };
      });
      try { await v.play(); } catch (e) { /* parte comunque da sola */ }
      await videoReady(v);
      // Quale obiettivo si è aperto davvero
      const tid = track && track.getSettings ? track.getSettings().deviceId : null;
      CAM.kind = (tid && tid === CAM.ids.uw) ? 'uw' : (tid && tid === CAM.ids.tele) ? 'tele' : (id && tid === id) ? want : 'std';
      CAM.track = track;
      CAM.hw = null;
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > (caps.zoom.min || 1)) CAM.hw = { min: caps.zoom.min || 1, max: caps.zoom.max };
      } catch (e) {}
      S.fov = S.fovs[CAM.kind];
      if (CAM.kind !== 'tele' && CAM.zk === 'T') { CAM.zk = CAM.stops.indexOf('1') >= 0 ? '1' : CAM.stops[0]; CAM.zoom = zoomVal(); drawZoom(); }   // il tele non si è aperto
      if (!CAM.scanned) await scanCams();
      await applyZoom(CAM.kind === 'tele' ? 1 : dzFor((CAM.zoom = zoomVal()), CAM.kind), true);
      focusContinuous();
      refreshSettingsUI();
    } finally {
      camBusy = false;
      refitVideo();
      await videoFrames($('video'), 3);
      refitVideo();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      $('video').classList.remove('switching');
    }
  }
  // Aspetta n fotogrammi veri del video (Safari li mostra piccoli al centro per un attimo); massimo 0,9 s
  function videoFrames(v, n) {
    return new Promise((ok) => {
      const tm = setTimeout(ok, 900);
      if (typeof v.requestVideoFrameCallback !== 'function') { clearTimeout(tm); setTimeout(ok, 350); return; }
      let k = 0;
      const step = () => { if (++k >= n) { clearTimeout(tm); ok(); } else v.requestVideoFrameCallback(step); };
      v.requestVideoFrameCallback(step);
    });
  }

  // Aspetta che il nuovo flusso abbia le sue dimensioni (massimo 1,5 s)
  function videoReady(v) {
    return new Promise((ok) => {
      if (v.videoWidth > 0) { ok(); return; }
      const done = () => { v.removeEventListener('loadedmetadata', done); v.removeEventListener('resize', done); clearTimeout(tm); ok(); };
      const tm = setTimeout(done, 1500);
      v.addEventListener('loadedmetadata', done);
      v.addEventListener('resize', done);
    });
  }
  // Safari a volte disegna il nuovo flusso piccolo al centro: si forza il ridisegno a tutto schermo
  function refitVideo() {
    const v = $('video');
    v.style.objectFit = 'fill';
    void v.offsetWidth;
    v.style.objectFit = '';
    v.style.transform = CAM.css === 1 ? '' : 'scale(' + CAM.css + ')';
  }
  $('video').addEventListener('resize', () => { if (!camBusy) refitVideo(); });

  // v17: Safari a volte lascia l'immagine piccola al centro (o sfocata) dopo che il pannello si apre/chiude
  // o si torna nella pagina. Il rimedio sicuro: si ricollega lo stesso flusso al video (nessun nuovo permesso).
  let reattachT = 0, reattaching = false;
  function reattachVideo(delay) {
    clearTimeout(reattachT);
    reattachT = setTimeout(async () => {
      const v = $('video');
      const s = v.srcObject;
      if (!s || camBusy || reattaching || document.visibilityState !== 'visible') return;
      reattaching = true;
      try {
        v.classList.add('switching');
        v.srcObject = null;
        void v.offsetWidth;
        v.srcObject = s;
        try { await v.play(); } catch (e) {}
        await videoFrames(v, 2);
        refitVideo();
        focusContinuous();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      } finally {
        v.classList.remove('switching');
        reattaching = false;
        camDiag.fixes++;
      }
    }, delay || 0);
  }
  // Messa a fuoco automatica continua, se la fotocamera lo permette (dopo i movimenti restava sfocata)
  function focusContinuous() {
    const t = CAM.track;
    try {
      const caps = t && t.getCapabilities ? t.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    } catch (e) {}
  }
  // Diagnosi (riga nel pannello): misure del flusso, del video sullo schermo e della finestra
  const camDiag = { fixes: 0 };
  function camDiagText() {
    const v = $('video');
    const r = v.getBoundingClientRect();
    const vv = window.visualViewport;
    let st = {};
    try { st = CAM.track && CAM.track.getSettings ? CAM.track.getSettings() : {}; } catch (e) {}
    return 'Diagnosi immagine: flusso ' + v.videoWidth + '×' + v.videoHeight +
      ' · video ' + Math.round(r.width) + '×' + Math.round(r.height) + ' in ' + Math.round(r.left) + ',' + Math.round(r.top) +
      ' · finestra ' + window.innerWidth + '×' + window.innerHeight +
      (vv ? ' · vista ' + Math.round(vv.width) + '×' + Math.round(vv.height) + ' ×' + (Math.round(vv.scale * 100) / 100) : '') +
      ' · ingrand. ' + (Math.round(CAM.css * 100) / 100) +
      (st.focusMode ? ' · fuoco ' + st.focusMode : '') +
      ' · ripristini ' + camDiag.fixes + '.';
  }
  setInterval(() => {
    if ($('sheet').classList.contains('open') && $('camDiag')) $('camDiag').textContent = camDiagText();
  }, 1000);
  // Quando la finestra cambia misura (barra di Safari, ritorno nella pagina) si ricollega il video


  // Elenca le fotocamere posteriori (dopo il permesso Safari e Chrome mostrano i nomi)
  async function scanCams() {
    CAM.scanned = true;
    let devs = [];
    try { devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (e) { return; }
    CAM.names = devs.map((d) => d.label || 'senza nome');
    const back = devs.filter((d) => d.label && !/front|anterior|frontal|facetime|desk|scrivania|selfie/i.test(d.label));
    const phys = back.filter((d) => !/dual|triple|doppi|tripl|duale/i.test(d.label));
    const uw = phys.find((d) => /ultra/i.test(d.label));
    const tele = phys.find((d) => /tele/i.test(d.label));
    const std = phys.find((d) => d !== uw && d !== tele);
    if (uw) CAM.ids.uw = uw.deviceId;
    if (tele) CAM.ids.tele = tele.deviceId;
    if (std) CAM.ids.std = std.deviceId;
    CAM.base = uw ? 'uw' : 'std';
    buildZoomStops(true);
    // Si parte dall'obiettivo più grandangolare disponibile
    if (uw && CAM.kind !== 'uw') {
      camBusy = false;
      await startCamera('uw');
      camBusy = true;
    }
  }

  /* ---------- Zoom a scatti ---------- */
  // Zoom: prima quello del sensore (se il browser lo permette), altrimenti ingrandimento dell'immagine
  async function applyZoom(z, quiet) {
    const t = CAM.track;
    let hwOk = false;
    if (z > 1.01 && CAM.hw && t && t.applyConstraints && z * CAM.hw.min <= CAM.hw.max) {
      try { await t.applyConstraints({ advanced: [{ zoom: CAM.hw.min * z }] }); hwOk = true; } catch (e) { hwOk = false; }
    } else if (CAM.hw && t && t.applyConstraints) {
      try { await t.applyConstraints({ advanced: [{ zoom: CAM.hw.min }] }); } catch (e) {}
    }
    if (z <= 1.01) z = 1;
    CAM.dz = z;
    CAM.css = hwOk ? 1 : z;
    CAM.mode = z === 1 ? 'ottico' : hwOk ? 'sensore' : 'digitale';
    $('video').style.transform = CAM.css === 1 ? '' : 'scale(' + CAM.css + ')';
    if (!quiet) refreshSettingsUI();
    drawZoom();
  }

  // v23: zoom a pastiglie con gli scatti dell'iPhone: 0,5× (ultra grandangolo), 1× (standard), 2× (standard ingrandito), tele.
  // CAM.zk è la pastiglia scelta; CAM.zoom resta l'ingrandimento rispetto all'obiettivo più ampio (ricalcolato dai campi visivi).
  const tanH2 = (k) => Math.tan(S.fovs[k] * RAD / 2);
  function stdRatio() { return CAM.base === 'uw' && CAM.ids.std ? tanH2('uw') / tanH2('std') : 1; }
  function zoomVal(k) {
    k = k || CAM.zk;
    if (k === 'T') return 'T';
    if (k === 'uw') return 1;
    return (k === '2' ? 2 : 1) * stdRatio();
  }
  function zoomLabel(k) {
    if (k === 'uw') return '0,5×';
    if (k === 'T') {
      const r = CAM.ids.std || CAM.base === 'std' ? tanH2('std') / tanH2('tele') : tanH2('uw') / tanH2('tele') / 2;
      return String(Math.max(2, Math.round(r))) + '×';
    }
    return k === '2' ? '2×' : '1×';
  }
  function buildZoomStops(reset) {
    CAM.stops = CAM.base === 'uw' ? (CAM.ids.std ? ['uw', '1', '2'] : ['uw', '1']) : ['1', '2'];
    if (CAM.ids.tele) CAM.stops.push('T');
    if (reset || !CAM.zk || CAM.stops.indexOf(CAM.zk) < 0) CAM.zk = CAM.stops[0];
    CAM.zoom = zoomVal();
    const box = $('zoom');
    box.innerHTML = '';
    CAM.stops.forEach((k, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'zp';
      b.dataset.i = String(i);
      b.dataset.k = k;
      b.textContent = zoomLabel(k);
      b.setAttribute('aria-label', 'Zoom ' + zoomLabel(k));
      b.addEventListener('click', () => { haptic(); selectStop(i); });
      box.appendChild(b);
    });
    drawZoom();
  }
  function zoomName(st) { return st === 'T' ? 'Tele' : typeof st === 'string' ? st : String(Math.round(st * 100) / 100).replace('.', ',') + '×'; }
  function zoomIndex() { return CAM.kind === 'tele' ? CAM.stops.indexOf('T') : Math.max(0, CAM.stops.indexOf(CAM.zk)); }
  function drawZoom() { drawZoomPending(zoomIndex()); }
  async function selectStop(i) {
    if (i < 0 || i >= CAM.stops.length) return;
    const k = CAM.stops[i];
    if (i === zoomIndex() && CAM.zk === k) return;
    CAM.zk = k;
    drawZoomPending(i);
    if (k === 'T') { CAM.zoom = 'T'; await startCamera('tele'); return; }
    CAM.zoom = zoomVal();
    const kind = lensFor(CAM.zoom);
    if (kind !== CAM.kind) { await startCamera(kind); return; }
    await applyZoom(dzFor(CAM.zoom, kind));
  }
  function drawZoomPending(i) { document.querySelectorAll('#zoom .zp').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.i) === i))); }

  // Piccolo scatto tattile: vibrazione dove esiste, interruttore nascosto su iPhone (iOS 18)
  const hapLbl = document.createElement('label');
  hapLbl.setAttribute('aria-hidden', 'true');
  hapLbl.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
  const hapIn = document.createElement('input');
  hapIn.type = 'checkbox'; hapIn.setAttribute('switch', ''); hapIn.tabIndex = -1;
  hapLbl.appendChild(hapIn);
  document.body.appendChild(hapLbl);
  let hapT = 0;
  function haptic() {
    const t = Date.now();
    if (t - hapT < 60) return;
    hapT = t;
    try { if (navigator.vibrate) { navigator.vibrate(8); return; } hapLbl.click(); } catch (e) {}
  }

  buildZoomStops();
  document.addEventListener('touchstart', () => {}, { passive: true });   // fa funzionare :active su Safari (il sole dello scatto che sorge)

  function checkCamera() {
    if (document.visibilityState !== 'visible' || camBusy || camPaused) return;
    const v = $('video');
    const s = v.srcObject;
    const t = s && s.getVideoTracks && s.getVideoTracks()[0];
    if (!t || t.readyState !== 'live') { startCamera().catch(() => {}); return; }
    if (v.paused) { v.play().catch(() => {}); return; }
    if (t.muted || v.videoWidth === 0) { startCamera().catch(() => {}); }
  }

  function devNote(noComp, noBack) {
    const box = $('devNote');
    const what = noComp && noBack ? 'non ha la bussola né una fotocamera posteriore'
      : noComp ? 'non ha la bussola (o non la rende disponibile al browser)'
      : 'non ha una fotocamera posteriore';
    box.querySelector('p').textContent = 'Questo dispositivo ' + what + '. Orientis funziona su telefono: le etichette qui non possono coincidere con quello che vedi. Puoi comunque guardare la mappa.';
    box.hidden = false;
  }
  $('devOk').addEventListener('click', () => { $('devNote').hidden = true; });

  /* ---------- v24: Comune e catasto del punto di ripresa ---------- */
  // Comune: confini ISTAT nel sito (un file per regione), tenuti nella memoria del telefono: dopo la prima volta funziona senza rete.
  // Catasto: servizio WMS dell'Agenzia delle Entrate (serve la rete; se il servizio non risponde al sito lo si dice).
  const COM = { regs: null, data: {}, loading: {}, cur: null, at: null, state: 'idle' };
  const CAT = { cur: null, state: 'idle', at: null, tried: 0, msg: '' };
  const CAT_PROXY = 'https://orientis-catasto.filippotiso.workers.dev/catasto';
  async function cachedJson(url) {
    let cache = null;
    try { cache = await caches.open('orientis-comuni-v1'); const hit = await cache.match(url); if (hit) return hit.json(); } catch (e) { cache = null; }
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (cache) { try { await cache.put(url, r.clone()); } catch (e) {} }
    return r.json();
  }
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inComune(c, x, y) {
    const bb = c[4];
    if (x < bb[0] * 1e4 || x > bb[2] * 1e4 || y < bb[1] * 1e4 || y > bb[3] * 1e4) return false;
    for (const poly of c[5]) {
      if (!inRing(x, y, poly[0])) continue;
      let hole = false;
      for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) { hole = true; break; }
      if (!hole) return true;
    }
    return false;
  }
  // v30: Comune di un punto qualsiasi (null se fuori dall'Italia o in mare; errore se i confini non si possono leggere)
  async function comuneAt(lat, lon) {
    const x = lon * 1e4, y = lat * 1e4;
    if (!COM.regs) COM.regs = await cachedJson('comuni/regioni.json');
    for (const code in COM.regs) {
      const b = COM.regs[code];
      if (lon < b[0] - 0.01 || lon > b[2] + 0.01 || lat < b[1] - 0.01 || lat > b[3] + 0.01) continue;
      if (!COM.data[code]) COM.data[code] = (await cachedJson('comuni/R' + code + '.json')).c;
      for (const c of COM.data[code]) if (inComune(c, x, y)) return { n: c[0], p: c[1], i: c[2], k: c[3], r: code };
    }
    return null;
  }
  async function updateComune() {
    if (S.lat === null) return;
    if (COM.busy) return;
    if (COM.at && geo(COM.at.lat, COM.at.lon, S.lat, S.lon).d < 30 && COM.state !== 'err') { updateCatasto(); return; }
    const lat = S.lat, lon = S.lon;
    COM.busy = true;
    try {
      const found = await comuneAt(lat, lon);
      COM.cur = found;
      COM.state = found ? 'ok' : 'fuori';
      COM.at = { lat: lat, lon: lon };
    } catch (e) { COM.state = 'err'; }
    COM.busy = false;
    updateCatasto();
  }
  function comuneText() {
    if (S.lat === null) return 'in attesa del GPS';
    if (COM.cur) return COM.cur.n + (COM.cur.p ? ' (' + COM.cur.p + ')' : '');
    return COM.state === 'err' ? 'non disponibile (serve la rete la prima volta)' : COM.state === 'fuori' ? 'fuori dall’Italia (o in mare)' : 'in caricamento…';
  }
  // «IT.AGE.PLA.G273_0033A0.673» → Comune G273, foglio 33, particella 673
  function parseParcel(id) {
    const m = /([A-Z]\d{3})([A-Z0-9]?)_(\d{4})([A-Z0-9])([A-Z0-9])\.([^<\s]+)/.exec(id || '');
    if (!m) return null;
    return { c: m[1], sez: m[2] || '', f: String(Number(m[3])), all: m[4] === '0' ? '' : m[4], p: m[6], id: m[0] };
  }
  async function updateCatasto() {
    if (S.lat === null || !COM.cur || !navigator.onLine) { if (!navigator.onLine && CAT.state !== 'ok') CAT.state = 'offline'; return; }
    const now = Date.now();
    const moved = !CAT.at || geo(CAT.at.lat, CAT.at.lon, S.lat, S.lon).d > 12;
    if (!moved || CAT.state === 'loading' || now - CAT.tried < (CAT.state === 'err' ? 60000 : 8000)) return;
    CAT.tried = now; CAT.state = 'loading';
    const lat = S.lat, lon = S.lon;
    // v25: la richiesta passa dal server di passaggio dell'utente (Cloudflare Worker), che la gira all'Agenzia delle Entrate
    const url = CAT_PROXY + '?lat=' + lat.toFixed(6) + '&lon=' + lon.toFixed(6);
    try {
      const pc = await catAsk(url, 9000);
      CAT.cur = pc; CAT.state = pc ? 'ok' : 'none'; CAT.at = { lat: lat, lon: lon }; CAT.edge = false;
      // v26: vicino ai confini? Si chiede la particella anche in 4 punti attorno, alla distanza dell'errore del GPS (5–25 m)
      if (pc) {
        const r = Math.max(5, Math.min(25, S.gpsAcc || 10)), dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * RAD));
        const around = [[dLat, 0], [-dLat, 0], [0, dLon], [0, -dLon]].map((o) =>
          catAsk(CAT_PROXY + '?lat=' + (lat + o[0]).toFixed(6) + '&lon=' + (lon + o[1]).toFixed(6), 9000).catch(() => null));
        const res = await Promise.all(around);
        CAT.edge = res.some((x) => x && x.id !== pc.id);
      }
    } catch (e) {
      CAT.state = 'err';
      CAT.msg = e && e.name === 'AbortError' ? 'il servizio dell’Agenzia non risponde' : String(e && e.message || e);
    }
  }
  async function catAsk(url, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = setTimeout(() => { if (ctl) ctl.abort(); }, ms);
    try {
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text();
      const m = /localId<\/th>\s*<td>([^<]+)/i.exec(html) || /nationalCadastralReference<\/th>\s*<td>([^<]+)/i.exec(html) || /([A-Z]\d{3}[A-Z0-9]?_\d{4}[A-Z0-9]{2}\.[0-9A-Z]+)/.exec(html);
      return m ? parseParcel(m[1]) : null;
    } finally { clearTimeout(to); }
  }
  function catastoText() {
    if (!COM.cur) return '–';
    if (CAT.state === 'ok' && CAT.cur) return 'foglio ' + CAT.cur.f + ', particella ' + CAT.cur.p + (CAT.edge ? ' (vicino al confine: verifica)' : '');
    if (CAT.state === 'loading' || CAT.state === 'idle') return 'in caricamento…';
    if (CAT.state === 'none') return 'nessuna particella qui (strada, acqua o zona non mappata)';
    if (CAT.state === 'offline') return 'serve la rete';
    return (navigator.onLine ? 'non disponibile ora' : 'serve la rete') + ': tocca «Mappa» per vedere foglio e particella';
  }
  setInterval(() => { if (!$('hud').hidden) updateComune(); }, 2000);

  /* ---------- v30: nuova struttura – Mappa · Guarda · Punto · Archivio ----------
     Si apre sulla Mappa. Guarda è la fotocamera di sempre (scheda più snella). Punto è il cruscotto del punto scelto
     (dove sei, oppure un punto toccato sulla mappa o nel paesaggio), con gli ambiti separati. Archivio è la galleria. */
  const TAB = { cur: null };
  const START_TAB = (/[?&]tab=(mappa|guarda|punto|archivio)/.exec(location.search) || [])[1] || 'mappa';
  let VIEW = null, inSheet = false, hintTimer = null;
  function tabNow() { return TAB.cur || 'guarda'; }
  function setTab(t) {
    if (t === TAB.cur) { if (t === 'mappa' && full && PT.cur === null) setFollow(true); return; }
    const prev = TAB.cur;
    TAB.cur = t;
    document.body.dataset.tab = t;
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    if (shooting) setShooting(false);
    if (align.step) $('alCancel').click();
    if ($('sheet').classList.contains('open')) setSheet(false);
    if (!$('bmenu').hidden) setMenu(false);
    if (inSheet) setInSheet(false);
    if (t !== 'archivio') { $('gal').hidden = true; $('galToast').hidden = true; }
    $('punto').hidden = t !== 'punto';
    if (prev === 'mappa' && t !== 'mappa') mapLeave();
    if (t === 'mappa') mapEnter();
    if (t === 'archivio') openGallery();
    if (t === 'punto') { PU.view = PT.cur ? 'pt' : 'qui'; renderPunto(); }
    if (t === 'guarda') { if (camPaused && pausedBySheet) resumeCam(); showTapHint(); }
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { haptic(); setTab(b.dataset.tab); }));
  window.__panoTab = (t) => (t ? setTab(t) : TAB.cur);
  window.__panoCam = () => ({ paused: camPaused, bySheet: pausedBySheet });
  window.__panoPt = () => PT.cur;

  // Mappa
  function mapEnter() {
    $('mapWait').hidden = mapReady;
    setText('mapWaitTx', mapFailed ? 'La mappa non è disponibile su questo dispositivo.' : 'La mappa si apre appena il GPS trova la posizione…');
    if (!mapReady) return;
    $('miniCard').hidden = true; selId = null; refreshMarkerClasses();
    if (!full) setFull(true);
    if (PT.cur) { setFollow(false); requestAnimationFrame(() => { if (map) map.jumpTo({ center: [PT.cur.lon, PT.cur.lat] }); }); }
    updateMapCard();
  }
  function mapLeave() {
    $('mapWait').hidden = true;
    if (full) setFull(false);
  }
  setInterval(() => { if (tabNow() === 'mappa' && !mapReady) { tryInitMap(); mapEnter(); } else if (tabNow() === 'mappa') updateMapCard(); }, 1000);

  // Guarda: il tondo della mappa a 20 px dal bordo destro e dall'alto della scheda; toccato, si allarga dentro la scheda
  function placeMini() {
    const mw = $('miniWrap'), sh = $('sheet').getBoundingClientRect();
    if (inSheet) {
      const st = mw.style;
      const v = [sh.left + 'px', sh.top + 'px', sh.width + 'px', sh.height + 'px'];
      if (st.left !== v[0] || st.top !== v[1] || st.width !== v[2] || st.height !== v[3]) {
        st.left = v[0]; st.top = v[1]; st.width = v[2]; st.height = v[3];
        if (map) requestAnimationFrame(() => { map.resize(); updateMap(); });
      }
      return;
    }
    const mt = Math.round(sh.top + 20) + 'px';
    if (mw.style.top !== mt) mw.style.top = mt;
    const ht = Math.round(sh.top - 28) + 'px';
    if ($('tapHint').style.top !== ht) $('tapHint').style.top = ht;
    if (mw.style.left) { mw.style.left = mw.style.width = mw.style.height = ''; }
  }
  function setInSheet(v) {
    inSheet = !!v;
    $('miniWrap').classList.toggle('insheet', inSheet);
    $('inSheetLbl').hidden = !inSheet;
    $('miniExpand').textContent = inSheet ? '✕' : (full ? '✕' : '⤢');
    if (!inSheet) { const st = $('miniWrap').style; st.left = st.width = st.height = ''; }
    placeMini();
    requestAnimationFrame(() => { if (map) { map.resize(); updateMap(); } });
  }
  // Suggerimento «Tocca il paesaggio per interrogarlo»: 5 secondi ogni volta che si entra in Guarda
  function showTapHint() {
    const h = $('tapHint');
    clearTimeout(hintTimer);
    h.hidden = false; h.classList.remove('off');
    hintTimer = setTimeout(() => { h.classList.add('off'); hintTimer = setTimeout(() => { h.hidden = true; }, 700); }, 5000);
  }

  // Punto scelto (toccato sulla mappa o nel paesaggio)
  const PT = { cur: null, pin: null, showG: false };
  const PU = { view: 'qui' };
  function ptSet(lat, lon, src, extra) {
    const g = S.lat !== null ? geo(S.lat, S.lon, lat, lon) : { d: null, b: null };
    const ground = g.d !== null ? demGet(lat, lon, demZoomFor(Math.max(g.d, 100))) : null;
    PT.cur = { lat: lat, lon: lon, src: src, d: g.d, b: g.b, ang: extra && extra.ang, ground: ground, nm: (extra && (extra.name || (extra.hist && extra.hist.nm))) || null, ty: (extra && (extra.type || (extra.hist && extra.hist.ty))) || null, com: null, comState: 'loading', cat: null, catState: 'loading', t: Date.now() };
    PT.showG = src === 'guarda';
    if (extra && extra.hist) Object.assign(PT.cur, { com: extra.hist.com, comState: extra.hist.com ? 'ok' : 'loading', cat: extra.hist.cat, catState: extra.hist.cat ? 'ok' : 'loading' });
    histAdd(PT.cur);
    if (!(extra && extra.hist && extra.hist.cat)) ptFetch(PT.cur);
    ptPin();
    ptRefresh();
  }
  function ptClear() {
    PT.cur = null; PT.showG = false;
    if (PT.pin) { PT.pin.remove(); PT.pin = null; }
    ptRefresh();
  }
  // v37: quota del punto scelto anche lontano dai tasselli già caricati (serve a neve e vento)
  async function ptGround(p) {
    if (p.ground !== null && p.ground !== undefined) return;
    try {
      const z = 12, q = demXY(z, p.lat, p.lon), k = z + '/' + Math.floor(q.fx) + '/' + Math.floor(q.fy);
      if (!(DEM.tiles.get(k) instanceof Float32Array)) { DEM.tiles.set(k, await demFetch(k)); demLast = { k: '', t: null }; }
      const g = demGet(p.lat, p.lon, z);
      if (g !== null && PT.cur === p) { p.ground = g; ptRefresh(); }
    } catch (e) { /* senza quota: neve e vento chiedono la quota */ }
  }
  async function ptFetch(p) {
    ptGround(p);
    try { p.com = await comuneAt(p.lat, p.lon); p.comState = p.com ? 'ok' : 'fuori'; } catch (e) { p.comState = 'err'; }
    ptRefresh();
    if (!p.com) { p.catState = p.comState === 'err' ? 'err' : 'none'; ptRefresh(); return; }
    if (!navigator.onLine) { p.catState = 'offline'; ptRefresh(); return; }
    try {
      const pc = await catAsk(CAT_PROXY + '?lat=' + p.lat.toFixed(6) + '&lon=' + p.lon.toFixed(6), 9000);
      p.cat = pc; p.catState = pc ? 'ok' : 'none';
    } catch (e) { p.catState = 'err'; }
    histAdd(p);
    ptRefresh();
  }
  // v31: cronologia dei punti scelti (ultimi 30, salvati sul telefono)
  let HIST = [];
  try { HIST = JSON.parse(localStorage.getItem('pano.ptHist') || '[]') || []; } catch (e) { HIST = []; }
  function histSave() { try { localStorage.setItem('pano.ptHist', JSON.stringify(HIST)); } catch (e) {} }
  function histAdd(p) {
    const e = { lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6, src: p.src, t: p.t, g: groundOf(p), com: p.com || null, cat: p.cat || null, nm: p.nm || null, ty: p.ty || null };
    const i = HIST.findIndex((h) => h.t === p.t || (Math.abs(h.lat - e.lat) < 2e-5 && Math.abs(h.lon - e.lon) < 2e-5));
    if (i >= 0) HIST.splice(i, 1);
    HIST.unshift(e);
    if (HIST.length > 30) HIST.length = 30;
    histSave();
  }
  function srcText(src) { return src === 'guarda' ? 'toccato nel paesaggio' : src === 'luogo' ? 'luogo sulla mappa' : 'scelto sulla mappa'; }
  function histHtml() {
    return HIST.map((h, i) => {
      const name = h.nm || (h.com ? h.com.n + (h.com.p ? ' (' + h.com.p + ')' : '') : fmtCoord(h.lat, h.lon));
      const cat = h.cat ? 'foglio ' + h.cat.f + ' · part. ' + h.cat.p : '';
      const sub = [srcText(h.src), fmtWhen(h.t)].join(' · ');
      return '<button type="button" class="phRow" data-i="' + i + '"><b>' + escHtml(name) + (cat ? ' · ' + escHtml(cat) : '') + '</b><span>' + escHtml(sub) + '</span><i aria-hidden="true">›</i></button>';
    }).join('');
  }
  function ptPin() {
    if (!mapReady || !PT.cur) return;
    if (!PT.pin) { const el = document.createElement('div'); el.className = 'ptPin'; PT.pin = new window.maplibregl.Marker({ element: el, anchor: 'center' }); }
    PT.pin.setLngLat([PT.cur.lon, PT.cur.lat]).addTo(map);
  }
  // Testi comuni a Mappa, Guarda e Punto
  function comOf(p) {
    if (!p) return comuneText();
    if (p.com) return p.com.n + (p.com.p ? ' (' + p.com.p + ')' : '');
    return p.comState === 'loading' ? 'in caricamento…' : p.comState === 'fuori' ? 'fuori dall’Italia (o in mare)' : 'non disponibile';
  }
  function catOf(p) {
    if (!p) return catastoText();
    if (p.catState === 'ok' && p.cat) return 'foglio ' + p.cat.f + ' · part. ' + p.cat.p;
    if (p.catState === 'loading') return 'in caricamento…';
    if (p.catState === 'none') return p.com ? 'nessuna particella qui' : '–';
    if (p.catState === 'offline') return 'serve la rete';
    return 'non disponibile ora';
  }
  function catShort() {
    if (!COM.cur) return '–';
    if (CAT.state === 'ok' && CAT.cur) return 'foglio ' + CAT.cur.f + ' · part. ' + CAT.cur.p + (CAT.edge ? ' (vicino al confine)' : '');
    if (CAT.state === 'loading' || CAT.state === 'idle') return 'in caricamento…';
    if (CAT.state === 'none') return 'nessuna particella qui';
    if (CAT.state === 'offline' || !navigator.onLine) return 'serve la rete';
    return 'non disponibile ora · tocca per la mappa';
  }
  function groundOf(p) {
    const g = p ? p.ground : (S.dem ? DEM.ground : null);
    return g === null || g === undefined ? null : Math.round(g);
  }
  function rowsHtml(p) {
    const v = p ? vinFor(p.lat, p.lon) : (S.lat !== null ? vinFor(S.lat, S.lon) : null);
    const r = [['Catasto', p ? catOf(p) : catShort(), ''], ['Vincoli', vinShort(v), vinWarn(v) ? 'warn' : ''], ['Urbanistica', 'in arrivo', 'na']];
    return r.map((x) => '<span>' + x[0] + '</span><b class="' + x[2] + '">' + escHtml(x[1]) + '</b>').join('');
  }
  function escHtml(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function ptWhere(p) {
    if (p.d === null) return fmtCoord(p.lat, p.lon);
    return fmtDist(p.d) + ' a ' + DIRS[Math.round(p.b / 45) % 8] + (groundOf(p) !== null ? ' · ' + groundOf(p) + ' m' : '');
  }
  function ptComLine(p) {
    if (p.com) return 'nel territorio di ' + p.com.n + (p.com.p ? ' (' + p.com.p + ')' : '');
    return p.comState === 'loading' ? 'cerco il Comune…' : p.comState === 'fuori' ? 'fuori dai Comuni italiani' : 'Comune non disponibile ora';
  }
  function updateMapCard() {
    const c = $('mapCard');
    if (tabNow() !== 'mappa' || !mapReady) { c.hidden = true; return; }
    if (!$('miniCard').hidden) { c.hidden = true; return; }
    c.hidden = false;
    const p = PT.cur;
    const com = p ? (p.com ? p.com.n + (p.com.p ? ' (' + p.com.p + ')' : '') : '') : (COM.cur ? COM.cur.n + (COM.cur.p ? ' (' + COM.cur.p + ')' : '') : '');
    setText('mcTitle', p ? (p.nm || 'Punto scelto') : 'Qui' + (com ? ' · ' + com : ''));
    const g = groundOf(p);
    setText('mcSub', p ? ptComLine(p) + ' · ' + ptWhere(p)
      : (S.lat === null ? 'in attesa del GPS' : fmtCoord(S.lat, S.lon) + (g !== null ? ' · ' + g + ' m' : '') + ' · tocca la mappa per un altro punto'));
    const html = rowsHtml(p);
    if ($('mcRows').innerHTML !== html) $('mcRows').innerHTML = html;
    $('mcQui').classList.toggle('ghost', !p);
  }
  $('mcGo').addEventListener('click', () => setTab('punto'));
  // v33: il luogo toccato sulla mappa diventa il punto scelto, col suo nome, e si apre nel Punto
  $('miniCardGo').addEventListener('click', () => {
    const it = items.find((x) => x.id === selId) || rivers.map((r) => r.item).find((x) => x.id === selId);
    if (!it) return;
    ptSet(it.lat, it.lon, 'luogo', { name: it.n, type: it.t });
    $('miniCard').hidden = true; selId = null; refreshMarkerClasses();
    setTab('punto');
  });
  $('mcQui').addEventListener('click', () => { ptClear(); setFollow(true); updateMapCard(); });

  // Guarda: tocco sul paesaggio → punto sul terreno lungo la linea di sguardo (dal profilo del rilievo)
  function rayHit(x, y) {
    const V = VIEW, P = DEM.prof;
    if (!S.dem || !P || !V || V.heading === null || V.pitch === null || S.lat === null) return { err: 'dem' };
    const rel = Math.atan((x - V.W / 2) / (V.W / 2) * V.tanH) / RAD;
    const az = ((V.heading + rel) % 360 + 360) % 360;
    const ang = V.pitch - Math.atan((y - V.H / 2) / (V.H / 2) * V.tanV) / RAD;
    const a = Math.round(az / DEM_STEP) % P.nA;
    let hit = -1;
    for (let i = 0; i < P.nD; i++) if (P.cum[a * P.nD + i] >= ang) { hit = i; break; }
    if (hit < 0) return null;   // cielo, o terreno oltre la distanza scelta
    let d = P.ds[hit];
    if (hit === 0 && ang < 0 && DEM.ground !== null) d = Math.min(d, Math.max(3, (P.obs - DEM.ground) / Math.tan(-ang * RAD)));
    const ll = dest(S.lat, S.lon, az, d);
    return { lat: ll[1], lon: ll[0], d: d, b: az, ang: ang };
  }
  $('tapLayer').addEventListener('click', (e) => {
    if (tabNow() !== 'guarda' || shooting || align.step) return;
    if (inSheet) { setInSheet(false); return; }
    const h = rayHit(e.clientX, e.clientY);
    if (h && h.err) { toast('Per interrogare il paesaggio serve il rilievo del terreno (pannello › Rilievo del terreno).', 4500); return; }
    if (!h) { if (PT.showG) { PT.showG = false; ptRefresh(); } return; }
    haptic();
    ptSet(h.lat, h.lon, 'guarda', { ang: h.ang });
  });
  // ogni fotogramma: segno sul punto toccato e scheda di Guarda
  function ptFrame() {
    const p = PT.cur, m = $('ptMark'), V = VIEW;
    const on = !!(p && PT.showG && p.src === 'guarda' && V && V.heading !== null && V.pitch !== null);
    if (on) {
      const rel = norm180(p.b - V.heading);
      const x = V.W / 2 + Math.tan(rel * RAD) / V.tanH * V.W / 2;
      const y = V.H / 2 + Math.tan((V.pitch - p.ang) * RAD) / V.tanV * V.H / 2;
      const vis = Math.abs(rel) < 80 && x > -20 && x < V.W + 20 && y > 0 && y < V.H;
      m.hidden = !vis;
      if (vis) { m.style.left = Math.round(x) + 'px'; m.style.top = Math.round(y) + 'px'; }
      setText('aimName', 'Punto toccato');
      setText('aimInfo', ptComLine(p) + ' · ' + ptWhere(p));
    } else m.hidden = true;
    $('ptRows').hidden = !on;
    $('here').hidden = on;
  }
  function ptRefreshRows() {
    const p = PT.cur;
    const html = p ? rowsHtml(p) + '<button type="button" id="ptOpen">Apri il luogo ›</button>' : '';
    if ($('ptRows').dataset.h !== html) { $('ptRows').innerHTML = html; $('ptRows').dataset.h = html; }
  }
  function ptRefresh() {
    const p = PT.cur;
    const html = p ? rowsHtml(p) + '<button type="button" id="ptOpen">Apri il luogo ›</button>' : '';
    if ($('ptRows').dataset.h !== html) { $('ptRows').innerHTML = html; $('ptRows').dataset.h = html; }
    updateMapCard();
    if (tabNow() === 'punto') renderPunto();
    ptFrame();
  }
  $('ptRows').addEventListener('click', (e) => { if (e.target.closest('#ptOpen')) { e.stopPropagation(); setTab('punto'); } });

  // Punto: cruscotto con gli ambiti
  const AMB = [
    ['cat', 'Catasto', '#c92a2a'], ['vin', 'Vincoli', '#d9480f'], ['urb', 'Urbanistica', '#d6336c'],
    ['pio', 'Pioggia', '#1c7ed6'], ['sit', 'Sito ed Energia', '#2f9e44'], ['sto', 'Storia e cultura', '#8d6e63']
  ];
  /* v33: Storia e cultura – riassunto di Wikipedia (it), sito ufficiale del Comune (Wikidata), voci di Wikipedia nei dintorni.
     Testi di Wikipedia: CC BY-SA 4.0, con collegamento alla voce. */
  const STO = { key: null, state: 'idle', sum: null, near: [], site: null, err: '', t: 0 };
  const WIKI = 'https://it.wikipedia.org';
  async function wjson(url, ms) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms || 9000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(to); }
  }
  async function wikiSummary(title) {
    const j = await wjson(WIKI + '/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')));
    if (!j || j.type === 'disambiguation' || !j.extract) return null;
    // v34: descrizione più ampia: tutta l'introduzione della voce (fino a circa 900 caratteri, tagliata a fine frase)
    let text = j.extract;
    try {
      const q = await wjson(WIKI + '/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&origin=*&titles=' + encodeURIComponent(j.title));
      const pg = q && q.query && q.query.pages ? Object.values(q.query.pages)[0] : null;
      let t = pg && pg.extract ? pg.extract.replace(/\n+/g, ' ').trim() : '';
      if (t.length > 900) { const cut = t.lastIndexOf('. ', 900); t = t.slice(0, cut > 300 ? cut + 1 : 900) + ' …'; }
      if (t.length > text.length) text = t;
    } catch (e) {}
    return { title: j.title, text: text, url: j.content_urls && j.content_urls.mobile ? j.content_urls.mobile.page : WIKI + '/wiki/' + encodeURIComponent(j.title), qid: j.wikibase_item || null, thumb: j.thumbnail ? j.thumbnail.source : null, lat: j.coordinates ? j.coordinates.lat : null, lon: j.coordinates ? j.coordinates.lon : null };
  }
  async function wikiNear(lat, lon, r) {
    const j = await wjson(WIKI + '/w/api.php?action=query&list=geosearch&gscoord=' + lat.toFixed(5) + '|' + lon.toFixed(5) + '&gsradius=' + r + '&gslimit=60&format=json&origin=*');
    // v34: niente biblioteche, musei, archivi, scuole, stazioni, ospedali e simili: restano monumenti, chiese, castelli, siti, frazioni…
    const NO = /^(biblioteca|museo|archivio|pinacoteca|scuola|liceo|istituto|universit|stazione|fermata|ospedale|stadio|palazzetto|cinema|ufficio|caserma|cimitero|campo sportivo|centro commerciale|aeroporto|autostrada|strada statale|ss\d)/i;
    return ((j && j.query && j.query.geosearch) || []).filter((g) => !NO.test(g.title)).map((g) => ({ title: g.title, d: g.dist, lat: g.lat, lon: g.lon }));
  }
  async function wikiSite(qid) {
    const j = await wjson('https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=' + qid + '&property=P856&format=json&origin=*');
    const c = j && j.claims && j.claims.P856 && j.claims.P856[0];
    return c && c.mainsnak && c.mainsnak.datavalue ? c.mainsnak.datavalue.value : null;
  }
  function stoTarget() {
    const p = PU.view === 'pt' ? PT.cur : null;
    if (p) return { lat: p.lat, lon: p.lon, name: p.nm || (p.com ? p.com.n : null), com: p.com ? p.com.n : null };
    if (S.lat === null) return null;
    return { lat: S.lat, lon: S.lon, name: COM.cur ? COM.cur.n : null, com: COM.cur ? COM.cur.n : null };
  }
  async function stoFetch() {
    const t = stoTarget();
    if (!t) return;
    const key = (t.name || '') + '|' + t.lat.toFixed(3) + '|' + t.lon.toFixed(3);
    if (key === STO.key && (STO.state !== 'err' || Date.now() - STO.t < 60000)) return;
    if (STO.state === 'loading' && key === STO.key) return;
    Object.assign(STO, { key: key, state: 'loading', sum: null, near: [], site: null, err: '', t: Date.now() });
    renderSto();
    if (!navigator.onLine) { STO.state = 'err'; STO.err = 'serve la rete'; renderSto(); return; }
    try {
      const near = await wikiNear(t.lat, t.lon, 10000);
      let sum = null;
      // la voce principale: il luogo col suo nome (paese, vetta…), altrimenti il Comune, altrimenti la voce più vicina
      for (const title of [t.name, t.com, near[0] && near[0].title]) {
        if (!title || sum) continue;
        try { sum = await wikiSummary(title); } catch (e) {}
        if (sum && sum.lat !== null && geo(t.lat, t.lon, sum.lat, sum.lon).d > 30000) sum = null;   // omonimo lontano
      }
      if (key !== STO.key) return;
      STO.sum = sum;
      STO.near = near.filter((n) => !sum || n.title !== sum.title).slice(0, 10);
      STO.state = 'ok';
      renderSto();
      if (sum && sum.qid) { try { STO.site = await wikiSite(sum.qid); } catch (e) {} if (key === STO.key) renderSto(); }
    } catch (e) {
      if (key !== STO.key) return;
      STO.state = 'err'; STO.err = navigator.onLine ? 'Wikipedia non risponde ora' : 'serve la rete';
      renderSto();
    }
  }
  function stoTile() {
    if (STO.state === 'ok') return STO.sum ? STO.sum.title : (STO.near.length ? STO.near.length + ' voci nei dintorni' : 'nessuna voce qui vicino');
    if (STO.state === 'err') return STO.err;
    return 'in caricamento…';
  }
  function renderSto() {
    $('puSto').hidden = STO.state === 'idle';
    let h = '';
    if (STO.state === 'loading') h = '<p class="stoNote">Cerco su Wikipedia…</p>';
    else if (STO.state === 'err') h = '<p class="stoNote">' + escHtml(STO.err) + '.</p>';
    else {
      if (STO.sum) {
        h += '<div class="stoSum">' + (STO.sum.thumb ? '<img src="' + escHtml(STO.sum.thumb) + '" alt="">' : '') + '<b>' + escHtml(STO.sum.title) + '</b><p>' + escHtml(STO.sum.text) + '</p>' +
          '<a href="' + escHtml(STO.sum.url) + '" target="_blank" rel="noopener">Leggi su Wikipedia ›</a>' +
          (STO.site ? '<a href="' + escHtml(STO.site) + '" target="_blank" rel="noopener">Sito ufficiale ›</a>' : '') + '</div>';
      }
      if (STO.near.length) {
        h += '<h4>Nei dintorni</h4><div class="stoNear">' + STO.near.map((n) =>
          '<a href="' + WIKI + '/wiki/' + encodeURIComponent(n.title.replace(/ /g, '_')) + '" target="_blank" rel="noopener"><b>' + escHtml(n.title) + '</b><span>' + fmtDist(n.d) + '</span></a>').join('') + '</div>';
      }
      if (!STO.sum && !STO.near.length) h += '<p class="stoNote">Nessuna voce di Wikipedia entro 10 km.</p>';
      h += '<p class="hint">Testi da Wikipedia in italiano (CC BY-SA 4.0): introduttivi, da verificare sulle fonti (per i beni tutelati: Catalogo generale dei Beni Culturali e Vincoli in rete, in arrivo con l’ambito Vincoli).</p>';
    }
    if ($('stoBox').dataset.h !== h) { $('stoBox').innerHTML = h; $('stoBox').dataset.h = h; }
  }
  window.__panoSto = () => STO;
