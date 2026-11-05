"""Crea peaks-it.json dal file GeoNames IT.zip (o IT.txt).
Uso: python3 -I make_peaks.py <IT.zip|IT.txt> <file di uscita>
Tiene vette, monti, vulcani e colline con quota nota. Formato: [nome, lat, lon, quota].
"""
import sys, zipfile, io, json, collections

src, out = sys.argv[1], sys.argv[2]
CODES = {'PK', 'MT', 'VLC', 'HLL', 'PKS', 'MTS'}  # PKS/MTS (gruppi) solo se hanno quota propria
if src.endswith('.zip'):
    z = zipfile.ZipFile(src)
    f = io.TextIOWrapper(z.open('IT.txt'), encoding='utf-8')
else:
    f = open(src, encoding='utf-8')

rows, stats = [], collections.Counter()
for line in f:
    c = line.rstrip('\n').split('\t')
    if len(c) < 17 or c[6] != 'T' or c[7] not in CODES or c[8] != 'IT':
        continue
    stats['tutti ' + c[7]] += 1
    ele = c[15].strip()
    src_ele = 'misurata'
    if not ele or ele == '0':
        ele = c[16].strip()
        src_ele = 'dem'
    try:
        e = int(float(ele))
    except ValueError:
        continue
    if e <= 0 or e < -100 or e > 4900:
        continue
    if c[7] in ('PKS', 'MTS') and src_ele == 'dem':
        continue  # un gruppo montuoso senza quota vera non è un punto da etichettare
    stats['tenuti ' + c[7]] += 1
    stats['quota ' + src_ele] += 1
    rows.append([c[1], round(float(c[4]), 5), round(float(c[5]), 5), e])

# nomi in italiano e grandi cime di confine che GeoNames assegna ad altri Paesi
RENAME = {'Vesuvius': 'Vesuvio'}
for r in rows:
    r[0] = RENAME.get(r[0], r[0])
rows += [['Monte Bianco', 45.83265, 6.86517, 4806], ['Cervino', 45.97639, 7.65833, 4478], ['Stromboli', 38.7891, 15.2131, 924]]

# togli i doppioni (stesso nome a meno di 500 m)
rows.sort(key=lambda r: (r[0], -r[3]))
dedup, last = [], {}
for r in rows:
    prev = last.get(r[0])
    if prev and abs(prev[1] - r[1]) < 0.005 and abs(prev[2] - r[2]) < 0.007:
        stats['doppioni'] += 1
        continue
    last[r[0]] = r
    dedup.append(r)

json.dump(dedup, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(dedup), 'vette scritte')
for k, v in sorted(stats.items()):
    print(' ', k, v)
