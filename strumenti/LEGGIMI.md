# Strumenti (non usati dall'app)

- `make_peaks.py` crea `beta/peaks-it.json` dal file GeoNames `IT.zip`
  (https://download.geonames.org/export/dump/IT.zip, licenza CC BY 4.0):
  `python3 -I make_peaks.py IT.zip ../beta/peaks-it.json`
- `test_peaks.py` prova la beta in Chromium con GPS, bussola e fotocamera simulati e vette finte:
  `python3 test_peaks.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]` (serve Playwright).
- `test_foto.py` prova zoom, scatto, galleria, modifica e condivisione della beta con GPS, bussola e fotocamera simulati:
  `python3 test_foto.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- `test_rilievo.py` prova il rilievo del terreno con tasselli Terrarium finti (una cresta, una vetta nascosta, un paese in collina, uno dietro la cresta):
  `python3 test_rilievo.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]` (servono Playwright e numpy).
- `test_v17.py`, `test_v20.py`: correzioni della v17 (pannello, diagnosi, minimappa, animazione 8, avviso senza bussola) e risparmio di batteria della v20.
- `test_v23.py` prova la veste grafica: tema chiaro/scuro automatico e manuale (resta salvato), pagina iniziale con «Beta v23», pagine «Come funziona» e Avvia dalla terza pagina; salva le schermate nei due temi:
  `python3 test_v23.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- `test_v27.py` prova i fiumi (v27) e i torrenti (v28: spenti all’inizio, solo con nome e lunghi almeno 3 km, entro 10 km) con lo stesso rilievo finto di `test_rilievo.py` e una risposta finta di OpenStreetMap: un fiume in pianura deve avere il nome dove lo sguardo lo incrocia, uno dietro la cresta no; tracciati sulla mappa, filtro «Fiumi», niente nomi senza rilievo:
  `python3 test_v27.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- `test_v29.py` prova le creste a tre livelli (v29) con il rilievo finto di `test_rilievo.py`: la cresta a 4 km e la vetta a 10 km che sporge hanno ciascuna la sua distanza scritta; in pianura nessuna linea inventata; spegnendo la linea spariscono anche le distanze:
  `python3 test_v29.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- `test_v30.py` prova la nuova struttura (v30): si apre sulla Mappa, punto scelto toccando la mappa, Punto con i sei ambiti, Guarda con Bussola · logo · Scatta e suggerimento di 5 s, tocco sul paesaggio (punto sul terreno), mappa che si allarga nella scheda, Archivio, fotocamera spenta fuori da Guarda dopo 15 s:
  `python3 test_v30.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- Dalla v30 gli altri test aprono la beta con `?tab=guarda` (si parte direttamente dalla fotocamera).
- `worker-catasto.js` è il codice del server di passaggio su Cloudflare («orientis-catasto»), versione 2: `/catasto` (foglio e particella), `/tile/{z}/{x}/{y}.png` (tasselli della mappa catastale, tenuti in memoria 30 giorni), `/ping`. La beta usa i tasselli solo se `/ping` risponde «orientis 2», altrimenti l'immagine unica di prima.
- `make_sito.py` crea `beta/sito-it.json` (v37, ambito «Sito ed Energia»): zona sismica (CSV del Dipartimento della Protezione Civile, maggio 2025), zona climatica e gradi giorno (PDF della Tabella A del DPR 412/93 aggiornata al 31/10/2009), Comuni in area prioritaria per il radon (xlsx nazionale di ARPA Lombardia, 22/7/2026), tutti legati ai Comuni ISTAT di `beta/comuni`. I Comuni nati da fusione dopo il 2009 tengono i valori degli ex Comuni (`fx`), quelli rinominati il nome della Tabella (`nt`); lo script stampa i Comuni senza dato (84 senza zona climatica). Istruzioni in testa al file; quando si aggiorna la tabella va cambiato anche `sito-it.json?v=` in index.html.
- `test_v37.py` prova il tasto Ricentra tondo, la legenda dei livelli Frane/Alluvioni nella scheda sotto la mappa (colori dal servizio ISPRA, o solo le classi) il tasto «i» con le note, i consigli in basso che spariscono, il «Cono» spegnibile, il Comune del punto toccato e l’ambito «Sito ed Energia» per un punto ad Ariano Irpino (con la tabella vera):
  `python3 test_v37.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- `make_indice.py` crea `beta/comuni/indice.json` (v38) per la ricerca dei Comuni: nome, provincia, codice ISTAT, regione e un punto sicuramente dentro il Comune. Va rifatto quando cambiano i file `R*.json`.
- `test_v38.py` (parte da test_v37) prova anche la foto satellitare (Sentinel-2 cloudless di EOX, finta), la ricerca dei Comuni con il confine disegnato, il radon completo (D.Lgs 101/2020 e legge della Campania) e il Clima futuro (scheda della Campania):
  `python3 test_v38.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- `make_clima.py` crea `beta/clima-it.json` (v39, «Clima futuro»): indicatori PNACC 2024 di ISPRA, clima 1981-2010 (E-OBS, 0,1°) e variazioni al 2036-2065 (EURO-CORDEX, RCP2.6/4.5/8.5) dagli zip interni dei 4 pacchetti scaricati da climadat.isprambiente.it (alcuni pacchetti hanno un indice zip rovinato: si estraggono leggendo le intestazioni locali dei file).
- `test_v39.py` (parte da test_v38) prova anche la tabella del Clima futuro per Ariano Irpino.
