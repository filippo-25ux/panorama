"""Crea beta/clima-it.json per «Clima futuro» (v39) dagli indicatori PNACC 2024 di ISPRA
(https://climadat.isprambiente.it/pnacc/dati-indicatori-mappe-pnacc/aree-terrestri/).

Ingresso: la cartella con gli zip interni già estratti (uno per indicatore), come escono dai 4 pacchetti
«Clima_periodo_riferimento_aree_terrestri» e «Scenario_RCPx_aree_terrestri». Ogni zip ha un csv «Lon,Lat,valore».
- clima attuale 1981-2010: E-OBS (griglia 0,1°, valori assoluti)
- scenari RCP2.6 / RCP4.5 / RCP8.5 al 2036-2065: insieme di modelli EURO-CORDEX (~12 km), VARIAZIONI rispetto al 1981-2010
  (in unità o in %, vedi «u»), con la deviazione standard tra i modelli («std_»).
Uso: python3 -I make_clima.py <cartella degli zip interni> <beta/clima-it.json>
"""
import csv, glob, io, json, os, sys, zipfile

IND = ['mean-temperature', 'su95p', 'tr', 'wsdi', 'humidex-5', 'hdds', 'cdds', 'fd', 'prcptot', 'r20', 'rx1day', 'cdd', 'fwi', 'ews']
REF_SEAS = {'mean-temperature': ['djf', 'jja']}


def read_zip(path, want):
    """Dizionario nome-colonna → (punti, valori) dai csv dello zip."""
    out = {}
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            b = os.path.basename(n)
            if not b.endswith('.csv') or b == 'readme.csv':
                continue
            k = b[:-4]
            if want and k not in want:
                continue
            rows = list(csv.reader(io.TextIOWrapper(z.open(n), encoding='latin-1')))
            pts = [(round(float(r[0]), 4), round(float(r[1]), 4)) for r in rows[1:]]
            val = [float(r[2]) if r[2] not in ('', 'nan', 'NaN') else None for r in rows[1:]]
            out[k] = (pts, val, rows[0][2])
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    res = {'v': 39, 'ref': {'p': None, 'i': {}}, 'sc': {'p': None, 'i': {}}, 'u': {}}
    for ind in IND:
        col = ind.replace('mean-temperature', 'tg').replace('humidex-5', 'humidex5')
        seasons = ['year'] + REF_SEAS.get(ind, [])
        for se in seasons:
            key = col if se == 'year' else col + '_' + se
            f = glob.glob(os.path.join(src, ind + '_e-obs_' + se + '_italy_1981-2010_*.zip'))
            if f:
                d = read_zip(f[0], [key])[key]
                if res['ref']['p'] is None:
                    res['ref']['p'] = d[0]
                assert d[0] == res['ref']['p'], ('griglia di riferimento diversa', f[0])
                res['ref']['i'][key] = [None if x is None else round(x, 1) for x in d[1]]
            for sc in ('rcp26', 'rcp45', 'rcp85'):
                f = glob.glob(os.path.join(src, ind + '_cordex-eur-11_' + se + '_italy_1981-2010_2036-2065_*_' + sc + '.zip'))
                if not f:
                    print('manca', ind, se, sc); continue
                d = read_zip(f[0], [key, 'std_' + key])
                pts, val, unit = d[key]
                if res['sc']['p'] is None:
                    res['sc']['p'] = pts
                assert pts == res['sc']['p'], ('griglia degli scenari diversa', f[0])
                res['sc']['i'].setdefault(key, {})[sc[3:]] = [None if x is None else round(x, 1) for x in val]
                if sc == 'rcp45' and 'std_' + key in d:
                    res['sc']['i'][key]['s45'] = [None if x is None else round(x, 1) for x in d['std_' + key][1]]
                res['u'][key] = '%' if '[%]' in unit else 'abs'
    # punti come due array (lon, lat) per un file più piccolo
    for g in ('ref', 'sc'):
        p = res[g]['p']
        res[g]['p'] = [[x for x, _ in p], [y for _, y in p]]
    json.dump(res, open(dst, 'w', encoding='utf-8'), separators=(',', ':'))
    print('punti riferimento', len(res['ref']['p'][0]), 'scenari', len(res['sc']['p'][0]), 'indicatori', sorted(res['sc']['i']), 'unità %', [k for k, v in res['u'].items() if v == '%'])
    print('scritto', dst, os.path.getsize(dst), 'byte')


if __name__ == '__main__':
    main()
