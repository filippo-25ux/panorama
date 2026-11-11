/* Orientis – norme e tabelle di «Sito ed Energia» (v41: spostate fuori da index.html, nessuna modifica ai valori).
   Caricato prima del codice principale; i valori si leggono da window.ORI_DATI.
   Fonti: zone sismiche (Protezione Civile), DPR 412/93 (zone climatiche), NTC 2018 §3.3-3.4 (vento e neve),
   DM 28/10/2025 (trasmittanze e H'T), D.Lgs 101/2020 e L.R. Campania 13/2019 (radon), PNACC 2024 (Clima futuro). */
(function () {
  const SIS_TXT = { 1: 'la più pericolosa: possono verificarsi fortissimi terremoti', 2: 'possono verificarsi forti terremoti',
    3: 'possono verificarsi forti terremoti, ma rari', 4: 'la meno pericolosa: i terremoti sono rari' };
  const CLI_PER = { A: ['1 dicembre', '15 marzo', 6], B: ['1 dicembre', '31 marzo', 8], C: ['15 novembre', '31 marzo', 10],
    D: ['1 novembre', '15 aprile', 12], E: ['15 ottobre', '15 aprile', 14], F: null };
  // NTC 2018 §3.4.2: zone di carico della neve per provincia (sigle delle province nei confini ISTAT usati dall'app)
  const NEVE_Z = { IA: ['I – Alpina', 1.50, 1.39, 728], IM: ['I – Mediterranea', 1.50, 1.35, 602], II: ['II', 1.00, 0.85, 481], III: ['III', 0.60, 0.51, 481] };
  const NEVE_P = {};
  for (const [z, l] of Object.entries({
    IA: 'AO BL BG BI BZ BS CO CN LC PN SO TO TN UD VB VC VI', IM: 'AL AN AT BO CR FC LO MI MO MB NO PR PV PU PC RA RE RN TV VA',
    II: 'AR AP AV BA BT BN CB CH FM FE FI FG FR GE GO IM IS AQ SP LU MC MN MS PD PG PE PT PO RI RO SV TE TS VE VR',
    III: 'AG BR CA CL CI CE CT CZ CS KR EN GR LT LE LI MT VS ME NA NU OG OT OR PA PI PZ RG RC RM SA SS SI SR TA TR TP VV VT' })) for (const sg of l.split(' ')) NEVE_P[sg] = z;
  // NTC 2018 Tab. 3.3.I: zone del vento [vb,0 m/s, a0 m, ks]
  const VENTO_Z = { 1: [25, 1000, 0.40], 2: [25, 750, 0.45], 3: [27, 500, 0.37], 4: [28, 500, 0.36], 5: [28, 750, 0.40], 6: [28, 500, 0.36], 7: [28, 1000, 0.54], 8: [30, 1500, 0.50], 9: [31, 500, 0.32] };
  const ISOLE = new Set(["Capri|NA", "Anacapri|NA", "Ischia|NA", "Barano d'Ischia|NA", "Casamicciola Terme|NA", "Forio|NA", "Lacco Ameno|NA", "Serrara Fontana|NA", "Procida|NA",
    'Ponza|LT', 'Ventotene|LT', 'Portoferraio|LI', "Campo nell'Elba|LI", 'Capoliveri|LI', 'Marciana|LI', 'Marciana Marina|LI', 'Porto Azzurro|LI', 'Rio|LI', 'Capraia Isola|LI',
    'Isola del Giglio|GR', 'Lipari|ME', 'Leni|ME', 'Malfa|ME', 'Santa Marina Salina|ME', 'Favignana|TP', 'Pantelleria|TP', 'Lampedusa e Linosa|AG', 'Ustica|PA',
    'Isole Tremiti|FG', 'La Maddalena|OT', 'Carloforte|CI', 'Calasetta|CI', "Sant'Antioco|CI"]);
  // DM 28/10/2025: trasmittanze U (W/m²K) [pareti, coperture, pavimenti, finestre] – App. A edificio di riferimento, App. B riqualificazione
  const DM_U = {
    ref: { A: [0.43, 0.35, 0.44, 3.00], B: [0.43, 0.35, 0.44, 3.00], C: [0.34, 0.33, 0.38, 2.20], D: [0.29, 0.26, 0.29, 1.80], E: [0.26, 0.22, 0.26, 1.40], F: [0.24, 0.20, 0.24, 1.10] },
    riq: { A: [0.40, 0.32, 0.42, 3.00], B: [0.40, 0.32, 0.42, 3.00], C: [0.36, 0.32, 0.38, 2.00], D: [0.32, 0.26, 0.32, 1.80], E: [0.28, 0.24, 0.29, 1.40], F: [0.26, 0.22, 0.28, 1.10] }
  };
  // DM 28/10/2025, App. A Tab. 10: H'T massimo per nuove costruzioni [S/V < 0,4; 0,4 ≤ S/V < 0,7; S/V ≥ 0,7]
  const DM_HT = { A: [0.80, 0.63, 0.58], B: [0.80, 0.63, 0.58], C: [0.80, 0.60, 0.55], D: [0.80, 0.58, 0.53], E: [0.75, 0.55, 0.50], F: [0.70, 0.53, 0.48] };
  const REG_N = { '01': 'il Piemonte', '02': 'la Valle d’Aosta', '03': 'la Lombardia', '05': 'il Veneto', '06': 'il Friuli Venezia Giulia',
    '07': 'la Liguria', '08': 'l’Emilia-Romagna', '09': 'la Toscana', '10': 'l’Umbria', '11': 'le Marche', '12': 'il Lazio', '13': 'l’Abruzzo', '14': 'il Molise', '15': 'la Campania',
    '16': 'la Puglia', '17': 'la Basilicata', '18': 'la Calabria', '19': 'la Sicilia', '20': 'la Sardegna' };
  const SITO_LINK = {
    sis: 'https://rischi.protezionecivile.gov.it/en/approfondimento/seismic-classification/',
    cli: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:1993-08-26;412',
    acc: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:2013-04-16;74',
    dm: 'https://www.gazzettaufficiale.it/eli/gu/2025/12/05/283/sg',
    ntc: 'https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg',
    rad: 'https://www.arpalombardia.it/temi-ambientali/radioattivita/il-radon/aree-prioritarie-in-italia/',
    radL: 'https://www.normattiva.it/uri-res/N2Ls?urn%3Anir%3Astato%3Adecreto.legislativo%3A2020-07-31%3B101',
    pnar: 'https://www.gazzettaufficiale.it/eli/gu/2024/02/21/43/sg',
    lrCa: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:regione.campania:legge:2019-07-08;13'
  };
  // [chiave, nome, unità del valore 1981-2010, decimali, gruppo]
  const CLIMA_IND = [
    ['tg', 'Temperatura media annua', '°C', 1, 'Temperature'], ['tg_jja', 'Temperatura media estiva (giu-ago)', '°C', 1, 'Temperature'], ['tg_djf', 'Temperatura media invernale (dic-feb)', '°C', 1, 'Temperature'],
    ['su95p', 'Giorni estivi (max > 29,2 °C)', 'giorni', 0, 'Caldo'], ['tr', 'Notti tropicali (min > 20 °C)', 'giorni', 0, 'Caldo'], ['wsdi', 'Giorni in ondata di calore (WSDI)', 'giorni', 0, 'Caldo'], ['humidex5', 'Giorni di forte disagio (humidex > 45 °C)', 'giorni', 0, 'Caldo'],
    ['hdds', 'Gradi giorno di riscaldamento¹', 'GG', 0, 'Energia'], ['cdds', 'Gradi giorno di raffrescamento¹', 'GG', 0, 'Energia'],
    ['fd', 'Giorni di gelo (min < 0 °C)', 'giorni', 0, 'Freddo'],
    ['prcptot', 'Pioggia annua', 'mm', 0, 'Piogge e siccità'], ['r20', 'Giorni di pioggia intensa (> 20 mm)', 'giorni', 0, 'Piogge e siccità'], ['rx1day', 'Pioggia massima in un giorno', 'mm', 0, 'Piogge e siccità'], ['cdd', 'Giorni secchi consecutivi, al massimo', 'giorni', 0, 'Piogge e siccità'],
    ['fwi', 'Indice di pericolo incendi (FWI)', '', 0, 'Incendi e vento'], ['ews', 'Vento estremo (98° percentile)', '', 0, 'Incendi e vento']
  ];
  window.ORI_DATI = Object.assign(window.ORI_DATI || {}, { SIS_TXT, CLI_PER, NEVE_Z, NEVE_P, VENTO_Z, ISOLE, DM_U, DM_HT, REG_N, SITO_LINK, CLIMA_IND });
})();
