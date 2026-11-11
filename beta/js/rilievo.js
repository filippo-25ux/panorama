/* Orientis – Rilievo del terreno (DEM).
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- Rilievo del terreno ----------
     Quote da Terrain Tiles (Mapzen, Registry of Open Data on AWS), formato «Terrarium»:
     quota in metri = R × 256 + G + B / 256 − 32768. In Europa i dati vengono da EU-DEM (Copernicus), altrove da SRTM/GMTED (USGS).
     Con le quote si calcola il profilo dell'orizzonte attorno al punto di ripresa:
     per ogni mezzo grado di direzione, l'angolo più alto raggiunto dal terreno fino a ogni distanza. */
  const DEM_HOSTS = [
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'   // (la copia europea risponde 403 dal sito: non usata)
  ];
  const DEM_KEY = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/';    // nome stabile nella memoria del telefono
  const DEM_CACHE = 'panorama-rilievo-v1';
  const DEM_LEVELS = [{ z: 12, r: 6000 }, { z: 11, r: 18000 }, { z: 10, r: Infinity }];   // più dettaglio vicino, meno lontano
  const DEM_STEP = 0.5;          // passo del profilo in gradi di direzione
  const DEM_NEAR = 200;          // il terreno entro 200 m non conta (celle di 30 m, case e alberi: troppo incerto)
  const EYE = 1.6;               // altezza degli occhi sul terreno
  const DEM = { tiles: new Map(), host: 0, state: 'off', note: '', err: '', busy: false, retryAt: 0, ground: null, prof: null, gen: 0 };

  function demZoomFor(d) {
    for (const L of DEM_LEVELS) if (d <= L.r) return L.z;
    return DEM_LEVELS[DEM_LEVELS.length - 1].z;
  }
  function demXY(z, lat, lon) {
    const n = 1 << z, s = Math.sin(Math.max(-85, Math.min(85, lat)) * RAD);
    return { fx: (lon + 180) / 360 * n, fy: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
  }
  // Quota in un punto (interpolata tra le 4 celle vicine); se manca il tassello di quel dettaglio, prova quelli meno dettagliati
  let demLast = { k: '', t: null };
  function demSample(z, lat, lon) {
    const p = demXY(z, lat, lon);
    const tx = Math.floor(p.fx), ty = Math.floor(p.fy);
    const k = z + '/' + tx + '/' + ty;
    let t;
    if (demLast.k === k) t = demLast.t;
    else { t = DEM.tiles.get(k); demLast = { k: k, t: t }; }
    if (!(t instanceof Float32Array)) return null;
    const px = Math.min(255, Math.max(0, (p.fx - tx) * 256 - 0.5)), py = Math.min(255, Math.max(0, (p.fy - ty) * 256 - 0.5));
    const x0 = Math.min(254, Math.floor(px)), y0 = Math.min(254, Math.floor(py)), ax = px - x0, ay = py - y0;
    const i = y0 * 256 + x0;
    return (t[i] * (1 - ax) + t[i + 1] * ax) * (1 - ay) + (t[i + 256] * (1 - ax) + t[i + 257] * ax) * ay;
  }
  function demGet(lat, lon, z) {
    for (let zz = z; zz >= DEM_LEVELS[DEM_LEVELS.length - 1].z; zz--) {
      const v = demSample(zz, lat, lon);
      if (v !== null) return v;
    }
    return null;
  }
  // Quota dell'osservatore: GPS se affidabile (mai sotto il terreno), altrimenti terreno + altezza degli occhi
  function obsAlt() {
    const g = S.dem ? DEM.ground : null;
    if (S.alt !== null && (S.altAcc === null || S.altAcc <= 25)) return g !== null ? Math.max(S.alt, g + 1) : S.alt;
    if (g !== null) return g + EYE;
    return S.alt;
  }

  // Tasselli che servono attorno al punto: dettaglio massimo entro 6 km, medio entro 18 km, poi più grossolano
  function demTileList(lat, lon, R) {
    const out = [];
    for (const L of DEM_LEVELS) {
      const r = Math.min(L.r, R) + 500;
      const dLat = r / (EARTH * RAD), dLon = dLat / Math.cos(lat * RAD);
      const a = demXY(L.z, lat + dLat, lon - dLon), b = demXY(L.z, lat - dLat, lon + dLon);
      for (let x = Math.floor(a.fx); x <= Math.floor(b.fx); x++) {
        for (let y = Math.floor(a.fy); y <= Math.floor(b.fy); y++) out.push(L.z + '/' + x + '/' + y);
      }
      if (L.r >= R) break;
    }
    return out;
  }

  // Lettura del PNG senza passare dal disegno su canvas (che su alcuni telefoni altera i colori e quindi le quote)
  async function pngDecode(buf) {
    const u = new Uint8Array(buf), dv = new DataView(buf);
    if (u[0] !== 0x89 || u[1] !== 0x50 || u[2] !== 0x4e || u[3] !== 0x47) throw new Error('non è un PNG');
    let p = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0, plte = null;
    const idat = [];
    while (p + 8 <= u.length) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]);
      if (type === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); bd = u[p + 16]; ct = u[p + 17]; il = u[p + 20]; }
      else if (type === 'PLTE') plte = u.subarray(p + 8, p + 8 + len);
      else if (type === 'IDAT') idat.push(u.subarray(p + 8, p + 8 + len));
      else if (type === 'IEND') break;
      p += 12 + len;
    }
    if (bd !== 8 || il !== 0 || !(ct === 2 || ct === 6 || (ct === 3 && plte))) throw new Error('PNG di tipo inatteso');
    const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const bpp = ct === 2 ? 3 : ct === 6 ? 4 : 1, stride = w * bpp;
    if (raw.length < h * (stride + 1)) throw new Error('PNG incompleto');
    const out = new Uint8Array(h * stride);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride, prev = dst - stride;
      for (let i = 0; i < stride; i++) {
        const x = raw[src + i];
        const a = i >= bpp ? out[dst + i - bpp] : 0;
        const b = y > 0 ? out[prev + i] : 0;
        const c = (i >= bpp && y > 0) ? out[prev + i - bpp] : 0;
        let v;
        if (f === 0) v = x;
        else if (f === 1) v = x + a;
        else if (f === 2) v = x + b;
        else if (f === 3) v = x + ((a + b) >> 1);
        else if (f === 4) {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        } else throw new Error('PNG con filtro sconosciuto');
        out[dst + i] = v & 255;
      }
    }
    const n = w * h, rgb = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (ct === 3) { const q = out[i] * 3; rgb[i * 3] = plte[q]; rgb[i * 3 + 1] = plte[q + 1]; rgb[i * 3 + 2] = plte[q + 2]; }
      else { rgb[i * 3] = out[i * bpp]; rgb[i * 3 + 1] = out[i * bpp + 1]; rgb[i * 3 + 2] = out[i * bpp + 2]; }
    }
    return { w: w, h: h, rgb: rgb };
  }
  // Riserva: lettura tramite canvas (se il telefono non sa decomprimere da solo)
  async function pngViaCanvas(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, 256, 256);
    const d = ctx.getImageData(0, 0, 256, 256).data, rgb = new Uint8Array(65536 * 3);
    for (let i = 0; i < 65536; i++) { rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2]; }
    return { w: 256, h: 256, rgb: rgb };
  }
  async function demDecode(blob) {
    let img;
    try {
      if (typeof DecompressionStream !== 'function') throw new Error('no');
      img = await pngDecode(await blob.arrayBuffer());
    } catch (e) { img = await pngViaCanvas(blob); }
    if (img.w !== 256 || img.h !== 256) throw new Error('tassello di misura inattesa');
    const t = new Float32Array(65536), r = img.rgb;
    let bad = 0;
    for (let i = 0; i < 65536; i++) {
      const v = r[i * 3] * 256 + r[i * 3 + 1] + r[i * 3 + 2] / 256 - 32768;
      t[i] = v;
      if (v < -12000 || v > 9000) bad++;
    }
    if (bad > 100) throw new Error('quote non plausibili');
    return t;
  }
  async function demFetch(key) {
    const path = key + '.png';
    let cache = null, blob = null;
    try { cache = await caches.open(DEM_CACHE); const r = await cache.match(DEM_KEY + path); if (r) blob = await r.blob(); } catch (e) { cache = null; }
    if (!blob) {
      let lastErr = null;
      for (let k = 0; k < DEM_HOSTS.length && !blob; k++) {
        const h = (DEM.host + k) % DEM_HOSTS.length;
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        try {
          const res = await fetch(DEM_HOSTS[h] + path, { signal: ctl.signal, mode: 'cors' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          blob = await res.blob();
          DEM.host = h;
        } catch (e) { lastErr = e; } finally { clearTimeout(timer); }
      }
      if (!blob) throw lastErr || new Error('rete');
      const t = await demDecode(blob);
      if (cache) cache.put(DEM_KEY + path, new Response(blob, { headers: { 'Content-Type': 'image/png' } })).catch(() => {});
      return t;
    }
    return demDecode(blob);
  }
  async function demLoad(keys) {
    const todo = keys.filter((k) => !(DEM.tiles.get(k) instanceof Float32Array));
    let i = 0, done = 0, fail = 0;
    const work = async () => {
      while (i < todo.length) {
        const k = todo[i++];
        try { DEM.tiles.set(k, await demFetch(k)); } catch (e) { fail++; DEM.err = describeError(e); }
        done++;
        DEM.note = 'Rilievo: carico ' + done + '/' + todo.length;
      }
    };
    await Promise.all([work(), work(), work(), work(), work(), work()]);
    // Libera i tasselli lontani se la memoria cresce troppo
    if (DEM.tiles.size > 160) {
      const keep = new Set(keys);
      for (const k of DEM.tiles.keys()) if (!keep.has(k)) DEM.tiles.delete(k);
      demLast = { k: '', t: null };
    }
    return { fail: fail, total: todo.length };
  }

  // Profilo dell'orizzonte: per ogni direzione (passo 0,5°) e ogni distanza, l'angolo più alto raggiunto dal terreno fin lì
  async function demProfile(lat, lon, R, obs) {
    const ds = [];
    for (let d = DEM_NEAR; d <= R; d += Math.max(25, d * 0.012)) ds.push(d);
    const nD = ds.length, nA = Math.round(360 / DEM_STEP);
    const cum = new Float32Array(nA * nD), hz = new Float32Array(nA), hzD = new Float32Array(nA);
    // v29: tre livelli di creste (vicina, media, lontana): l'orizzonte che si vedrebbe se il terreno finisse a quelle distanze
    const LV = ridgeLevels(R), hzL = new Float32Array(3 * nA), hzLD = new Float32Array(3 * nA);
    const kLat = 1 / (EARTH * RAD), kLon = kLat / Math.cos(lat * RAD);
    const zs = ds.map(demZoomFor), drops = ds.map((d) => d * d / (2 * EARTH) * (1 - REFR));
    for (let a = 0; a < nA; a++) {
      const br = a * DEM_STEP * RAD, cb = Math.cos(br) * kLat, sb = Math.sin(br) * kLon;
      let mx = -90, mxD = 0, k = 0;
      for (let i = 0; i < nD; i++) {
        const d = ds[i];
        const h = demGet(lat + d * cb, lon + d * sb, zs[i]);
        if (h !== null) {
          const ang = Math.atan2(h - drops[i] - obs, d) / RAD;
          if (ang > mx) { mx = ang; mxD = d; }
        }
        cum[a * nD + i] = mx;
        while (k < 3 && (i === nD - 1 || ds[i + 1] > LV[k])) { hzL[k * nA + a] = mx; hzLD[k * nA + a] = mxD; k++; }
      }
      while (k < 3) { hzL[k * nA + a] = mx; hzLD[k * nA + a] = mxD; k++; }
      hz[a] = mx; hzD[a] = mxD;
      if ((a & 63) === 63) await new Promise((r) => setTimeout(r, 0));   // lascia respirare lo schermo
    }
    return { lat: lat, lon: lon, R: R, obs: obs, ds: Float32Array.from(ds), nD: nD, nA: nA, cum: cum, hz: hz, hzD: hzD, LV: LV, hzL: hzL, hzLD: hzLD };
  }
  // Distanze dei tre livelli: vicina (fino a 4 km), media (fino a 12 km), lontana (tutta la distanza scelta)
  function ridgeLevels(R) {
    return [Math.min(4000, R * 0.3), Math.min(12000, R * 0.6), R];
  }
  // Angolo più alto del terreno tra il punto di ripresa e la distanza d, nella direzione b (minimo tra i due raggi vicini: nel dubbio si mostra)
  function demOccl(P, b, d) {
    const ds = P.ds;
    if (d < ds[0]) return -90;
    let lo = 0, hi = P.nD - 1;
    if (d >= ds[hi]) lo = hi;
    else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ds[m] <= d) lo = m; else hi = m; }
    const f = ((b % 360) + 360) % 360 / DEM_STEP;
    const a0 = Math.floor(f) % P.nA, a1 = (a0 + 1) % P.nA;
    return Math.min(P.cum[a0 * P.nD + lo], P.cum[a1 * P.nD + lo]);
  }
  // Il luogo è coperto da rilievi più vicini? Vette: basta la cima; paesi: anche i tetti (25 m) devono essere coperti
  function demHidden(P, it) {
    const e = (it.e !== null && it.e !== undefined) ? it.e : (it.ge !== undefined ? it.ge : null);
    if (e === null || it.d > P.R + 100) return false;
    const lim = it.d - Math.max(250, it.d * 0.04);   // la montagna stessa non copre la propria cima
    if (lim < DEM_NEAR) return false;
    const top = e + (it.t === 'peak' ? 0 : 25);
    return demOccl(P, it.b, lim) > angTo(top, it.d, P.obs) + 0.15;
  }
  // Applica il rilievo ai luoghi: quota del terreno per i paesi, luoghi nascosti
  function demApply() {
    const P = (S.dem && DEM.prof) ? DEM.prof : null;
    for (const it of items) {
      if (!S.dem) { it.ge = undefined; it.hid = false; it.geGen = -1; continue; }
      if (it.geGen !== DEM.gen && it.d !== undefined) {
        const g = demGet(it.lat, it.lon, demZoomFor(it.d));
        if (g !== null) { it.ge = Math.round(g); it.geGen = DEM.gen; }
      }
      it.hid = (P && it.d !== undefined && !it.skip) ? demHidden(P, it) : false;
    }
  }
  function demStateUI() {
    const el = $('demState');
    if (!el) return;
    el.textContent = !S.dem ? '' : DEM.state === 'ok' ? 'attivo' : DEM.state === 'load' ? 'in caricamento' : DEM.state === 'err' ? 'non disponibile' : DEM.state === 'part' ? 'incompleto' : '';
  }
  // Ricarica il rilievo quando serve: prima volta, spostamento oltre 150 m, distanza più ampia, quota cambiata di molto
  function demUpdate() {
    if (!S.dem || S.lat === null || DEM.busy || Date.now() < DEM.retryAt) return;
    const P = DEM.prof, R = S.radius;
    if (P && DEM.state !== 'part') {
      const moved = geo(P.lat, P.lon, S.lat, S.lon).d;
      const o = obsAlt();
      if (moved < 150 && P.R >= R && (o === null || Math.abs(o - P.obs) < 8)) return;
    }
    demRun();
  }
  async function demRun() {
    DEM.busy = true;
    const lat = S.lat, lon = S.lon, R = S.radius;
    try {
      if (!DEM.prof) DEM.state = 'load';
      demStateUI();
      const keys = demTileList(lat, lon, R);
      const res = await demLoad(keys);
      const have = keys.filter((k) => DEM.tiles.get(k) instanceof Float32Array).length;
      if (have === 0) {
        DEM.state = 'err';
        DEM.note = 'Rilievo non disponibile (' + (DEM.err || 'rete') + '): la prima volta in un luogo serve la connessione';
        DEM.retryAt = Date.now() + 60000;
        return;
      }
      const g = demGet(lat, lon, DEM_LEVELS[0].z);
      DEM.ground = g;
      DEM.gen++;
      const obs = obsAlt();
      if (obs === null) { DEM.retryAt = Date.now() + 5000; return; }
      DEM.prof = await demProfile(lat, lon, R, obs);
      DEM.state = have < keys.length ? 'part' : 'ok';
      DEM.note = have < keys.length ? 'Rilievo incompleto (' + (keys.length - have) + ' tasselli mancanti): riprovo tra poco' : '';
      if (have < keys.length) DEM.retryAt = Date.now() + 60000;
      demApply();
      syncMarkers();
    } catch (e) {
      DEM.state = DEM.prof ? DEM.state : 'err';
      DEM.note = 'Rilievo: errore (' + describeError(e) + ')';
      DEM.retryAt = Date.now() + 60000;
    } finally {
      DEM.busy = false;
      demStateUI();
    }
  }

  setInterval(() => { if (!document.hidden) demUpdate(); }, 3000);
