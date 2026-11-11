/* Orientis – Fotovoltaico (PVGIS).
   (v41: parte del codice principale, spostata da index.html senza modifiche; si carica in ordine con gli altri file di js/.) */
'use strict';

  /* ---------- v40: fotovoltaico (PVGIS 5.3 PVcalc, attraverso il proxy) ----------
     Parametri come lo strumento «Fotovoltaico connesso alla rete» di PVGIS; inclinazione misurata col telefono appoggiato
     sulla falda, orientamento con la bussola; orizzonte di PVGIS, dell'app (dal rilievo) o nessuno. */
  const PV = { lat: null, lon: null, name: '', live: null, liveT: 0, busy: false, last: null, hzMemo: null };
  const PV_MON = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D'];
  const PV_MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  function pvSetTarget(lat, lon, name) {
    const ch = PV.lat !== lat || PV.lon !== lon;
    PV.lat = lat; PV.lon = lon; PV.name = name || '';
    $('puPv').hidden = lat === null;
    if (lat === null) return;
    setText('pvWhere', 'Stima per ' + (name ? name + ' · ' : '') + lat.toFixed(4).replace('.', ',') + ' N, ' + lon.toFixed(4).replace('.', ',') + ' E');
    if (ch && PV.last && (PV.last.lat !== lat || PV.last.lon !== lon)) { $('pvOut').innerHTML = '<p class="pvHelp">Il punto è cambiato: premi di nuovo «Calcola».</p>'; PV.last = null; }
  }
  function pvAspText() {
    const a = parseFloat($('pvAsp').value);
    if (!isFinite(a)) { setText('pvAspTxt', ''); return; }
    setText('pvAspTxt', 'Moduli rivolti a ' + pvDir(a) + ' (0° = Sud, −90° = Est, +90° = Ovest).');
  }
  function pvDir(a) {   // orientamento PVGIS (0 = Sud, 90 = Ovest) → punto cardinale
    const az = ((a + 180) % 360 + 360) % 360;
    return ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ovest', 'Ovest', 'Nord-Ovest'][Math.round(az / 45) % 8];
  }
  function pvModeUI() {
    const t = $('pvTrack').value;
    $('pvFixed').hidden = t !== 'fixed';
    $('pvAxis').hidden = t === 'fixed' || t === 'two';
    setText('pvAxisLbl', t === 'vertical' ? 'Inclinazione dei moduli' : 'Inclinazione dell’asse');
    const oa = $('pvOptAll').checked;
    $('pvOptInc').disabled = oa; $('pvAng').disabled = oa || $('pvOptInc').checked; $('pvAsp').disabled = oa;
    $('pvAxAng').disabled = $('pvAxOpt').checked;
    $('pvCostBox').hidden = !$('pvCost').checked;
    pvAspText();
  }
  ['pvTrack', 'pvOptAll', 'pvOptInc', 'pvAxOpt', 'pvCost'].forEach((id) => $(id).addEventListener('change', pvModeUI));
  $('pvAsp').addEventListener('input', pvAspText);
  // misura dal vivo: inclinazione (telefono appoggiato sulla falda) o orientamento (bussola, telefono come in Guarda)
  function pvLiveStart(kind) {
    if (kind === 'tilt' && S.oriB === null) { toast('Servono i sensori di movimento: avvia l’app dalla schermata Guarda.', 4000); return; }
    if (kind === 'asp' && S.heading === null) { toast('Serve la bussola: avvia l’app dalla schermata Guarda.', 4000); return; }
    PV.live = kind;
    $('pvLive').hidden = false;
    setText('pvLiveTxt', kind === 'tilt'
      ? 'Appoggia il telefono sulla falda, schermo verso l’alto, con il lato lungo lungo la linea di pendenza. Aspetta che il numero sia fermo.'
      : 'Mettiti di spalle al colmo e tieni il telefono dritto davanti a te, come per inquadrare, nella direzione verso cui scende la falda.');
    clearInterval(PV.liveT);
    PV.liveT = setInterval(pvLiveTick, 200);
    pvLiveTick();
  }
  function pvLiveVal() {
    if (PV.live === 'tilt') {
      if (S.oriB === null) return null;
      const b = S.oriB * RAD, g = S.oriG * RAD;
      return Math.acos(Math.max(-1, Math.min(1, Math.cos(b) * Math.cos(g)))) / RAD;
    }
    if (S.heading === null) return null;
    let a = trueHeading() - 180;
    if (a > 180) a -= 360; if (a < -180) a += 360;
    return a;
  }
  function pvLiveTick() {
    const v = pvLiveVal();
    setText('pvLiveVal', v === null ? '–' : (v > 0 && PV.live === 'asp' ? '+' : '') + Math.round(v) + '°');
  }
  function pvLiveStop(use) {
    if (use && PV.live) {
      const v = pvLiveVal();
      if (v !== null) {
        if (PV.live === 'tilt') { $('pvAng').value = Math.round(v); $('pvOptInc').checked = false; }
        else $('pvAsp').value = Math.round(v);
        $('pvOptAll').checked = false;
      }
    }
    PV.live = null; clearInterval(PV.liveT); $('pvLive').hidden = true; pvModeUI();
  }
  $('pvMeasTilt').addEventListener('click', () => pvLiveStart('tilt'));
  $('pvMeasAsp').addEventListener('click', () => pvLiveStart('asp'));
  $('pvLiveUse').addEventListener('click', () => pvLiveStop(true));
  $('pvLiveX').addEventListener('click', () => pvLiveStop(false));
  // orizzonte dall'app: 48 direzioni (passo 7,5°, da Nord in senso orario), angolo massimo del terreno entro 15 km
  async function pvHorizon(lat, lon) {
    const k = lat.toFixed(4) + ',' + lon.toFixed(4);
    if (PV.hzMemo && PV.hzMemo.k === k) return PV.hzMemo.v;
    let P = null;
    if (S.lat !== null && DEM.prof && geo(DEM.prof.lat, DEM.prof.lon, lat, lon).d < 100) P = DEM.prof;
    else {
      const R = 15000, keys = demTileList(lat, lon, R);
      await demLoad(keys);
      const g = demGet(lat, lon, DEM_LEVELS[0].z);
      if (g === null) throw new Error('rilievo non disponibile');
      P = await demProfile(lat, lon, R, g + 3);
    }
    const n = 48, per = P.nA / n, v = [];
    for (let i = 0; i < n; i++) {
      let mx = 0;
      for (let j = Math.round(i * per - per / 2); j <= Math.round(i * per + per / 2); j++) mx = Math.max(mx, P.hz[((j % P.nA) + P.nA) % P.nA]);
      v.push(Math.round(mx * 10) / 10);
    }
    PV.hzMemo = { k: k, v: v };
    return v;
  }
  function pvNum(id, lo, hi) { const x = parseFloat(String($(id).value).replace(',', '.')); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; }
  async function pvRun() {
    if (PV.busy || PV.lat === null) return;
    const kwp = pvNum('pvKwp', 0.05, 5000), loss = pvNum('pvLoss', 0, 80);
    if (kwp === null || loss === null) { $('pvOut').innerHTML = '<p class="pvErr">Controlla potenza e perdite.</p>'; return; }
    const q = new URLSearchParams({ lat: PV.lat.toFixed(5), lon: PV.lon.toFixed(5), peakpower: String(kwp), loss: String(loss),
      pvtechchoice: $('pvTech').value, mountingplace: $('pvMount').value });
    const t = $('pvTrack').value;
    if (t === 'fixed') {
      if ($('pvOptAll').checked) q.set('optimalangles', '1');
      else {
        if ($('pvOptInc').checked) q.set('optimalinclination', '1'); else q.set('angle', String(pvNum('pvAng', 0, 90) || 0));
        q.set('aspect', String(pvNum('pvAsp', -180, 180) || 0));
      }
    } else {
      q.set('fixed', '0');
      if (t === 'two') q.set('twoaxis', '1');
      else {
        const ax = t === 'inclined' ? 'inclined' : 'vertical';
        q.set(ax + '_axis', '1');
        if ($('pvAxOpt').checked) q.set(ax + '_optimum', '1'); else q.set(ax + 'axisangle', String(pvNum('pvAxAng', 0, 90) || 0));
      }
    }
    const hor = $('pvHor').value;
    PV.busy = true; $('pvGo').disabled = true;
    $('pvOut').innerHTML = '<p class="pvHelp">' + (hor === 'app' ? 'Calcolo l’orizzonte dal rilievo, poi chiedo a PVGIS…' : 'Chiedo a PVGIS…') + '</p>';
    try {
      if (hor === 'none') q.set('usehorizon', '0');
      else if (hor === 'app') { q.set('usehorizon', '1'); q.set('userhorizon', (await pvHorizon(PV.lat, PV.lon)).join(',')); }
      if ($('pvCost').checked) {
        q.set('pvprice', '1'); q.set('systemcost', String(pvNum('pvSys', 0, 1e8) || 0));
        q.set('interest', String(pvNum('pvInt', 0, 30) || 0)); q.set('lifetime', String(Math.round(pvNum('pvLife', 1, 60) || 25)));
      }
      const r = await fetch(CAT_BASE + '/pvgis?' + q.toString());
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
      if (!r.ok || !j || !j.outputs) throw new Error(j && j.message ? j.message : (r.status === 404 ? 'il server dell’app va aggiornato (versione 3)' : 'risposta non valida (' + r.status + ')'));
      PV.last = { lat: PV.lat, lon: PV.lon };
      $('pvOut').innerHTML = pvHtml(j, kwp, hor);
    } catch (e) {
      $('pvOut').innerHTML = '<p class="pvErr">Calcolo non riuscito: ' + escHtml(describeError(e)) + '. Riprova tra poco.</p>';
    } finally { PV.busy = false; $('pvGo').disabled = false; }
  }
  $('pvGo').addEventListener('click', pvRun);
  $('sitBox').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) $(b.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  function pvHtml(j, kwp, hor) {
    const O = j.outputs, I = j.inputs || {}, key = Object.keys(O.totals || {})[0];
    const T = O.totals[key], M = (O.monthly && O.monthly[key]) || [];
    const ms = (I.mounting_system && I.mounting_system[key]) || {};
    const f0 = (x) => fmtInt(x), f1 = (x) => nf(x, 1);
    const ey = T.E_y, hy = T['H(i)_y'];
    let h = '<div class="pvBig"><div><b>' + f0(ey) + '</b><span>kWh all’anno</span></div><div><b>' + f0(ey / kwp) + '</b><span>kWh per kWp</span></div>' +
      '<div><b>' + f0(hy) + '</b><span>kWh/m² sul piano dei moduli</span></div></div>';
    // grafico mensile
    const mx = Math.max(1, ...M.map((m) => m.E_m)), W = 340, H = 120, bw = W / 12;
    h += '<h5>Produzione mensile, kWh</h5><svg viewBox="0 0 ' + W + ' ' + (H + 16) + '" role="img" aria-label="Produzione mensile">' +
      M.map((m, i) => { const bh = (m.E_m / mx) * (H - 14); return '<rect class="b" x="' + (i * bw + 4) + '" y="' + (H - bh) + '" width="' + (bw - 8) + '" height="' + bh + '" rx="2"><title>' + PV_MESI[i] + ': ' + f0(m.E_m) + ' kWh</title></rect>' +
        '<text x="' + (i * bw + bw / 2) + '" y="' + (H - bh - 3) + '" text-anchor="middle">' + f0(m.E_m) + '</text><text x="' + (i * bw + bw / 2) + '" y="' + (H + 12) + '" text-anchor="middle">' + PV_MON[i] + '</text>'; }).join('') + '</svg>';
    // impostazioni usate da PVGIS (anche gli angoli ottimali)
    const ang = (o, u) => o && o.value !== undefined ? nf(o.value, 0) + '°' + (o.optimal ? ' (ottimale)' : '') : '–';
    const rows = [];
    if (key === 'fixed') rows.push(['Inclinazione', ang(ms.slope)], ['Orientamento', ms.azimuth && ms.azimuth.value !== undefined ? nf(ms.azimuth.value, 0) + '°, verso ' + pvDir(ms.azimuth.value) + (ms.azimuth.optimal ? ' (ottimale)' : '') : '–']);
    else if (/two/i.test(key)) rows.push(['Sistema', 'inseguimento su due assi']);
    else rows.push(['Sistema', /vert/i.test(key) ? 'inseguimento su asse verticale' : 'inseguimento su asse inclinato'], [/vert/i.test(key) ? 'Inclinazione dei moduli' : 'Inclinazione dell’asse', ang(ms.slope)]);
    rows.push(['Variabilità tra gli anni', '± ' + f0(T.SD_y) + ' kWh']);
    const md = I.meteo_data || {};
    rows.push(['Dati di irraggiamento', (md.radiation_db || 'PVGIS') + (md.year_min ? ', ' + md.year_min + '–' + md.year_max : '')]);
    rows.push(['Orizzonte', hor === 'none' ? 'non considerato' : hor === 'app' ? 'calcolato dall’app (rilievo ~30 m)' : 'di PVGIS (rilievo ~90 m)']);
    h += '<h5>Impostazioni usate</h5><div class="vinRows">' + rows.map((x) => '<span>' + x[0] + '</span><b>' + escHtml(x[1]) + '</b>').join('') + '</div>';
    // perdite
    const pc = (x) => x === undefined || x === null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '') + nf(Math.abs(x), 1) + '%';
    h += '<h5>Perdite e guadagni</h5><div class="vinRows">' +
      '<span>Angolo d’incidenza (riflessione)</span><b>' + pc(T.l_aoi) + '</b><span>Effetti spettrali</span><b>' + pc(T.l_spec) + '</b>' +
      '<span>Temperatura e irraggiamento basso</span><b>' + pc(T.l_tg) + '</b><span>Sistema (cavi, inverter, sporco…)</span><b>' + pc(-(I.pv_module ? I.pv_module.system_loss : 0)) + '</b>' +
      '<span>Totale</span><b>' + pc(T.l_total) + '</b></div>';
    if (T.LCOE_pv !== undefined && T.LCOE_pv !== null) h += '<h5>Costo dell’energia</h5><div class="vinRows"><span>Costo livellato (LCOE)</span><b>' + nf(T.LCOE_pv, 3) + ' €/kWh</b></div>';
    h += '<h5>Mese per mese</h5><table class="sitU"><tr><th>Mese</th><th>kWh</th><th>kWh/m²</th></tr>' +
      M.map((m, i) => '<tr><td>' + PV_MESI[i] + '</td><td>' + f0(m.E_m) + '</td><td>' + f1(m['H(i)_m']) + '</td></tr>').join('') + '</table>';
    h += '<p class="sitNote">Stima di PVGIS su anni di dati satellitari: non è un progetto. Non considera le ombre vicine (edifici, alberi, comignoli) né la neve; la produzione reale può variare di anno in anno.</p>' +
      '<p class="sitSrc">PVGIS © Unione europea, Centro comune di ricerca (JRC). <a href="https://re.jrc.ec.europa.eu/pvg_tools/it/" target="_blank" rel="noopener">Apri PVGIS ›</a></p>';
    return h;
  }
  pvModeUI();
  window.__panoPv = PV;
  function sitoTile(o) {
    if (!o) return S.lat === null ? 'in attesa del GPS' : 'in attesa del Comune';
    if (!o.row) return SITO.state === 'err' ? 'non disponibile ora (serve la rete la prima volta)' : SITO.state === 'ok' ? 'Comune non trovato nelle tabelle' : 'in caricamento…';
    const fx = SITO.d.fx && SITO.d.fx[o.com.i];
    const cl = o.row[1] ? 'clima ' + o.row[1] + (o.row[2] ? ', ' + fmtInt(o.row[2]) + ' GG' : '') : fx ? 'clima ' + [...new Set(fx.map((x) => x[1]))].join('/') + ' (ex Comuni)' : 'clima non in tabella';
    return 'zona sismica ' + o.row[0] + ' · ' + cl + (o.neve && o.neve.q ? ' · neve ' + nf(o.neve.q, 2) + ' kN/m²' : '');
  }
  function fmtInt(x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function aLink(k, t) { return '<a href="' + SITO_LINK[k] + '" target="_blank" rel="noopener">' + t + ' ›</a>'; }
  function sitoHtml(o) {
    if (!o) return '<p class="stoNote">' + (S.lat === null ? 'In attesa del GPS.' : 'In attesa del Comune del punto.') + '</p>';
    if (!o.row && SITO.state !== 'ok') return '<p class="stoNote">' + (SITO.state === 'err' ? 'Tabelle non disponibili ora: serve la rete la prima volta, poi restano sul telefono.' : 'Carico le tabelle…') + '</p>';
    const r = o.row, D = SITO.d || {};
    const rows = (a) => '<div class="vinRows">' + a.map((x) => '<span>' + x[0] + '</span><b class="' + (x[2] || '') + '">' + escHtml(x[1]) + '</b>').join('') + '</div>';
    let h = '';
    // Sismica
    h += '<h4>Sismica</h4>';
    if (r && r[0]) {
      const zz = String(r[0]).split('-'), n = Math.min(...zz.map((x) => parseInt(x, 10)));
      h += rows([['Zona sismica', zz.join(', '), n <= 2 ? 'warn' : '']]);
      h += '<p class="sitTxt">' + (zz.length > 1 ? 'Il territorio comunale è diviso in più zone, secondo la delibera della Regione. La più pericolosa è la ' + n + ': ' : 'Zona ' + n + ': ') +
        (SIS_TXT[n] || '') + '.' + (/[A-Z]/.test(r[0]) ? ' La lettera indica una sottozona decisa dalla Regione.' : '') +
        ' Di norma in tutta Italia si progetta secondo le NTC 2018; deposito o autorizzazione al Genio civile dipendono dalla Regione e dalla zona.</p>';
    } else h += rows([['Zona sismica', 'non trovata', 'na']]);
    h += '<p class="sitSrc">Dipartimento della Protezione Civile, classificazione per Comune' + (D.sisV ? ' (' + D.sisV + ')' : '') + '. ' + aLink('sis', 'Fonte') + '</p>';
    h += '<p class="sitTxt">Pericolosità di base del punto (a<sub>g</sub>, F<sub>0</sub>, T<sub>C</sub>* per i periodi di ritorno delle NTC): non ancora calcolata nell’app. I valori ufficiali si leggono sulla mappa interattiva INGV, alle coordinate ' + o.lat.toFixed(4).replace('.', ',') + ' N, ' + o.lon.toFixed(4).replace('.', ',') + ' E.</p>' +
      '<p class="sitSrc"><a href="https://esse1-gis.mi.ingv.it/" target="_blank" rel="noopener">Mappa INGV della pericolosità sismica ›</a></p>';
    // Clima (Comuni nati da fusione dopo il 2009: valori degli ex Comuni)
    h += '<h4>Clima e riscaldamento</h4>';
    const fx = D.fx && D.fx[o.com.i], ntab = D.nt && D.nt[o.com.i];
    const zc = r && r[1] ? r[1] : null;
    if (fx) {
      const gs = fx.map((x) => x[2]).filter((x) => x > 0), zs = [...new Set(fx.map((x) => x[1]))].sort();
      h += rows([['Zona climatica', zc || zs.join(' / ')], ['Gradi giorno', gs.length ? (Math.min(...gs) === Math.max(...gs) ? fmtInt(gs[0]) : 'da ' + fmtInt(Math.min(...gs)) + ' a ' + fmtInt(Math.max(...gs))) : '–', 'sub']]);
      h += '<p class="sitTxt">Comune nato da fusione dopo il 2009: la Tabella A riporta gli ex Comuni ' +
        fx.map((x) => escHtml(x[0]) + ' (' + x[1] + ', ' + fmtInt(x[2]) + ' GG)').join(', ') + '. Quale valore applicare va verificato con il Comune.</p>';
    } else if (zc) {
      const P = CLI_PER[zc];
      h += rows([['Zona climatica', zc], ['Gradi giorno', r[2] ? fmtInt(r[2]) : '–'],
        ['Riscaldamento', P ? 'dal ' + P[0] + ' al ' + P[1] + ', max ' + P[2] + ' ore al giorno' : 'nessun limite (zona F)', 'sub']]);
    } else {
      h += rows([['Zona climatica', 'non in Tabella A', 'na']]);
      h += '<p class="sitTxt">Il Comune non compare nella Tabella A (istituito o rinominato dopo il 2009): zona e gradi giorno vanno chiesti al Comune.</p>';
    }
    h += '<p class="sitSrc">DPR 412/93, Tabella A' + (D.cliV ? ' ' + D.cliV : '') + (ntab ? ', alla voce «' + escHtml(ntab) + '»' : '') + '; periodi di accensione dal DPR 74/2013. ' + aLink('cli', 'DPR 412/93') + ' ' + aLink('acc', 'DPR 74/2013') + '</p>';
    // Requisiti minimi DM 28/10/2025: edificio di riferimento e riqualificazione in due tabelle distinte
    if (zc && DM_U.ref[zc]) {
      const z = zc, R = DM_U.ref[z], Q = DM_U.riq[z], HT = DM_HT[z];
      const u = (x) => '<td>' + nf(x, 2) + '</td>';
      h += '<h4>Requisiti minimi · zona ' + z + '</h4>';
      h += '<div class="sitCard"><b>Edificio di riferimento</b><span>Nuove costruzioni, demolizione e ricostruzione, ristrutturazioni importanti di 1° livello · DM, Appendice A</span>' +
        '<table class="sitU"><tr><th>Elemento</th><th>Tab.</th><th>U (W/m²K)</th></tr>' +
        '<tr><td>Pareti verticali opache¹</td><td class="t">1</td>' + u(R[0]) + '</tr>' +
        '<tr><td>Coperture¹</td><td class="t">2</td>' + u(R[1]) + '</tr>' +
        '<tr><td>Pavimenti¹</td><td class="t">3</td>' + u(R[2]) + '</tr>' +
        '<tr><td>Finestre, chiusure trasparenti e cassonetti (con infissi)</td><td class="t">4</td>' + u(R[3]) + '</tr>' +
        '<tr><td>Divisori tra unità immobiliari o edifici²</td><td class="t">5</td><td>0,80</td></tr>' +
        '<tr><td>g<sub>gl+sh</sub> (componenti trasparenti da Est a Ovest passando per Sud)</td><td class="t">6</td><td>0,35</td></tr></table>' +
        '<p class="sitHt">H′<sub>T</sub> massimo per nuove costruzioni e demolizione e ricostruzione (Tab. 10), W/m²K</p>' +
        '<table class="sitU ht"><tr><th>S/V &lt; 0,4</th><th>0,4 ≤ S/V &lt; 0,7</th><th>S/V ≥ 0,7</th></tr>' +
        '<tr>' + HT.map(u).join('') + '</tr></table></div>';
      h += '<div class="sitCard"><b>Riqualificazione energetica</b><span>Ristrutturazioni importanti di 2° livello e riqualificazioni · DM, Appendice B · U in W/m²K; +30% con isolamento interno o in intercapedine</span>' +
        '<table class="sitU"><tr><th>Elemento</th><th>Tab.</th><th>U max</th><th>+30%³</th></tr>' +
        '<tr><td>Pareti verticali opache¹</td><td class="t">1</td>' + u(Q[0]) + '<td class="p">' + nf(Q[0] * 1.3, 3) + '</td></tr>' +
        '<tr><td>Coperture¹</td><td class="t">2</td>' + u(Q[1]) + '<td class="p">' + nf(Q[1] * 1.3, 3) + '</td></tr>' +
        '<tr><td>Pavimenti¹</td><td class="t">3</td>' + u(Q[2]) + '<td class="p">' + nf(Q[2] * 1.3, 3) + '</td></tr>' +
        '<tr><td>Finestre, chiusure trasparenti e cassonetti (con infissi)</td><td class="t">4</td>' + u(Q[3]) + '<td class="p">–</td></tr>' +
        '<tr><td>g<sub>gl+sh</sub> (con schermature mobili, da Est a Ovest passando per Sud)</td><td class="t">8</td><td>0,35</td><td class="p">–</td></tr></table></div>';
      h += '<p class="sitNote">¹ Verso l’esterno, ambienti non climatizzati o terreno; verso ambienti non climatizzati il valore si corregge con il fattore b<sub>tr</sub> (App. A §1.1 e App. B). ' +
        '² Limite per nuove costruzioni e demolizione e ricostruzione nelle zone da C a F, esclusa la categoria E.8 (Allegato 1 §3.3). ' +
        '³ Valori delle Tabelle 1–3 aumentati del 30% (Allegato 1 §1.4.3). Le trasmittanze comprendono i ponti termici; per il 1° livello H′<sub>T</sub> dipende dal rapporto vetrato (Tab. 11).</p>';
      h += '<p class="sitSrc">DM 28 ottobre 2025 (GU n. 283 del 5/12/2025, in vigore dal 3/6/2026). ' + aLink('dm', 'Gazzetta Ufficiale') + '</p>';
    } else if (fx) h += '<p class="sitNote">Requisiti minimi: dipendono dalla zona climatica da applicare (vedi sopra).</p>';
    h += '<p class="sitSrc"><button type="button" class="sitGo" data-go="puPv">Stima della produzione fotovoltaica ›</button></p>';
    // Neve e vento
    h += '<h4>Neve e vento' + (o.quota !== null ? ' · quota ≈ ' + o.quota + ' m' : '') + '</h4>';
    const nv = [];
    if (o.neve) nv.push(['Neve: zona', o.neve.z], ['Carico al suolo q<sub>sk</sub>', o.neve.q === null ? 'serve la quota' : isNaN(o.neve.q) ? 'oltre 1500 m: dati locali' : '≈ ' + nf(o.neve.q, 2) + ' kN/m²']);
    if (o.vento) nv.push(['Vento: zona', String(o.vento.z) + (o.vento.z === 9 ? ' (isole minori)' : '')], ['Velocità base v<sub>b</sub>', o.vento.v === null ? 'serve la quota' : isNaN(o.vento.v) ? 'oltre 1500 m: dati locali' : '≈ ' + nf(o.vento.v, 1) + ' m/s']);
    if (nv.length) h += '<div class="vinRows">' + nv.map((x) => '<span>' + x[0] + '</span><b>' + escHtml(x[1]) + '</b>').join('') + '</div>';
    else h += rows([['Neve e vento', 'non disponibili', 'na']]);
    h += '<p class="sitTxt">Valori di riferimento al suolo e a 10 m, calcolati con la quota del rilievo (celle di circa 30 m): il carico sul tetto e la pressione del vento dipendono da forma, esposizione e rugosità.</p>';
    h += '<p class="sitSrc">NTC 2018, §3.4.2 e Tab. 3.3.I. ' + aLink('ntc', 'Gazzetta Ufficiale') + '</p>';
    // Radon
    h += '<h4>Radon</h4>';
    const st = D.rad && o.reg ? D.rad[o.reg] : null;
    let rv, rc = '', rt;
    const rn = o.reg === '04' ? (o.com.p === 'BZ' ? 'la Provincia di Bolzano' : 'la Provincia di Trento') : REG_N[o.reg] || 'la Regione';
    if (r && r[3] === 1) { rv = 'sì'; rc = 'warn'; rt = 'Il Comune è nell’elenco delle aree prioritarie pubblicato da ' + rn + '.'; }
    else if (st === 'pub') { rv = 'no'; rt = rn + ' ha pubblicato l’elenco: il Comune non è tra le aree prioritarie.'; }
    else if (st === 'zero') { rv = 'no'; rt = rn + ' ha deciso che nel suo territorio non ci sono aree prioritarie.'; }
    else { rv = 'non ancora pubblicata'; rc = 'sub'; rt = rn + ' non ha ancora pubblicato l’elenco delle aree prioritarie.'; }
    h += rows([['Area prioritaria', rv, rc]]) + '<p class="sitTxt">' + rt.charAt(0).toUpperCase() + rt.slice(1) + '</p>';
    h += '<p class="sitSrc">Elenco nazionale dei Comuni in area prioritaria (ARPA Lombardia' + (D.radV ? ', ' + D.radV : '') + ', dagli atti delle Regioni in Gazzetta Ufficiale). ' + aLink('rad', 'Fonte') + '</p>';
    const prio = r && r[3] === 1;
    h += '<div class="sitCard"><b>Livelli di riferimento</b><span>Concentrazione media annua di radon in aria · D.Lgs 101/2020, art. 12</span>' +
      '<table class="sitU"><tr><th>Ambiente</th><th>Bq/m³</th></tr>' +
      '<tr><td>Abitazioni esistenti</td><td>300</td></tr><tr><td>Abitazioni costruite dopo il 31/12/2024</td><td>200</td></tr><tr><td>Luoghi di lavoro</td><td>300</td></tr></table></div>';
    h += '<div class="sitCard"><b>Cosa chiede la legge</b><span>D.Lgs 101/2020, artt. 16–18, e Piano nazionale d’azione per il radon 2023–2032</span>' +
      '<p class="sitTxt"><b>Luoghi di lavoro.</b> Misura della media annua nei locali interrati ' + (prio ? 'e, essendo area prioritaria, anche nei seminterrati e al piano terra' : 'ovunque; nei seminterrati e al piano terra solo nelle aree prioritarie') +
      '; inoltre negli stabilimenti termali. Entro 24 mesi dall’inizio dell’attività, con un servizio di dosimetria riconosciuto. Se sotto il livello: si ripete ogni 8 anni e dopo lavori strutturali al piano terra o di isolamento termico. Se sopra: rimedi entro 2 anni con un esperto in interventi di risanamento radon, nuova misura di verifica, poi ogni 4 anni.</p>' +
      '<p class="sitTxt"><b>Abitazioni.</b> Nessun obbligo nazionale di misura: è consigliata' + (prio ? ', soprattutto qui,' : '') + ' nei locali al piano terra e seminterrati. Se si supera il livello conviene intervenire, per esempio con ventilazione o depressurizzazione del vespaio, sigillatura delle vie d’ingresso dal terreno, ventilazione dei locali.</p>' +
      '<p class="sitTxt"><b>Progetto.</b> Il Piano nazionale (asse 2) punta a sistemi di prevenzione nei nuovi edifici, perché restino sotto 200 Bq/m³: per esempio vespaio aerato, barriere e sigillature verso il terreno. Le regole precise stanno nelle norme regionali e nel regolamento edilizio del Comune.</p></div>';
    if (o.reg === '15') {
      h += '<div class="sitCard"><b>Campania · Legge regionale 13/2019</b><span>Riduzione dell’esposizione al gas radon in ambienti chiusi</span>' +
        '<table class="sitU"><tr><th>Edifici</th><th>Bq/m³</th></tr>' +
        '<tr><td>Nuove costruzioni, ristrutturazioni e manutenzioni straordinarie (ogni locale)</td><td>200</td></tr>' +
        '<tr><td>Scuole, asili nido e scuole dell’infanzia esistenti</td><td>300</td></tr>' +
        '<tr><td>Interrati, seminterrati e piano terra di edifici non residenziali aperti al pubblico</td><td>300</td></tr></table>' +
        '<p class="sitTxt">Per i nuovi interventi il progetto comprende una relazione tecnica su suolo, sottosuolo, materiali e accorgimenti contro l’accumulo di radon; le misure in tutti i locali iniziano entro 6 mesi dalla segnalazione certificata per l’agibilità. Per gli edifici esistenti oltre il limite serve un piano di risanamento; se mancano misure o lavori l’agibilità può essere sospesa.</p>' +
        '<p class="sitNote">Da verificare con il Comune come la legge regionale si coordina oggi con il D.Lgs 101/2020.</p></div>';
    } else h += '<p class="sitNote">Leggi regionali sul radon: non ancora raccolte nell’app per questa Regione; verificare il regolamento edilizio del Comune.</p>';
    h += '<p class="sitSrc">' + aLink('radL', 'D.Lgs 101/2020') + ' ' + aLink('pnar', 'Piano nazionale radon') + (o.reg === '15' ? ' ' + aLink('lrCa', 'LR Campania 13/2019') : '') + '</p>';
    // Clima futuro: indicatori PNACC (ISPRA) nel punto, clima 1981-2010 e variazioni al 2036-2065 nei tre scenari
    h += '<h4>Clima futuro</h4>';
    h += climaHtml(o.lat, o.lon);
    const CP = { AV: 'avellino', BN: 'benevento', CE: 'caserta', NA: 'napoli', SA: 'salerno' }[o.com.p];
    if (o.reg === '15' && CP) {
      const slug = o.com.n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      h += '<p class="sitTxt">In Campania c’è anche la scheda climatica ufficiale di ogni Comune (PR FESR 2021-27, dati del Piano nazionale di adattamento PNACC 2024): temperature, ondate di calore, notti tropicali, gradi giorno di riscaldamento e raffrescamento, piogge intense, siccità, oggi e in futuro, con le classi di pericolo.</p>' +
        '<p class="sitSrc"><a href="https://prfesr2127.regione.campania.it/wp-content/uploads/2026/08/' + CP + '-' + slug + '.pdf" target="_blank" rel="noopener">Scheda di ' + escHtml(o.com.n) + ' (PDF) ›</a> ' +
        '<a href="https://prfesr2127.regione.campania.it/schede-climatiche-' + CP + '/" target="_blank" rel="noopener">Schede della provincia ›</a> ' +
        '<a href="https://geomaps.regione.campania.it/portal/apps/experiencebuilder/experience/?id=dbf62f935d6f4a8ea1f559b996a99fa6" target="_blank" rel="noopener">WebGIS pericoli climatici ›</a></p>' +
        '<p class="sitNote">Le schede non indicano periodi e scenario climatico; alcuni valori «futuri» sembrano variazioni rispetto a oggi.</p>';
    }
    h += '<p class="hint">Informazioni indicative, per orientarsi: fanno fede le norme, gli uffici regionali e comunali e il progettista.</p>';
    return h;
  }
  window.__panoSito = () => SITO;
  window.__panoPtSet = (lat, lon) => ptSet(lat, lon, 'mappa');

  (function movePunto() { $('puDet').appendChild($('spot')); })();
  function renderPunto() {
    const p = PU.view === 'pt' ? PT.cur : null;
    $('puSeg').hidden = !PT.cur;
    document.querySelectorAll('#puSeg button').forEach((b) => b.classList.toggle('on', b.dataset.pu === (p ? 'pt' : 'qui')));
    const com = p ? comOf(p) : comuneText();
    setText('puTitle', p ? (p.nm || 'Punto scelto') : 'Qui');
    setText('puSub', p ? com + ' · ' + ptWhere(p) + ' · ' + srcText(p.src)
      : (S.lat === null ? 'in attesa del GPS' : com + ' · ' + fmtCoord(S.lat, S.lon)));
    const g = groundOf(p);
    stoFetch();
    renderSto();
    const tgt = p ? { lat: p.lat, lon: p.lon } : { lat: S.lat, lon: S.lon };
    const vin = tgt.lat !== null ? vinFor(tgt.lat, tgt.lon) : null;
    $('puVin').hidden = tgt.lat === null;
    const vh = vinHtml(vin, tgt.lat, tgt.lon);
    if ($('vinBox').dataset.h !== vh) { $('vinBox').innerHTML = vh; $('vinBox').dataset.h = vh; }
    sitoLoad();
    const gq = g !== null ? g : (!p && S.alt !== null && (S.altAcc === null || S.altAcc <= 25) ? Math.round(S.alt) : null);
    const sit = sitoFor(p ? p.com : COM.cur, tgt.lat, tgt.lon, gq);
    $('puSit').hidden = tgt.lat === null;
    pvSetTarget(tgt.lat, tgt.lon, p ? (p.nm || (p.com ? p.com.n : '')) : 'la tua posizione');
    const sh = sitoHtml(sit);
    if ($('sitBox').dataset.h !== sh) { $('sitBox').innerHTML = sh; $('sitBox').dataset.h = sh; }
    const val = { vin: vinShort(vin), cat: p ? catOf(p) : catShort(), sit: sitoTile(sit), sto: stoTile() };
    const html = AMB.map((a) => {
      const v = val[a[0]] || 'in arrivo', soon = !val[a[0]];
      return '<button type="button" class="puTile' + (soon ? ' na' : '') + (a[0] === 'vin' && vinWarn(vin) ? ' warn' : '') + '" data-amb="' + a[0] + '" style="--c:' + a[2] + '"><b>' + a[1] + '</b><span>' + escHtml(v) + '</span></button>';
    }).join('');
    if ($('puGrid').innerHTML !== html) $('puGrid').innerHTML = html;
    $('puHistWrap').hidden = !HIST.length && HU.st !== 2;
    const hh = HIST.length ? histHtml() : '<p class="phNone">Cronologia cancellata.</p>';
    if ($('puHist').dataset.h !== hh) { $('puHist').innerHTML = hh; $('puHist').dataset.h = hh; }
    $('spot').hidden = !!p;
    $('ptDet').hidden = !p;
    if (p) {
      const rows = [['Coordinate', fmtCoord(p.lat, p.lon)], ['Distanza', p.d === null ? '–' : fmtDist(p.d) + ', ' + dirText(p.b)],
        ['Quota terreno', g !== null ? '≈ ' + g + ' m s.l.m.' : 'non disponibile'], ['Comune', com], ['Catasto', catOf(p)],
        ['Scelto', srcText(p.src) + ', ' + fmtWhen(p.t)]];
      const dh = rows.map((r) => '<div class="kv"><span>' + r[0] + '</span><b>' + escHtml(r[1]) + '</b></div>').join('') +
        '<p class="hint">Il punto toccato nel paesaggio viene dal rilievo del terreno (celle di circa 30 m) e dalla bussola: è indicativo. Comune e particella non hanno valore di certificato (fanno fede CDU e visura).</p>';
      if ($('ptDet').innerHTML !== dh) $('ptDet').innerHTML = dh;
    } else updateSpot(S.heading === null ? null : trueHeading(), S.pitch === null ? null : S.pitch + S.pitchOff);
  }
  setInterval(() => { if (tabNow() === 'punto') renderPunto(); }, 1000);
  // «Apri sulla mappa» dai vincoli: Mappa vicina con frane e alluvioni accese
  $('vinBox').addEventListener('click', (e) => {
    if (!e.target.closest('#vinMap')) return;
    const p = PU.view === 'pt' ? PT.cur : null;
    const lat = p ? p.lat : S.lat, lon = p ? p.lon : S.lon;
    if (lat === null || !mapReady) return;
    S.lyFr = true; S.lyAl = true; saveSettings();
    setTab('mappa'); if (!full) setFull(true); setFollow(false);
    requestAnimationFrame(() => { if (map) { map.jumpTo({ center: [lon, lat], zoom: 15, bearing: 0 }); lyUpdate(); } });
  });
  $('puHist').addEventListener('click', (e) => {
    const b = e.target.closest('.phRow');
    if (!b) return;
    const h = HIST[Number(b.dataset.i)];
    if (!h) return;
    ptSet(h.lat, h.lon, h.src, { hist: h });
    PT.showG = false;
    PU.view = 'pt'; renderPunto();
    $('punto').scrollTop = 0;
  });
  // Cancella: chiede conferma, poi per 8 secondi si può annullare
  const HU = { st: 0, timer: null, backup: null };
  function huSet(st) {
    HU.st = st; clearTimeout(HU.timer);
    $('puHistClr').textContent = st === 1 ? 'Sì, cancella' : st === 2 ? 'Annulla' : 'Cancella';
    $('puHistClr').classList.toggle('warn', st === 1);
    if (st === 1) HU.timer = setTimeout(() => huSet(0), 4000);
    if (st === 2) HU.timer = setTimeout(() => { HU.backup = null; huSet(0); renderPunto(); }, 8000);
    renderPunto();
  }
  $('puHistClr').addEventListener('click', () => {
    if (HU.st === 0) { huSet(1); return; }
    if (HU.st === 1) { HU.backup = HIST.slice(); HIST = []; histSave(); huSet(2); return; }
    if (HU.backup) { HIST = HU.backup; HU.backup = null; histSave(); }
    huSet(0);
  });
  $('puSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; PU.view = b.dataset.pu; renderPunto(); });
  $('puGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.puTile');
    if (!b) return;
    const p = PU.view === 'pt' ? PT.cur : null;
    if (b.dataset.amb === 'cat') { if (p) openCatMap(p.lat, p.lon); else if (S.lat !== null) openCatMap(S.lat, S.lon); return; }
    if (b.dataset.amb === 'sto') { $('puSto').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (b.dataset.amb === 'vin') { $('puVin').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (b.dataset.amb === 'sit') { $('puSit').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    toast(b.querySelector('b').textContent + ': in arrivo nelle prossime versioni.', 2500);
  });
