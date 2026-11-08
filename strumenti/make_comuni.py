"""Crea i confini dei Comuni per la beta (un file per regione) da openpolis/geojson-italy (dati ISTAT, CC BY).

Passi:
  1. scarica limits_IT_municipalities.geojson da
     https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_municipalities.geojson
  2. semplificalo con mapshaper:
     mapshaper limits_IT_municipalities.geojson -simplify 10% keep-shapes planar -o simp.json format=geojson precision=0.0001
  3. python3 -I make_comuni.py simp.json ../beta/comuni

Formato di ogni file R<codice regione>.json:
  {"v": "ISTAT 1/1/2026", "c": [[nome, sigla provincia, codice ISTAT, codice catastale, [ovest, sud, est, nord], poligoni], ...]}
  poligoni = elenco di poligoni, ciascuno elenco di anelli, ciascuno elenco piatto [lon*1e4, lat*1e4, ...] in interi.
regioni.json = {"<codice>": [ovest, sud, est, nord, "nome"], ...}
"""
import json, os, sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
d = json.load(open(src, encoding='utf-8'))
reg = {}
regbox = {}
for f in d['features']:
    p, g = f['properties'], f['geometry']
    if not g:
        continue
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    enc = []
    xs, ys = [], []
    for poly in polys:
        rings = []
        for ring in poly:
            flat = []
            for x, y in ring:
                flat += [round(x * 1e4), round(y * 1e4)]
                xs.append(x); ys.append(y)
            rings.append(flat)
        enc.append(rings)
    bb = [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]
    code = p['reg_istat_code']
    reg.setdefault(code, []).append([p['name'], p.get('prov_acr') or '', p['com_istat_code'], p.get('com_catasto_code') or '', bb, enc])
    rb = regbox.setdefault(code, [180, 90, -180, -90, p['reg_name']])
    rb[0] = min(rb[0], bb[0]); rb[1] = min(rb[1], bb[1]); rb[2] = max(rb[2], bb[2]); rb[3] = max(rb[3], bb[3])
tot = 0
for code, lst in reg.items():
    path = os.path.join(out, 'R' + code + '.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'v': 'ISTAT 1/1/2026', 'c': lst}, fh, ensure_ascii=False, separators=(',', ':'))
    tot += os.path.getsize(path)
with open(os.path.join(out, 'regioni.json'), 'w', encoding='utf-8') as fh:
    json.dump(regbox, fh, ensure_ascii=False, separators=(',', ':'))
print(len(reg), 'regioni,', sum(len(v) for v in reg.values()), 'Comuni,', round(tot / 1e6, 2), 'MB')
