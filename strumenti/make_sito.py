"""Crea beta/sito-it.json per l'ambito «Sito ed Energia» (v37).

Fonti (da scaricare a mano, dall'ambiente di lavoro non si raggiungono):
  1. Classificazione sismica per Comune, Dipartimento della Protezione Civile (CSV, separatore «;»):
     https://rischi.protezionecivile.gov.it/en/approfondimento/seismic-classification/
  2. Comuni in area prioritaria per il radon, elenco nazionale di ARPA Lombardia (xlsx):
     https://www.arpalombardia.it/temi-ambientali/radioattivita/il-radon/aree-prioritarie-in-italia/
  3. Zone climatiche e gradi giorno per Comune (DPR 412/93, Tabella A aggiornata al 31/10/2009): il PDF dell'elenco per regioni
     e province, oppure un csv/xlsx con colonne Comune, Provincia (o codice ISTAT), Zona e Gradi giorno.

Uso:
  python3 -I make_sito.py <sismica.csv> <radon.xlsx> <clima.pdf|csv|xlsx> <cartella beta/comuni> <beta/sito-it.json> \
      --sis-v "aggiornata a maggio 2025" --rad-v "22/7/2026" --cli-v "aggiornata al 31/10/2009"

Formato di uscita: {"c": {codice ISTAT: [zona sismica, zona climatica, gradi giorno, 1 se area prioritaria radon]},
"pr": {prime 3 cifre ISTAT: codice regione}, "rad": {codice regione: "pub" | "zero"}, "fx": {codice ISTAT: [[ex Comune, zona, GG], …]}
(Comuni nati da fusione dopo il 2009: zona solo se uguale per tutti gli ex Comuni, gradi giorno 0), "sisV", "radV", "cliV"}.
I Comuni sono quelli dei confini ISTAT dell'app (beta/comuni); i codici delle fonti si confrontano con quelli, e per i Comuni
che mancano si prova col nome e la provincia. Alla fine stampa i Comuni senza dato e un controllo su Ariano Irpino.
"""
import argparse, csv, glob, io, json, os, re, sys, unicodedata

REG_NAMES = {'01': 'piemonte', '02': 'valle d aosta', '03': 'lombardia', '04': 'trentino alto adige', '05': 'veneto',
             '06': 'friuli venezia giulia', '07': 'liguria', '08': 'emilia romagna', '09': 'toscana', '10': 'umbria',
             '11': 'marche', '12': 'lazio', '13': 'abruzzo', '14': 'molise', '15': 'campania', '16': 'puglia',
             '17': 'basilicata', '18': 'calabria', '19': 'sicilia', '20': 'sardegna'}


def norm(t):
    t = unicodedata.normalize('NFKD', str(t or '')).encode('ascii', 'ignore').decode().lower()
    t = re.sub(r"[^a-z0-9]+", ' ', t).strip()
    return t


def read_table(path):
    """Righe come liste di stringhe, da csv (qualunque separatore e codifica), xlsx (tutti i fogli) o dal PDF della Tabella A
    (righe «sigla  Comune  altitudine  gradi giorno  zona» sotto i titoli delle regioni; serve pdftotext)."""
    if path.lower().endswith('.pdf'):
        import subprocess
        txt = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=True).stdout
        rows, reg = [['Provincia', 'Comune', 'Altitudine', 'Gradi giorno', 'Zona', 'Regione']], ''
        for l in txt.splitlines():
            t = l.strip()
            m = re.match(r"^([A-Z]{2})\s+(.+?)\s+(-?\d+)\s+(\d+)\s+([A-F])\s*$", t)
            if m:
                rows.append(list(m.groups()) + [reg])
            elif re.fullmatch(r"[A-Z' ]{5,}", t):
                reg = t
        return rows
    if path.lower().endswith(('.xlsx', '.xlsm')):
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        rows = []
        for ws in wb.worksheets:
            for r in ws.iter_rows(values_only=True):
                rows.append(['' if v is None else str(v).strip() for v in r])
            rows.append([])
        return rows
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            txt = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    dialect = csv.Sniffer().sniff(txt[:5000], delimiters=';,\t|')
    return [[c.strip() for c in r] for r in csv.reader(io.StringIO(txt), dialect)]


def find_header(rows, *keys):
    """Indice della riga d'intestazione e mappa nome→colonna (cerca le parole chiave)."""
    for i, r in enumerate(rows[:40]):
        n = [norm(c) for c in r]
        hit = {}
        for k, pats in keys:
            for j, c in enumerate(n):
                if any(re.search(p, c) for p in pats):
                    hit.setdefault(k, j)
        if len(hit) >= 2:
            return i, hit
    raise SystemExit('intestazione non trovata in ' + str(rows[:3]))


def reg_of(t):
    rn = norm(t)
    if not rn:
        return None
    if rn in ('bolzano', 'trento') or 'trentino' in rn:
        return '04'
    return next((k for k, v in REG_NAMES.items() if v == rn or v in rn or rn in v), None)


def main():
    a = argparse.ArgumentParser()
    a.add_argument('sis'); a.add_argument('rad'); a.add_argument('cli'); a.add_argument('comuni'); a.add_argument('out')
    a.add_argument('--sis-v', default=''); a.add_argument('--rad-v', default=''); a.add_argument('--cli-v', default='')
    a.add_argument('--rad-zero', default='08', help='regioni che hanno deciso di non avere aree prioritarie (codici, virgole)')
    o = a.parse_args()

    # Comuni dell'app
    com, byname, pr = {}, {}, {}
    for f in sorted(glob.glob(os.path.join(o.comuni, 'R*.json'))):
        reg = os.path.basename(f)[1:3]
        for c in json.load(open(f, encoding='utf-8'))['c']:
            com[c[2]] = {'n': c[0], 'p': c[1], 'r': reg}
            for nm in [c[0]] + c[0].split('/'):
                byname.setdefault((norm(nm), c[1]), c[2])
                byname.setdefault((norm(nm), reg), c[2])
            pr[c[2][:3]] = reg
    print('Comuni dell\'app:', len(com))

    def match(code, name, prov, reg=None):
        if code:
            k = re.sub(r'\D', '', str(code).split('.')[0])
            if k:
                k = k.zfill(6)
                if k in com:
                    return k
        n = norm(name)
        for key in ((n, (prov or '').upper()), (n, reg)):
            if key in byname:
                return byname[key]
        return None

    out = {k: ['', '', 0, 0] for k in com}

    # 1. sismica
    rows = read_table(o.sis)
    h, c = find_header(rows, ('istat', [r'istat']), ('zona', [r'^zona sismica$', r'zona']), ('com', [r'^comune$', r'denominazione']), ('prov', [r'sigla']), ('reg', [r'^regione$']))
    miss = []
    for r in rows[h + 1:]:
        if len(r) <= c['zona'] or not r[c['zona']]:
            continue
        k = match('', r[c['com']], r[c['prov']] if 'prov' in c else '', reg_of(r[c['reg']]) if 'reg' in c else None) if 'com' in c else None
        k = k or match(r[c['istat']] if 'istat' in c else '', '', '')
        if k:
            out[k][0] = r[c['zona']].replace(' ', '').upper()
        else:
            miss.append(r)
    print('Sismica: righe senza Comune dell\'app', len(miss), miss[:5])

    # 2. clima
    rows = read_table(o.cli)
    h, c = find_header(rows, ('istat', [r'istat']), ('com', [r'^comune', r'denominazione']), ('prov', [r'^prov', r'sigla']),
                       ('zona', [r'^zona', r'zona climatica']), ('gg', [r'gradi', r'^gg$']), ('reg', [r'^regione$']))
    miss = []
    for r in rows[h + 1:]:
        if len(r) <= max(c.values()):
            continue
        z = (r[c['zona']] or '').strip().upper()[:1]
        if z not in 'ABCDEF' or not z:
            continue
        k = match(r[c['istat']] if 'istat' in c else '', r[c['com']] if 'com' in c else '', r[c['prov']] if 'prov' in c else '',
                  reg_of(r[c['reg']]) if 'reg' in c else None)
        if not k or out[k][1]:
            miss.append(r); continue
        out[k][1] = z
        g = re.sub(r'[^\d,.]', '', r[c['gg']] if 'gg' in c else '').replace('.', '').replace(',', '.')
        out[k][2] = int(round(float(g))) if g else 0
    # Comuni nati o rinominati dopo il 2009. Fusioni: il nuovo nome contiene i nomi di 2 o più ex Comuni (es. «Cellio con Breia»)
    # o è l'inizio comune dei loro nomi (es. «Rio» ← Rio Marina + Rio nell'Elba): si tengono i valori di ciascun ex Comune.
    # Nomi cambiati (es. «Venaria» → «Venaria Reale», «San Remo» → «Sanremo»): valori del vecchio Comune.
    import difflib

    def zg(r):
        g = re.sub(r'[^\d]', '', r[c['gg']])
        return r[c['zona']].strip().upper()[:1], int(g) if g else 0
    fx, ren, fus, nt = {}, [], [], {}
    GENERIC = set('santa santo sant monte valle terme marina lago sulla della dello degli delle monferrato superiore inferiore alto alta basso bassa '
                  'nuovo nuova vecchio castel castello borgo villa piano porto garda riva ponte fiume colle bagni vicentino calabro ligure '
                  'pistoiese parmense carnico irpino sannita sabino umbra'.split())
    for r in miss[:]:
        n, pv = norm(r[c['com']]), (r[c['prov']] or '').upper()
        cand = {norm(v['n'].split('/')[0]): k for k, v in com.items() if v['p'] == pv and not out[k][1] and k not in fx}
        best = difflib.get_close_matches(n, list(cand), 1, 0.88)
        if best:
            k = cand[best[0]]
            out[k][1], out[k][2] = zg(r); ren.append(r[c['com']] + ' → ' + com[k]['n'] + ' (simile)'); miss.remove(r); nt[k] = r[c['com']]
    tokuse = {}
    for q, v in com.items():
        if not out[q][1]:
            for t in set(' '.join(norm(x) for x in v['n'].split('/')).split()):
                tokuse[(v['p'], t)] = tokuse.get((v['p'], t), 0) + 1
    for k, v in com.items():
        if out[k][1]:
            continue
        nn = ' ' + ' '.join(norm(x) for x in v['n'].split('/')) + ' '
        parts = []
        for r in miss:
            if (r[c['prov']] or '').upper() != v['p']:
                continue
            on = ' ' + norm(r[c['com']]) + ' '
            tok = [t for t in on.split() if len(t) >= 4 and t not in GENERIC and tokuse.get((v['p'], t), 0) == 1]
            if on in nn or any(on.startswith(' ' + norm(x) + ' ') for x in v['n'].split('/') if norm(x)) or any(' ' + t + ' ' in nn for t in tok):
                parts.append(r)
        if len(parts) == 1:
            out[k][1], out[k][2] = zg(parts[0]); ren.append(parts[0][c['com']] + ' → ' + v['n']); miss.remove(parts[0]); nt[k] = parts[0][c['com']]
        elif len(parts) > 1:
            fx[k] = [[r[c['com']]] + list(zg(r)) for r in parts]
            zs = {x[1] for x in fx[k]}
            if len(zs) == 1:
                out[k][1] = zs.pop()   # tutti gli ex Comuni nella stessa zona: la zona è certa, i gradi giorno no
            fus.append(v['n'] + ' (' + v['p'] + ') ← ' + ', '.join(x[0] + ' ' + x[1] + ' ' + str(x[2]) for x in fx[k]))
            for r in parts:
                miss.remove(r)
    print('Clima: nomi cambiati', len(ren), ren)
    print('Clima: fusioni', len(fus))
    for x in fus:
        print('   ', x)
    print('Clima: ex Comuni della Tabella non assegnati', len(miss), [x[1] + ' (' + x[0] + ')' for x in miss])

    # 3. radon
    rows = read_table(o.rad)
    h, c = find_header(rows, ('istat', [r'istat']), ('com', [r'^comune', r'denominazione']), ('prov', [r'^prov', r'sigla']), ('reg', [r'regione', r'provincia autonoma']))
    rad, miss = {}, []
    RAD_FIX = {'brenero': 'Brennero', 'calsaro sulla strada del vino': 'Caldaro sulla strada del vino'}   # refusi nell'elenco
    for r in rows[h + 1:]:
        if not any(r):
            continue
        reg = reg_of(r[c['reg']]) if 'reg' in c and len(r) > c['reg'] else None
        nm = r[c['com']] if 'com' in c and len(r) > c['com'] else ''
        nm = RAD_FIX.get(norm(nm), nm)
        pv = (r[c['prov']] if 'prov' in c and len(r) > c['prov'] else '').upper()
        k = match(r[c['istat']] if 'istat' in c and len(r) > c['istat'] else '', nm, pv, reg)
        if not k and nm:   # nomi bilingui («Sgonico-Zgonik»): l'inizio del nome nella stessa provincia
            cand = [q for q, v in com.items() if v['p'] == pv and (norm(v['n']) + ' ').startswith(norm(nm) + ' ')]
            k = cand[0] if len(cand) == 1 else None
        if not k:
            if any(r[:4]):
                miss.append(r[:6])
            continue
        out[k][3] = 1
        rad[com[k]['r']] = 'pub'
    for z in o.rad_zero.split(','):
        if z.strip():
            rad.setdefault(z.strip(), 'zero')
    print('Radon: Comuni in area prioritaria', sum(v[3] for v in out.values()), 'regioni', sorted(rad.items()), 'righe senza Comune', len(miss), miss[:8])

    # controlli
    nos = [com[k]['n'] + ' (' + com[k]['p'] + ')' for k, v in out.items() if not v[0]]
    noc = [com[k]['n'] + ' (' + com[k]['p'] + ')' for k, v in out.items() if not v[1]]
    print('Senza zona sismica:', len(nos), nos[:20])
    print('Senza zona climatica:', len(noc), noc[:40])
    bad = [(com[k]['n'], v[1], v[2]) for k, v in out.items() if v[1] and v[2] and v[1] != ('A' if v[2] <= 600 else 'B' if v[2] <= 900 else 'C' if v[2] <= 1400 else 'D' if v[2] <= 2100 else 'E' if v[2] <= 3000 else 'F')]
    print('Zona climatica non coerente coi gradi giorno (possibili deroghe):', len(bad), bad[:10])
    print('Ariano Irpino:', out.get('064005'))
    res = {'v': 37, 'sisV': o.sis_v, 'radV': o.rad_v, 'cliV': o.cli_v, 'pr': pr, 'rad': rad,
           'c': {k: [v[0], v[1], v[2], v[3]] for k, v in sorted(out.items())}, 'fx': fx, 'nt': nt}
    json.dump(res, open(o.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('Scritto', o.out, os.path.getsize(o.out), 'byte')


if __name__ == '__main__':
    main()
