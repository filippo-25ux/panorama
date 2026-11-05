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
