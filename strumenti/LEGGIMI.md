# Strumenti (non usati dall'app)

- `make_peaks.py` crea `beta/peaks-it.json` dal file GeoNames `IT.zip`
  (https://download.geonames.org/export/dump/IT.zip, licenza CC BY 4.0):
  `python3 -I make_peaks.py IT.zip ../beta/peaks-it.json`
- `test_peaks.py` prova la beta in Chromium con GPS, bussola e fotocamera simulati e vette finte:
  `python3 test_peaks.py <cartella del repository> <cartella per gli screenshot>` (serve Playwright).
