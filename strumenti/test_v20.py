"""Test v20: pausa automatica della fotocamera, ricerca del sole su una copia del flusso, ridisegno limitato.
Uso: python3 test_v20.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]
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
  window.__o = { h: 200, beta: 90 };
  setInterval(() => {
    const e = new Event('deviceorientation');
    e.webkitCompassHeading = window.__o.h; e.webkitCompassAccuracy = 5;
    e.alpha = 0; e.beta = window.__o.beta; e.gamma = 0;
    window.dispatchEvent(e);
  }, 50);
  // conta i disegni
  window.__draws = 0;
})();
"""
def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=REPO)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8771), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
def main():
    serve(); ok = True
    def check(c, m):
        nonlocal ok; print(('OK   ' if c else 'NO   ') + m); ok = ok and bool(c)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'])
        ctx = b.new_context(viewport={'width': 402, 'height': 874}); ctx.add_init_script(INIT)
        page = ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        def route(r):
            u = r.request.url
            if u.startswith('http://127.0.0.1'): return r.continue_()
            if 'maplibre-gl' in u and ML and os.path.isdir(ML): return r.fulfill(path=ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js'))
            return r.abort()
        page.route('**/*', route)
        page.goto('http://127.0.0.1:8771/beta/index.html?tab=guarda')
        page.click('#go'); page.wait_for_timeout(4000)
        if page.locator('#alCancel').first.is_visible(): page.locator('#alCancel').first.click(); page.wait_for_timeout(300)
        # ridisegno: col telefono fermo pochi disegni al secondo (si misura il nastro dei gradi ridisegnato)
        n = page.evaluate("""(async () => { const t = document.getElementById('tape'); let n = 0; const o = t.getContext('2d'); const f = o.clearRect.bind(o); o.clearRect = (...a) => { n++; return f(...a); }; await new Promise(r => setTimeout(r, 2000)); return n; })()""")
        check(n <= 14, 'telefono fermo: ridisegni in 2 s = %d (prima erano ~120)' % n)
        # ricerca del sole: video nascosto separato verso il sole (se il sole è sopra l'orizzonte)
        sun = page.evaluate("(() => { const P = window.__pano; return P && P.sunPos ? P.sunPos(new Date(), 41.15, 15.09) : null; })()")
        vids = page.evaluate("document.querySelectorAll('video').length")
        check(vids == 1, 'senza sole in vista: un solo video (nessuna copia accesa)')
        # verso il sole (se è sopra l'orizzonte): compare la copia nascosta, il video visibile resta uno
        az = page.evaluate("(() => { const d = new Date(), P = Math.PI / 180; const n = (d - Date.UTC(2000,0,1,12)) / 864e5; const L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) % 360 * P; const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * P, eps = 23.439 * P; const dec = Math.asin(Math.sin(eps) * Math.sin(lam)); const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)); const gmst = (280.46061837 + 360.98564736629 * n) % 360; const H = (gmst + 15.09 - ra / P) * P, la = 41.15 * P; const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H)); const azr = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H)); return [ (azr / P + 360) % 360, alt / P ]; })()")
        if az[1] > 2:
            page.evaluate('window.__o.h = %f' % ((az[0] - 4) % 360)); page.wait_for_timeout(3500)
            v2 = page.evaluate("document.querySelectorAll('video').length")
            check(v2 == 1, 'sole in vista (alt %.0f°): il sole si cerca sul video principale, nessuna copia' % az[1])
            page.evaluate('window.__o.h = %f' % ((az[0] + 176) % 360)); page.wait_for_timeout(12000)
            v3 = page.evaluate("document.querySelectorAll('video').length")
            check(v3 == 1, 'sole fuori vista: sempre un solo video')
            page.evaluate('window.__o.h = 200')
        else:
            print('     (sole sotto l\'orizzonte: prova della copia saltata)')
        # pausa: telefono rivolto a terra per 21 s
        page.evaluate('window.__o.beta = 5')   # quasi orizzontale: camera verso terra
        page.wait_for_timeout(22500)
        st = page.evaluate("({ note: !document.getElementById('pauseNote').hidden, live: (document.getElementById('video').srcObject ? document.getElementById('video').srcObject.getTracks().filter(t => t.readyState === 'live').length : 0) })")
        check(st['note'] and st['live'] == 0, 'rivolto a terra 20 s: pausa, fotocamera spenta (%s)' % st)
        page.screenshot(path=f'{OUT}/v20-pausa.png')
        page.wait_for_timeout(3500)
        st2 = page.evaluate("document.getElementById('pauseNote').hidden")
        check(not st2, 'in pausa non si riaccende da sola (controllo ogni 3 s)')
        page.evaluate('window.__o.beta = 90'); page.wait_for_timeout(3500)
        st3 = page.evaluate("({ note: !document.getElementById('pauseNote').hidden, w: document.getElementById('video').videoWidth, live: document.getElementById('video').srcObject.getTracks().filter(t => t.readyState === 'live').length })")
        check(not st3['note'] and st3['w'] > 0 and st3['live'] == 1, 'alzando il telefono riprende (%s)' % st3)
        fr = page.evaluate("document.getElementById('video').srcObject.getVideoTracks()[0].getSettings().frameRate")
        print('     fotogrammi al secondo: %s' % fr)
        check(not errs, 'nessun errore JavaScript ' + '; '.join(errs))
        b.close()
    print('TUTTO OK' if ok else 'QUALCOSA NON VA')
main()
