"""Test v29: creste a tre livelli (vicino, medio, lontano) con la distanza scritta.
Usa il rilievo finto di test_rilievo.py: cresta a 4 km a nord, Monte Alto Nord (1500 m) a 10 km che spunta sopra.
Guardando a nord ci devono essere: la linea vicina con «4,0 km» circa e la linea media con «10 km» circa (solo dove la vetta sporge).
Uso: python3 test_v29.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]
"""
import json, os, re, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'test_rilievo.py'), encoding='utf-8').read()
NS = {}
exec(src[:src.index('def serve():')], NS)
REPO, OUT, NPM = NS['REPO'], NS['OUT'], NS['NPM']
tile, INIT, TOWNS, PEAKS = NS['tile'], NS['INIT'], NS['TOWNS'], NS['PEAKS']
PORT = 8791


def serve():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=REPO))
    threading.Thread(target=srv.serve_forever, daemon=True).start()


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
        errs = []
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
                return r.fulfill(status=200, content_type='application/json', body='{"elements": []}', headers={'Access-Control-Allow-Origin': '*'})
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
        decl = page.evaluate("(() => { const t = document.getElementById('declInfo').textContent; const m = t.match(/([+−-]?[0-9],?[0-9]*)°/); return m ? parseFloat(m[1].replace('−','-').replace(',','.')) : 0; })()")
        lv = page.evaluate("Array.from(window.__pano.dem().prof.LV)")
        print('     livelli:', lv)
        check(len(lv) == 3 and lv[0] < lv[1] < lv[2], 'tre livelli di distanza nel profilo del rilievo')

        def look(h):
            page.evaluate(f'window.__setOrient({(h - decl) % 360}, 90)')
            page.wait_for_timeout(1300)
            return page.evaluate("window.__panoRidge()")
        nord = look(0)
        print('     nord:', [(l['k'], l['txt']) for l in nord])
        page.screenshot(path=f'{OUT}/v29-nord.png')
        near = [l for l in nord if abs(l['d'] - 4000) < 500]
        mid = [l for l in nord if abs(l['d'] - 10000) < 800]
        check(near, 'una linea con la distanza della cresta (circa 4 km)')
        check(mid, 'un’altra linea, più lontana, dove Monte Alto Nord sporge (circa 10 km)')
        check(not [l for l in nord if l['k'] == 2], 'nessuna linea lontana dove non c’è nulla oltre i 12 km')
        # allineamento: le linee diventano azzurre, le distanze restano
        page.click('#bussolaBtn') if page.locator('#bussolaBtn').count() else None
        page.evaluate("window.__pano.align && 0")
        sud = look(180)
        print('     sud:', [(l['k'], l['txt']) for l in sud])
        check(len(sud) <= 1, 'in pianura al massimo una linea (l’orizzonte del piano)')
        page.evaluate("document.querySelector('#more input[data-f=\"ridge\"]').click()")
        page.wait_for_timeout(500)
        check(page.evaluate("window.__panoRidge().length") == 0, 'linea delle creste spenta: nessuna distanza scritta')
        page.evaluate("document.querySelector('#more input[data-f=\"ridge\"]').click()")
        check(not errs, 'nessun errore JavaScript ' + ('' if not errs else str(errs[:2])))
        b.close()
    print('TUTTO OK' if ok else 'QUALCOSA NON VA')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
