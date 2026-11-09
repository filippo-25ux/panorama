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
- `test_v27.py` prova i fiumi (v27) con lo stesso rilievo finto di `test_rilievo.py` e una risposta finta di OpenStreetMap: un fiume in pianura deve avere il nome dove lo sguardo lo incrocia, uno dietro la cresta no; tracciati sulla mappa, filtro «Fiumi», niente nomi senza rilievo:
  `python3 test_v27.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]`
