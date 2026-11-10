"""Crea beta/comuni/indice.json per la ricerca dei Comuni per nome (v38).
Per ogni Comune dei file beta/comuni/R*.json: [nome, sigla provincia, codice ISTAT, codice regione, lat, lon],
dove lat/lon è un punto sicuramente dentro il Comune (centro del tratto interno più lungo sulla riga orizzontale
che passa per il baricentro del poligono più grande).
Uso: python3 make_indice.py <cartella beta/comuni>
"""
import glob, json, os, sys


def area_c(r):
    a = cx = cy = 0.0
    n = len(r) // 2
    for i in range(n):
        x0, y0 = r[2 * i], r[2 * i + 1]
        x1, y1 = r[2 * ((i + 1) % n)], r[2 * ((i + 1) % n) + 1]
        f = x0 * y1 - x1 * y0
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
    if abs(a) < 1e-9:
        return 0, r[0], r[1]
    return abs(a) / 2, cx / (3 * a), cy / (3 * a)


def inner_point(poly):
    """poly = [anello esterno, buchi…] in interi ×1e4; restituisce (x, y) dentro."""
    _, cx, cy = area_c(poly[0])
    best = None
    for dy in (0, 0.25, -0.25, 0.5, -0.5):   # se la riga del baricentro è sfortunata, si prova un po' sopra e sotto
        ys = [poly[0][i + 1] for i in range(0, len(poly[0]), 2)]
        y = cy + dy * (max(ys) - min(ys)) / 2
        xs = []
        for ring in poly:
            n = len(ring) // 2
            for i in range(n):
                x0, y0 = ring[2 * i], ring[2 * i + 1]
                x1, y1 = ring[2 * ((i + 1) % n)], ring[2 * ((i + 1) % n) + 1]
                if (y0 > y) != (y1 > y):
                    xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            w = xs[i + 1] - xs[i]
            if best is None or w > best[0]:
                best = (w, (xs[i] + xs[i + 1]) / 2, y)
        if best:
            break
    return (best[1], best[2]) if best else (cx, cy)


def main():
    d = sys.argv[1]
    out = []
    for f in sorted(glob.glob(os.path.join(d, 'R*.json'))):
        reg = os.path.basename(f)[1:3]
        for c in json.load(open(f, encoding='utf-8'))['c']:
            polys = c[5]
            big = max(polys, key=lambda p: area_c(p[0])[0])
            x, y = inner_point(big)
            out.append([c[0], c[1], c[2], reg, round(y / 1e4, 4), round(x / 1e4, 4)])
    out.sort(key=lambda r: r[0].lower())
    json.dump({'v': 38, 'c': out}, open(os.path.join(d, 'indice.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'Comuni,', os.path.getsize(os.path.join(d, 'indice.json')), 'byte')


if __name__ == '__main__':
    main()
