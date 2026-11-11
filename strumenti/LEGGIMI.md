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
- `worker-catasto.js` è il codice del server di passaggio su Cloudflare («orientis-catasto»), versione 3: `/catasto` (foglio e particella), `/tile/{z}/{x}/{y}.png` (tasselli della mappa catastale, tenuti in memoria 30 giorni), `/pvgis?…` (stima fotovoltaica PVGIS 5.3 del JRC, che non risponde direttamente alle pagine web; risposte tenute 30 giorni), `/esri/{z}/{y}/{x}` (foto satellitari Esri World Imagery con la chiave tenuta nel segreto `ESRI_KEY` del Worker, mai nel codice pubblico), `/ping`. `/ping` risponde «orientis 3», più « esri» se il segreto c'è: la beta usa allora le foto Esri dal server, altrimenti le EOX.
- `make_sito.py` crea `beta/sito-it.json` (v37, ambito «Sito ed Energia»): zona sismica (CSV del Dipartimento della Protezione Civile, maggio 2025), zona climatica e gradi giorno (PDF della Tabella A del DPR 412/93 aggiornata al 31/10/2009), Comuni in area prioritaria per il radon (xlsx nazionale di ARPA Lombardia, 22/7/2026), tutti legati ai Comuni ISTAT di `beta/comuni`. I Comuni nati da fusione dopo il 2009 tengono i valori degli ex Comuni (`fx`), quelli rinominati il nome della Tabella (`nt`); lo script stampa i Comuni senza dato (84 senza zona climatica). Istruzioni in testa al file; quando si aggiorna la tabella va cambiato anche `sito-it.json?v=` in index.html.
- `test_v37.py` prova il tasto Ricentra tondo, la legenda dei livelli Frane/Alluvioni nella scheda sotto la mappa (colori dal servizio ISPRA, o solo le classi) il tasto «i» con le note, i consigli in basso che spariscono, il «Cono» spegnibile, il Comune del punto toccato e l’ambito «Sito ed Energia» per un punto ad Ariano Irpino (con la tabella vera):
  `python3 test_v37.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- `make_indice.py` crea `beta/comuni/indice.json` (v38) per la ricerca dei Comuni: nome, provincia, codice ISTAT, regione e un punto sicuramente dentro il Comune. Va rifatto quando cambiano i file `R*.json`.
- `test_v38.py` (parte da test_v37) prova anche la foto satellitare (Sentinel-2 cloudless di EOX, finta), la ricerca dei Comuni con il confine disegnato, il radon completo (D.Lgs 101/2020 e legge della Campania) e il Clima futuro (scheda della Campania):
  `python3 test_v38.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
- `make_clima.py` crea `beta/clima-it.json` (v39, «Clima futuro»): indicatori PNACC 2024 di ISPRA, clima 1981-2010 (E-OBS, 0,1°) e variazioni al 2036-2065 (EURO-CORDEX, RCP2.6/4.5/8.5) dagli zip interni dei 4 pacchetti scaricati da climadat.isprambiente.it (alcuni pacchetti hanno un indice zip rovinato: si estraggono leggendo le intestazioni locali dei file).
- `test_v39.py` (parte da test_v38) prova anche la tabella del Clima futuro per Ariano Irpino.
- `test_v40.py` (parte da test_v39) prova il Fotovoltaico con un PVGIS finto (parametri della richiesta, risultati, misura di inclinazione e orientamento col telefono, angoli ottimali, orizzonte dell'app in 48 direzioni, costo, inseguimento) e le foto Esri dal server.

## Struttura di `beta/` (dalla v41, pulizia del codice – tappe A e B)
- `index.html`: solo la pagina (circa 430 righe). Il codice sta in `js/`, in 12 file caricati in quest'ordine con `<script src="js/….js?v=40">`:
  `base` (costanti, utilità, impostazioni, geografia), `rilievo` (terreno), `dati-luogo` (archivio, OpenStreetMap, fiumi), `sensori` (sensori, calibrazione, sole), `mappa` (mini-mappa, satellite, ricerca dei Comuni), `orientamento` (bussola, allineamento, creste, percorso del sole), `disegno`, `foto` (impostazioni, scatto, galleria, modifica), `struttura` (fotocamera, zoom, Comune e catasto, Mappa · Guarda · Punto · Archivio), `vincoli-sito` (frane e alluvioni, Sito ed Energia, Clima futuro), `fotovoltaico`, `avvio`.
  Non sono moduli: sono script classici che condividono lo stesso spazio di nomi, quindi **l'ordine dei tag conta** e le righe eseguite subito al caricamento devono usare solo cose definite nello stesso file o in uno precedente (`struttura.js` comincia proprio con l'avvio delle impostazioni perché richiama funzioni che stanno più sotto nello stesso file). Il codice dentro è identico a quello di prima della v41, con la stessa indentazione.
- `css/stile.css`: tutti gli stili, identici a prima (collegato con `?v=`: cambiare il numero quando si modifica il file).
- `dati/declinazione.js`: declinazione magnetica WMM2025. `dati/norme.js`: tabelle di norme di «Sito ed Energia» (sismica, zone climatiche, neve e vento NTC 2018, trasmittanze DM 28/10/2025, link alle fonti, indicatori del Clima futuro). Entrambi si leggono da `window.ORI_DATI`, caricati prima del codice principale.
- Per i confronti di schermate prima/dopo: la finta fotocamera di Chromium ha una "fetta" chiara animata a tempo, quindi cambia da un'esecuzione all'altra; contano solo le differenze nel resto dell'immagine.
- I test non cambiano: servono ancora gli stessi comandi, con MapLibre 4.7.1 (`npm install maplibre-gl@4.7.1`). Se un test fallisce con «Address already in use», c'è un altro test ancora acceso: chiuderlo e ripetere.
