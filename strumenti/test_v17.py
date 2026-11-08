"""Test v17: ripristino dell'immagine dopo il pannello, riga di diagnosi, minimappa col menù Bussola,
animazione «muovi a 8», avviso per dispositivi senza bussola.
Uso: python3 test_v17.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]
"""
import os, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

REPO, OUT = sys.argv[1], sys.argv[2]
ML = (sys.argv[3] + '/node_modules/maplibre-gl/dist/') if len(sys.argv) > 3 else ''
os.makedirs(OUT, exist_ok=True)

INIT = """
(() => {
  const coords = { latitude: 41.15, longitude: 15.09, altitude: 700, accuracy: 6, altitudeAccuracy: 9, heading: null, speed: null };
  navigator.geolocation.watchPosition = (ok) => { const f = () => ok({ coords, timestamp: Date.now() }); setTimeout(f, 300); setInterval(f, 2000); return 1; };
  navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords, timestamp: Date.now() }), 300);
  window.__acc = 5;
  setInterval(() => {
    if (window.__noComp) return;
    const e = new Event('deviceorientation');
    e.webkitCompassHeading = 200; e.webkitCompassAccuracy = window.__acc;
    e.alpha = 0; e.beta = 90; e.gamma = 0;
    window.dispatchEvent(e);
  }, 50);
})();
"""


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=REPO)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8769), h)
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
        for noComp in (False, True):
            ctx = b.new_context(viewport={'width': 402, 'height': 874}, device_scale_factor=2)
            ctx.add_init_script(INIT + ('window.__noComp = true;' if noComp else ''))
            page = ctx.new_page()
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))

            def route(r):
                u = r.request.url
                if u.startswith('http://127.0.0.1'):
                    return r.continue_()
                if 'maplibre-gl' in u and ML and os.path.isdir(ML):
                    return r.fulfill(path=ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js'))
                return r.abort()
            page.route('**/*', route)
            page.goto('http://127.0.0.1:8769/beta/index.html')
            page.click('#go')
            page.wait_for_timeout(4500)
            if noComp:
                check(page.locator('#devNote').is_visible(), 'senza bussola: compare «Serve un telefono»')
                page.screenshot(path=f'{OUT}/v17-senza-bussola.png')
                page.click('#devOk')
                check(not page.locator('#devNote').is_visible(), '«Ho capito» chiude l\'avviso')
                ctx.close()
                continue
            check(not page.locator('#devNote').is_visible(), 'con bussola: nessun avviso')
            if page.locator('#alCancel').first.is_visible():
                page.locator('#alCancel').first.click(); page.wait_for_timeout(300)
            # pannello: apre, la diagnosi si aggiorna, il video viene ricollegato
            page.click('#grab'); page.wait_for_timeout(1800)
            d = page.inner_text('#camDiag')
            print('     ' + d)
            check('flusso' in d and 'ripristini 0' not in d, 'pannello aperto: riga di diagnosi e almeno un ripristino del video')
            vis = page.evaluate("getComputedStyle(document.getElementById('miniWrap')).visibility")
            check(vis == 'hidden', 'pannello aperto: minimappa nascosta (visibility)')
            page.click('#grab'); page.wait_for_timeout(1500)
            vw = page.evaluate("document.getElementById('video').videoWidth")
            op = page.evaluate("getComputedStyle(document.getElementById('video')).opacity")
            check(vw > 0 and op == '1', 'pannello chiuso: video di nuovo visibile (%s px, opacità %s)' % (vw, op))
            # menù Bussola: minimappa nascosta; bussola poco affidabile → animazione 8
            page.evaluate('window.__acc = 40')
            page.wait_for_timeout(800)
            page.click('#compBtn'); page.wait_for_timeout(800)
            vis = page.evaluate("getComputedStyle(document.getElementById('miniWrap')).visibility")
            check(vis == 'hidden', 'menù Bussola aperto: minimappa nascosta')
            check(page.locator('#fig8').is_visible(), 'bussola poco affidabile: animazione «muovi a 8»')
            page.screenshot(path=f'{OUT}/v17-menu-8.png')
            page.evaluate('window.__acc = 5')
            page.wait_for_timeout(800)
            check(not page.locator('#fig8').is_visible(), 'bussola di nuovo buona: animazione nascosta')
            page.click('#bmClose'); page.wait_for_timeout(600)
            vis = page.evaluate("getComputedStyle(document.getElementById('miniWrap')).visibility")
            check(vis == 'visible', 'menù chiuso: minimappa di nuovo visibile')
            check(not errs, 'nessun errore JavaScript ' + ('; '.join(errs) if errs else ''))
            ctx.close()
        b.close()
    print('TUTTO OK' if ok else 'QUALCOSA NON VA')


main()
