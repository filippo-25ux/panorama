"""Test v30: nuova struttura (Mappa · Guarda · Punto · Archivio).
Usa il rilievo finto di test_rilievo.py (cresta a 4 km a nord). Controlla:
- dopo Avvia si apre la Mappa (a tutto schermo, sopra la barra delle sezioni) con la scheda «Qui»;
- toccando la mappa si sceglie un punto (Comune e particella finta), la freccia porta al Punto con gli ambiti;
- Guarda: scheda con Bussola · logo · Scatta, suggerimento che sparisce dopo 5 s, tocco sul paesaggio → punto sul terreno
  (la cresta a circa 4 km), tocco sul cielo → torna il nome nel mirino; il tondo della mappa si allarga nella scheda;
- Archivio = galleria; fuori da Guarda la fotocamera si spegne dopo 15 s e si riaccende tornando in Guarda.
Uso: python3 test_v30.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]
"""
import json, os, re, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'test_rilievo.py'), encoding='utf-8').read()
NS = {}
exec(src[:src.index('def serve():')], NS)
REPO, OUT, NPM = NS['REPO'], NS['OUT'], NS['NPM']
tile, INIT, TOWNS, PEAKS = NS['tile'], NS['INIT'], NS['TOWNS'], NS['PEAKS']
PORT = 8792
PARCEL = '<table><tr><th>InspireId localId</th><td>IT.AGE.PLA.A399_0042A0.123</td></tr></table>'


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
            if 'workers.dev' in u:
                return r.fulfill(status=200, content_type='text/html', headers={'Access-Control-Allow-Origin': '*'}, body=PARCEL)
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
        page.wait_for_timeout(1500)
        if page.locator('#alCancel').first.is_visible():
            page.locator('#alCancel').first.click()
        check(page.evaluate('window.__panoTab()') == 'mappa', 'dopo Avvia si apre la Mappa')
        check(page.locator('#tabs').is_visible(), 'barra delle sezioni visibile')
        check(page.evaluate('window.__panoCam().paused'), 'partendo dalla Mappa la fotocamera si spegne subito dopo il permesso')
        for _ in range(40):
            if page.evaluate("!!window.__panoMap && document.getElementById('miniWrap').classList.contains('full')"):
                break
            page.wait_for_timeout(300)
        page.wait_for_timeout(1500)
        check(page.evaluate("document.getElementById('miniWrap').classList.contains('full')"), 'mappa a tutto schermo')
        check(page.locator('#mapCard').is_visible() and page.inner_text('#mcTitle').startswith('Qui'), 'scheda della mappa: «Qui» ' + page.inner_text('#mcTitle'))
        tb = page.evaluate("document.getElementById('tabs').getBoundingClientRect().top")
        mb = page.evaluate("document.getElementById('miniWrap').getBoundingClientRect().bottom")
        check(abs(tb - mb) < 2, f'la mappa finisce sopra la barra ({mb:.0f} / {tb:.0f})')
        page.screenshot(path=f'{OUT}/v30-mappa.png')
        # tocco sulla mappa → punto scelto
        page.mouse.click(200, 300)
        for _ in range(30):
            if 'part.' in page.inner_text('#mcRows'):
                break
            page.wait_for_timeout(300)
        print('     scheda:', page.inner_text('#mcTitle'), '|', page.inner_text('#mcRows').replace('\n', ' '))
        check(page.inner_text('#mcTitle').startswith('Punto scelto'), 'toccando la mappa si sceglie un punto')
        check('foglio 42 · part. 123' in page.inner_text('#mcRows'), 'particella del punto scelto (risposta finta)')
        check('in arrivo' in page.inner_text('#mcRows'), 'Vincoli e Urbanistica «in arrivo»')
        page.screenshot(path=f'{OUT}/v30-mappa-punto.png')
        page.click('#mcGo'); page.wait_for_timeout(500)
        check(page.evaluate('window.__panoTab()') == 'punto' and page.locator('#punto').is_visible(), 'la freccia porta al Punto')
        tiles = page.evaluate("[...document.querySelectorAll('#puGrid .puTile b')].map(b => b.textContent)")
        check(tiles == ['Catasto', 'Vincoli', 'Urbanistica', 'Pioggia', 'Energia', 'Sito'], 'cruscotto con i sei ambiti')
        check('foglio 42' in page.inner_text('#puGrid'), 'Catasto nel cruscotto del punto scelto')
        page.screenshot(path=f'{OUT}/v30-punto.png')
        page.click('#puSeg button[data-pu="qui"]'); page.wait_for_timeout(400)
        check(page.inner_text('#puTitle') == 'Qui' and page.locator('#spot').is_visible(), '«Qui»: dati del punto di ripresa')
        page.screenshot(path=f'{OUT}/v30-punto-qui.png')
        # Guarda
        page.click('#tabs button[data-tab="guarda"]')
        for _ in range(40):
            if page.evaluate("document.getElementById('demState').textContent") in ('attivo', 'non disponibile', 'incompleto'):
                break
            page.wait_for_timeout(500)
        page.wait_for_timeout(800)
        check(page.locator('#tapHint').is_visible(), 'suggerimento «Tocca il paesaggio per interrogarlo»')
        check(page.locator('#shotBtn').is_visible() and page.locator('#compBtn').is_visible() and page.locator('#brandMini').is_visible(), 'Bussola, logo e Scatta nella scheda')
        check(not page.locator('#galBtn').is_visible(), 'niente tasto galleria (c’è Archivio)')
        sb = page.evaluate("(() => { const s = document.getElementById('sheet').getBoundingClientRect(), c = document.getElementById('compBtn').getBoundingClientRect(), m = document.getElementById('miniWrap').getBoundingClientRect(); return { cl: c.left - s.left, cb: s.bottom - c.bottom, mr: s.right - m.right, mt: m.top - s.top }; })()")
        print('     margini:', sb)
        check(abs(sb['cl'] - 20) < 2 and abs(sb['cb'] - 20) < 2 and abs(sb['mr'] - 20) < 2 and abs(sb['mt'] - 20) < 2, 'Bussola e tondo a 20 px dai bordi della scheda')
        page.screenshot(path=f'{OUT}/v30-guarda.png')
        page.wait_for_timeout(5600)
        check(not page.locator('#tapHint').is_visible(), 'il suggerimento sparisce dopo 5 secondi')
        # tocco sulla cresta (guardando a nord)
        decl = page.evaluate("(() => { const t = document.getElementById('declInfo').textContent; const m = t.match(/([+−-]?[0-9],?[0-9]*)°/); return m ? parseFloat(m[1].replace('−','-').replace(',','.')) : 0; })()")
        page.evaluate(f'window.__setOrient({(0 - decl) % 360}, 90)')
        page.wait_for_timeout(1300)
        # punto un poco sotto la linea delle creste al centro dello schermo
        y = page.evaluate("""(() => { const P = window.__pano.dem().prof; const S = window.__pano.S; const h = window.__pano.trueHeading(); const a = Math.round(((h % 360) + 360) % 360 / 0.5) % P.nA;
          const alt = P.hz[a]; const pitch = S.pitch + S.pitchOff; const W = innerWidth, H = innerHeight; const tanV = Math.tan(S.fov * Math.PI / 360);
          return H / 2 + Math.tan((pitch - alt + 0.3) * Math.PI / 180) / tanV * H / 2; })()""")
        page.mouse.click(201, y)
        page.wait_for_timeout(1500)
        pt = page.evaluate('window.__panoPt()')
        print('     punto toccato:', None if not pt else {k: pt[k] for k in ('d', 'b', 'src')})
        exp = page.evaluate("(() => { const P = window.__pano.dem().prof, b = window.__panoPt().b; return P.hzD[Math.round(b / 0.5) % P.nA]; })()")
        check(pt and pt['src'] == 'guarda' and abs(pt['d'] - exp) < max(400, exp * 0.1), f'toccando appena sotto la linea del cielo: punto sul monte che la forma ({pt and round(pt["d"])} m, linea del cielo a {round(exp)} m)')
        check(page.inner_text('#aimName') == 'Punto toccato' and page.locator('#ptRows').is_visible(), 'scheda di Guarda: «Punto toccato» con le righe')
        check(page.locator('#ptMark').is_visible(), 'segno sul punto toccato')
        page.screenshot(path=f'{OUT}/v30-guarda-punto.png')
        page.mouse.click(201, 160)   # cielo
        page.wait_for_timeout(600)
        check(not page.locator('#ptRows').is_visible() and page.inner_text('#aimName') != 'Punto toccato', 'toccando il cielo torna il nome nel mirino')
        # tondo che si allarga nella scheda
        mr = page.evaluate("(() => { const r = document.getElementById('mini').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        page.mouse.click(mr[0], mr[1]); page.wait_for_timeout(700)
        check(page.evaluate("document.getElementById('miniWrap').classList.contains('insheet')"), 'il tondo della mappa si allarga dentro la scheda')
        page.screenshot(path=f'{OUT}/v30-guarda-mappa.png')
        page.click('#miniExpand'); page.wait_for_timeout(500)
        check(not page.evaluate("document.getElementById('miniWrap').classList.contains('insheet')"), '✕ richiude la mappa nella scheda')
        # Archivio
        page.click('#tabs button[data-tab="archivio"]'); page.wait_for_timeout(800)
        check(page.locator('#gal').is_visible() and page.locator('#tabs').is_visible(), 'Archivio = galleria, con la barra delle sezioni')
        page.screenshot(path=f'{OUT}/v30-archivio.png')
        page.wait_for_timeout(16000)
        check(page.evaluate('window.__panoCam().paused'), 'fuori da Guarda la fotocamera si spegne dopo 15 s')
        page.click('#tabs button[data-tab="guarda"]'); page.wait_for_timeout(1500)
        check(not page.evaluate('window.__panoCam().paused'), 'tornando in Guarda la fotocamera si riaccende')
        check(not errs, 'nessun errore JavaScript ' + ('' if not errs else str(errs[:3])))
        b.close()
    print('TUTTO OK' if ok else 'QUALCOSA NON VA')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
