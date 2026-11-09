"""Test v37: Ricentra tondo, legenda dei livelli accesi nella scheda della mappa, ambito «Sito ed Energia».
Usa il rilievo finto di test_rilievo.py, servizi ISPRA finti (legenda con i colori) e una tabella sito-it.json finta
con Ariano Irpino (064005): sceglie un punto ad Ariano e controlla pastiglia e pagina (sismica, clima, requisiti minimi
del DM 28/10/2025, neve e vento NTC 2018 con la quota, radon «non ancora pubblicato» per la Campania).
Uso: python3 test_v37.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]
"""
import json, os, re, sys, threading, http.server, functools, base64
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'test_rilievo.py'), encoding='utf-8').read()
NS = {}
exec(src[:src.index('def serve():')], NS)
REPO, OUT, NPM = NS['REPO'], NS['OUT'], NS['NPM']
tile, INIT, TOWNS, PEAKS = NS['tile'], NS['INIT'], NS['TOWNS'], NS['PEAKS']
PORT = 8797
PNG1 = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
B64 = base64.b64encode(PNG1).decode()
SITO = {'v': 'prova', 'sisV': 'maggio 2025', 'cliV': 'prova', 'radV': '22/7/2026', 'pr': {'064': '15'},
        'c': {'064005': ['1', 'E', 2410, 0]}, 'rad': {'03': 'pub', '08': 'zero'}}
LEGEND = {'layers': [{'layerId': 0, 'layerName': 'Aree_peric_frana_PAI_2025', 'legend': [
    {'label': 'Pericolosità molto elevata P4', 'imageData': B64, 'contentType': 'image/png'},
    {'label': 'Pericolosità elevata P3', 'imageData': B64, 'contentType': 'image/png'},
    {'label': 'Pericolosità media P2', 'imageData': B64, 'contentType': 'image/png'},
    {'label': 'Pericolosità moderata P1', 'imageData': B64, 'contentType': 'image/png'},
    {'label': 'Aree di attenzione AA', 'imageData': B64, 'contentType': 'image/png'}]}]}


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
        errs, leg = [], []
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
            h = {'Access-Control-Allow-Origin': '*'}
            if 'workers.dev' in u:
                if u.endswith('/ping'):
                    return r.fulfill(status=200, content_type='text/plain', headers=h, body='orientis 2')
                return r.fulfill(status=200, content_type='text/html', headers=h, body='<table><tr><td>IT.AGE.PLA.A399_0070A0.1512</td></tr></table>')
            if 'sinacloud.isprambiente.it' in u:
                if '/export' in u:
                    return r.fulfill(status=200, content_type='image/png', headers=h, body=PNG1)
                if '/legend' in u:
                    leg.append(u)
                    return r.fulfill(status=200, content_type='application/json', headers=h, body=json.dumps(LEGEND if 'PAI_Frane' in u else {'error': {'message': 'prova'}}))
                return r.fulfill(status=200, content_type='application/json', headers=h, body='{"results": []}')
            if 'interpreter' in u:
                return r.fulfill(status=200, content_type='application/json', body='{"elements": []}', headers=h)
            if 'maplibre-gl' in u and ML and os.path.isdir(ML):
                return r.fulfill(path=ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js'))
            return r.abort()
        page.route('**/*', route)
        page.route('**/beta/peaks-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(PEAKS)))
        page.route('**/places-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(TOWNS)))
        page.route('**/beta/sito-it.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SITO)))
        page.goto(f'http://127.0.0.1:{PORT}/beta/index.html')
        check('Beta v37' in page.inner_text('body'), 'pagina iniziale «Beta v37»')
        page.evaluate('window.__setOrient(0, 90)')
        page.click('#go')
        page.wait_for_timeout(1500)
        if page.locator('#alCancel').first.is_visible():
            page.locator('#alCancel').first.click()
        for _ in range(40):
            if page.evaluate("!!window.__panoMap && document.getElementById('miniWrap').classList.contains('full')"):
                break
            page.wait_for_timeout(300)
        page.wait_for_timeout(1200)
        # Ricentra: si mostra quando la mappa non segue più; tondo con solo il simbolo
        page.evaluate("window.__panoMap.jumpTo({center: [15.4, 40.1]}); window.__panoMap.fire('dragstart')")
        page.wait_for_timeout(600)
        rc = page.locator('#miniCenter')
        if not rc.is_visible():
            page.mouse.move(200, 300); page.mouse.down(); page.mouse.move(260, 360, steps=5); page.mouse.up(); page.wait_for_timeout(600)
        bb = rc.bounding_box() if rc.is_visible() else None
        check(bb and abs(bb['width'] - 44) < 1 and abs(bb['height'] - 44) < 1, f'Ricentra: tastino tondo di 44 px ({bb})')
        check(rc.is_visible() and page.inner_text('#miniCenter').strip() == '' and page.locator('#miniCenter svg').count() == 1, 'Ricentra: solo il simbolo, senza scritta')
        check(page.get_attribute('#miniCenter', 'aria-label') == 'Ricentra sulla tua posizione', 'Ricentra: nome per l’accessibilità')
        page.screenshot(path=f'{OUT}/v37-ricentra.png')
        # legenda: nessuna a livelli spenti; Frane accese → legenda coi colori del servizio; Alluvioni senza risposta → solo le classi
        check(not page.locator('#mcLeg').is_visible(), 'senza livelli accesi nessuna legenda')
        page.click('#lyFr'); page.wait_for_timeout(1200)
        t = page.inner_text('#mcLeg') if page.locator('#mcLeg').is_visible() else ''
        check('Frane PAI' in t and 'P4 molto elevata' in t and 'P1 moderata' in t and 'Alluvioni' not in t, 'Frane accese: legenda nella scheda sotto la mappa')
        check(page.locator('#mcLeg img').count() == 5 and leg, 'legenda con i colori presi dal servizio ISPRA')
        check(not page.locator('#lyNote').is_visible(), 'la nota fluttuante non copre più la mappa')
        page.click('#lyAl'); page.wait_for_timeout(1200)
        t = page.inner_text('#mcLeg')
        check('Alluvioni PAI' in t and 'P3 elevata' in t and page.locator('#mcLeg i').count() == 3, 'Alluvioni: servizio senza legenda → classi senza colori')
        page.screenshot(path=f'{OUT}/v37-legenda.png')
        page.click('#lyFr'); page.click('#lyAl'); page.wait_for_timeout(400)
        check(not page.locator('#mcLeg').is_visible(), 'livelli spenti: la legenda sparisce')
        # Sito ed Energia per un punto ad Ariano Irpino
        page.evaluate('window.__panoPtSet(41.15125, 15.06943)')
        page.wait_for_timeout(1500)
        page.click('#mcGo'); page.wait_for_timeout(1200)
        amb = page.evaluate("[...document.querySelectorAll('#puGrid .puTile b')].map(b => b.textContent)")
        check('Sito ed Energia' in amb and 'Energia' not in amb and 'Sito' not in amb, 'un solo ambito «Sito ed Energia»: ' + str(amb))
        tt = page.inner_text('#puGrid .puTile[data-amb="sit"]')
        check('zona sismica 1' in tt and 'clima E, 2.410 GG' in tt, 'pastiglia: ' + tt.replace('\n', ' | '))
        sb = page.inner_text('#sitBox')
        check('Zona sismica' in sb and 'fortissimi terremoti' in sb, 'pagina: zona sismica 1 con la spiegazione')
        check('dal 15 ottobre al 15 aprile, max 14 ore' in sb, 'pagina: periodo di riscaldamento della zona E')
        check('0,26' in sb and '0,28' in sb and '1,40' in sb, 'pagina: trasmittanze del DM 28/10/2025 per la zona E')
        check('II' in sb and 'kN/m²' in sb and 'Vento: zona' in sb and 'm/s' in sb, 'pagina: neve zona II e vento zona 3 con la quota')
        check('non ha ancora pubblicato' in sb, 'radon: la Campania non ha ancora pubblicato le aree prioritarie')
        check(page.locator('#sitBox a').count() >= 6, 'collegamenti alle fonti')
        page.click('#puGrid .puTile[data-amb="sit"]'); page.wait_for_timeout(800)
        page.screenshot(path=f'{OUT}/v37-sito.png')
        # calcoli: neve e vento a quota nota
        r = page.evaluate("(() => { const s = window.__panoSito(); return null; })()")
        check(not errs, 'nessun errore nella pagina' + (': ' + errs[0] if errs else ''))
        b.close()
    print('TUTTO OK' if ok else 'QUALCOSA NON VA')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
