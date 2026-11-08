"""Test v23 (veste grafica): tema chiaro/scuro automatico e manuale, schermate nei due temi.
Uso: python3 test_v23.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]
"""
import os, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

REPO, OUT = sys.argv[1], sys.argv[2]
ML = (sys.argv[3] + '/node_modules/maplibre-gl/dist/') if len(sys.argv) > 3 else ''
os.makedirs(OUT, exist_ok=True)
PORT = 8773

INIT = """
(() => {
  const coords = { latitude: 41.15, longitude: 15.09, altitude: 700, accuracy: 6, altitudeAccuracy: 9, heading: null, speed: null };
  navigator.geolocation.watchPosition = (ok) => { const f = () => ok({ coords, timestamp: Date.now() }); setTimeout(f, 300); setInterval(f, 2000); return 1; };
  navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords, timestamp: Date.now() }), 300);
  setInterval(() => {
    const e = new Event('deviceorientation');
    e.webkitCompassHeading = 200; e.webkitCompassAccuracy = 5;
    e.alpha = 0; e.beta = 90; e.gamma = 0;
    window.dispatchEvent(e);
  }, 50);
})();
"""


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=REPO)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


def main():
    serve()
    ok = True

    def check(cond, msg):
        nonlocal ok
        print(('OK   ' if cond else 'NO   ') + msg)
        ok = ok and bool(cond)

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
            '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'])

        def open_page(scheme):
            ctx = b.new_context(viewport={'width': 402, 'height': 874}, device_scale_factor=2, color_scheme=scheme)
            ctx.add_init_script(INIT)
            page = ctx.new_page()
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))

            def route(r):
                u = r.request.url
                if u.startswith('http://127.0.0.1'):
                    return r.continue_()
                if 'agenziaentrate' in u and scheme == 'light':   # risposta finta del catasto (formato INSPIRE dell'Agenzia)
                    return r.fulfill(status=200, content_type='text/html', headers={'Access-Control-Allow-Origin': '*'},
                                     body='<table><tr><th>InspireId localId</th><td>IT.AGE.PLA.A399_0042A0.123</td></tr></table>')
                if 'maplibre-gl' in u and ML and os.path.isdir(ML):
                    return r.fulfill(path=ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js'))
                return r.abort()
            page.route('**/*', route)
            page.goto(f'http://127.0.0.1:{PORT}/beta/index.html')
            return ctx, page, errs

        theme = lambda page: page.evaluate("document.documentElement.dataset.theme")

        for scheme in ('light', 'dark'):
            ctx, page, errs = open_page(scheme)
            check(theme(page) == scheme, f'automatico: iPhone in tema {scheme} → app in tema {scheme}')
            page.wait_for_timeout(3600)   # animazione della pagina iniziale
            page.screenshot(path=f'{OUT}/v23-{scheme}-avvio.png')
            check(page.locator('.ver').inner_text().startswith('Beta v2'), f'tema {scheme}: pagina iniziale con «Beta v2x»')
            if scheme == 'light':
                page.click('#obHow'); page.wait_for_timeout(900)
                page.screenshot(path=f'{OUT}/v23-come-1.png')
                x1 = page.evaluate("document.getElementById('obTrack').scrollLeft")
                check(x1 > 300, '«Come funziona» porta alla pagina 1 di 3')
                page.evaluate("const t = document.getElementById('obTrack'); t.scrollTo({ left: t.clientWidth * 2 })"); page.wait_for_timeout(700)
                page.screenshot(path=f'{OUT}/v23-come-2.png')
                page.evaluate("const t = document.getElementById('obTrack'); t.scrollTo({ left: t.clientWidth * 3 })"); page.wait_for_timeout(700)
                page.screenshot(path=f'{OUT}/v23-come-3.png')
                page.locator('.obGo').nth(2).click()   # Avvia dalla terza pagina
                page.wait_for_timeout(3500)
                check(page.locator('#hud').is_visible() and not page.locator('#start').is_visible(), 'Avvia dalla pagina 3 apre la fotocamera')
            else:
                page.click('#go'); page.wait_for_timeout(3500)
            if page.locator('#alCancel').first.is_visible():
                page.locator('#alCancel').first.click(); page.wait_for_timeout(300)
            page.screenshot(path=f'{OUT}/v23-{scheme}-esplora.png')
            page.click('.peek'); page.wait_for_timeout(2500)
            check(page.locator('#sheet').get_attribute('class').find('open') >= 0, f'tema {scheme}: toccando la scheda si apre il pannello')
            com = page.inner_text('#spCom'); cat = page.inner_text('#spCat')
            print('     Comune: ' + com + ' · Catasto: ' + cat)
            check(com.startswith('Ariano Irpino'), f'tema {scheme}: Comune del punto di ripresa = Ariano Irpino (AV)')
            if scheme == 'light':
                check(cat == 'foglio 42, particella 123', 'catasto (risposta finta): «foglio 42, particella 123»')
            else:
                check(cat.startswith('non disponibile'), 'catasto senza risposta: «non disponibile» con il motivo')
            page.screenshot(path=f'{OUT}/v23-{scheme}-pannello.png')
            page.evaluate("document.getElementById('segT').scrollIntoView()")
            page.wait_for_timeout(300)
            page.screenshot(path=f'{OUT}/v23-{scheme}-pannello-aspetto.png')
            check(not errs, f'tema {scheme}: nessun errore JavaScript ' + ('' if not errs else str(errs[:2])))
            ctx.close()

        # scelta manuale: Scuro con l'iPhone in chiaro, resta dopo la ricarica; Automatico torna al sistema
        ctx, page, errs = open_page('light')
        page.click('#go'); page.wait_for_timeout(3000)
        if page.locator('#alCancel').first.is_visible():
            page.locator('#alCancel').first.click(); page.wait_for_timeout(300)
        page.click('#grab'); page.wait_for_timeout(800)
        page.click('#segT button[data-th="dark"]'); page.wait_for_timeout(200)
        check(theme(page) == 'dark', 'scelta manuale «Scuro» con l\'iPhone in chiaro → scuro')
        check(page.locator('#segT button[data-th="dark"]').get_attribute('class') == 'on', 'il segmento «Scuro» risulta scelto')
        page.reload(); page.wait_for_timeout(500)
        check(theme(page) == 'dark', '«Scuro» resta dopo aver riaperto la pagina')
        page.evaluate("window.panoTheme.set('auto')")
        check(theme(page) == 'light', '«Automatico» torna al tema dell\'iPhone')
        check(not errs, 'nessun errore JavaScript ' + ('' if not errs else str(errs[:2])))
        ctx.close()
        b.close()
    print('TUTTO OK' if ok else 'QUALCOSA NON VA')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
