"""Test v27: fiumi. Usa lo stesso rilievo finto di test_rilievo.py (piano a 100 m, cresta alta 400 m a 4 km a nord).
Fiumi finti (risposta di Overpass simulata):
- «Fiume Vicino»: da ovest a est, 2 km a sud, in pianura: guardando a sud deve comparire il nome, con la quota del piano;
- «Fiume Nascosto»: da ovest a est, 6 km a nord, dietro la cresta: guardando a nord NON deve comparire;
- tutti e due sulla mappa; il filtro «Fiumi» li spegne; senza rilievo niente nomi sulla fotocamera.
Uso: python3 test_v27.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]
"""
import json, os, re, sys, threading, http.server, functools, urllib.parse
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'test_rilievo.py'), encoding='utf-8').read()
NS = {}
exec(src[:src.index('def serve():')], NS)   # rilievo finto, tasselli PNG, sensori simulati
REPO, OUT, NPM = NS['REPO'], NS['OUT'], NS['NPM']
offset, tile, INIT, TOWNS, PEAKS = NS['offset'], NS['tile'], NS['INIT'], NS['TOWNS'], NS['PEAKS']
PORT = 8790


def line(dn, e0, e1, n=40):
    pts = []
    for i in range(n + 1):
        la, lo = offset(dn, e0 + (e1 - e0) * i / n)
        pts.append({'lat': la, 'lon': lo})
    return pts


RIVERS = {'elements': [
    {'type': 'way', 'id': 1, 'tags': {'waterway': 'river', 'name': 'Fiume Vicino'}, 'geometry': line(-2, -6, 6)},
    {'type': 'way', 'id': 2, 'tags': {'waterway': 'river', 'name': 'Fiume Nascosto'}, 'geometry': line(6, -2.5, 2.5)},
]}


def serve():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=REPO))
    threading.Thread(target=srv.serve_forever, daemon=True).start()


PILLS = """[...document.querySelectorAll('#labels .pill')].filter(p => p.style.display !== 'none').map(p => p.innerText.replace(/\\n/g, ' | '))"""


def main():
    serve()
    ok = True

    def check(c, msg):
        nonlocal ok
        print(('OK   ' if c else 'NO   ') + msg)
        ok = ok and bool(c)

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
            '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'])
        ctx = b.new_context(viewport={'width': 402, 'height': 874}, device_scale_factor=2)
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        errs, asked = [], []
        page.on('pageerror', lambda e: errs.append(str(e)))
        ML = os.path.join(NPM, 'node_modules/maplibre-gl/dist/') if NPM else ''

        def route(r):
            u = r.request.url
            if u.startswith('http://127.0.0.1'):
                return r.continue_()
            m = re.search(r'/terrarium/(\d+)/(\d+)/(\d+)\.png', u)
            if m:
                return r.fulfill(status=200, body=tile(*map(int, m.groups())),
                                 headers={'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*'})
            if 'interpreter' in u:
                q = urllib.parse.unquote(u)
                body = RIVERS if 'waterway' in q else {'elements': []}
                if 'waterway' in q:
                    asked.append(q)
                return r.fulfill(status=200, content_type='application/json', body=json.dumps(body),
                                 headers={'Access-Control-Allow-Origin': '*'})
            if 'maplibre-gl' in u and ML and os.path.isdir(ML):
                return r.fulfill(path=ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js'))
            return r.abort()
        page.route('**/*', route)
        page.route('**/beta/peaks-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(PEAKS)))
        page.route('**/places-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(TOWNS)))
        page.goto(f'http://127.0.0.1:{PORT}/beta/index.html')
        page.evaluate('window.__setOrient(0, 90)')
        page.click('#go')
        page.wait_for_timeout(2500)
        if page.locator('#alCancel').first.is_visible():
            page.locator('#alCancel').first.click()
        for _ in range(40):
            if page.evaluate("document.getElementById('demState').textContent") in ('attivo', 'non disponibile', 'incompleto'):
                break
            page.wait_for_timeout(500)
        page.wait_for_timeout(5000)   # i fiumi si chiedono ogni 4 s
        decl = page.evaluate("(() => { const t = document.getElementById('declInfo').textContent; const m = t.match(/([+−-]?[0-9],?[0-9]*)°/); return m ? parseFloat(m[1].replace('−','-').replace(',','.')) : 0; })()")
        check(len(asked) >= 1 and 'around:' in asked[0], 'richiesta dei fiumi a OpenStreetMap (waterway=river con nome)')
        rv = page.evaluate("window.__panoRivers().map(r => ({ n: r.n, vis: r.nVis, tot: r.smp.length }))")
        print('     fiumi:', rv)
        by = {r['n']: r for r in rv}
        check('Fiume Vicino' in by and by['Fiume Vicino']['vis'] > 50, 'Fiume Vicino: tratti visibili dal rilievo')
        check('Fiume Nascosto' in by and by['Fiume Nascosto']['vis'] == 0, 'Fiume Nascosto (dietro la cresta): nessun tratto visibile')

        def look(h):
            page.evaluate(f'window.__setOrient({(h - decl) % 360}, 90)')
            page.wait_for_timeout(1300)
            return page.evaluate(PILLS)
        sud = look(180)
        print('     sud:', sud)
        check(any('Fiume Vicino' in t for t in sud), 'guardando a sud compare «Fiume Vicino»')
        page.screenshot(path=f'{OUT}/v27-sud.png')
        aim = page.inner_text('#aimName') + ' / ' + page.inner_text('#aimInfo')
        print('     mirino:', aim)
        check('Fiume Vicino' in aim and 'fiume, 2,0 km' in aim, 'nel mirino: «fiume, 2,0 km» (dove lo sguardo incrocia il fiume)')
        it = page.evaluate("(() => { const r = window.__panoRivers().find(x => x.n === 'Fiume Vicino'); return { b: r.item.b, e: r.item.e, h: window.__pano.trueHeading() }; })()")
        check(abs(((it['b'] - it['h'] + 540) % 360) - 180 + 180) % 360 < 1.0 or abs(((it['b'] - it['h'] + 540) % 360) - 180) < 1.0 and abs(it['e'] - 100) < 5, f'etichetta all’incrocio con lo sguardo (fiume a {it["b"]:.1f}°, sguardo a {it["h"]:.1f}°, quota {it["e"]:.0f} m)')
        sudovest = look(225)
        ivb, hh = page.evaluate("[window.__panoRivers().find(x => x.n === 'Fiume Vicino').item.b, window.__pano.trueHeading()]")
        check(any('Fiume Vicino' in t for t in sudovest) and abs(ivb - hh) < 1.0, f'girando a sud-ovest il nome segue lo sguardo (fiume {ivb:.1f}°, sguardo {hh:.1f}°)')
        nord = look(0)
        print('     nord:', nord)
        check(not any('Fiume Nascosto' in t for t in nord), 'guardando a nord «Fiume Nascosto» non compare (coperto dalla cresta)')
        # mappa
        n_map = page.evaluate("window.__panoMap && window.__panoMap.getSource('rivers') ? window.__panoMap.getSource('rivers')._data.features.length : -1")
        check(n_map == 2, f'tutti e due i fiumi sulla mappa ({n_map})')
        page.click('#grab'); page.wait_for_timeout(700)
        print('     pannello:', page.inner_text('#nRiver'), '·', page.inner_text('#riverNote'))
        page.evaluate("document.getElementById('riverNote').scrollIntoView()")
        page.screenshot(path=f'{OUT}/v27-pannello.png')
        page.click('#grab'); page.wait_for_timeout(500)
        # filtro spento
        page.click('#filters .flt.f-river'); page.wait_for_timeout(200)
        sud2 = look(180)
        n_map2 = page.evaluate("window.__panoMap.getSource('rivers')._data.features.length")
        check(not any('Fiume' in t for t in sud2) and n_map2 == 0, 'filtro «Fiumi» spento: niente nomi né tracciati')
        page.click('#filters .flt.f-river'); page.wait_for_timeout(200)
        # rilievo spento: niente nomi sulla fotocamera, mappa sì
        page.evaluate("document.querySelector('#more input[data-f=\"dem\"]').click()")
        sud3 = look(180)
        check(not any('Fiume' in t for t in sud3), 'senza rilievo: niente nomi dei fiumi sulla fotocamera')
        check('rilievo' in page.inner_text('#riverNote'), 'nel pannello: «sulla fotocamera serve il rilievo del terreno»')
        page.evaluate("document.querySelector('#more input[data-f=\"dem\"]').click()")
        check(not errs, 'nessun errore JavaScript ' + ('' if not errs else str(errs[:2])))
        b.close()
    print('TUTTO OK' if ok else 'QUALCOSA NON VA')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
