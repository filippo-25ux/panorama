"""Test della beta con GPS, bussola e fotocamera simulati.
Uso: python3 test_peaks.py <cartella del repository> <cartella per gli screenshot>
"""
import json, math, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

REPO, OUT = sys.argv[1], sys.argv[2]
LAT, LON, ALT = 40.0, 15.3, 100.0

def offset(dn_km, de_km):
    return LAT + dn_km / 111.2, LON + de_km / (111.2 * math.cos(math.radians(LAT)))

# Vette finte: una a nord alta, una a nord bassa, una a est, una fuori raggio
PEAKS = [
    ["Monte Alto Nord", *offset(10, 0.4), 1500],
    ["Colle Basso Nord", *offset(6, -0.6), 150],
    ["Poggio Est", *offset(0, 5), 300],
    ["Monte Lontano", *offset(40, 0), 1900],
]

INIT = """
(() => {
  const coords = { latitude: %f, longitude: %f, altitude: %f, accuracy: 5, altitudeAccuracy: 5, heading: null, speed: null };
  navigator.geolocation.watchPosition = (ok) => { const f = () => ok({ coords, timestamp: Date.now() }); setTimeout(f, 300); setInterval(f, 2000); return 1; };
  navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords, timestamp: Date.now() }), 300);
  window.__setOrient = (h, beta) => {
    window.__orient = { h, beta };
  };
  setInterval(() => {
    if (!window.__orient) return;
    const e = new Event('deviceorientation');
    e.webkitCompassHeading = window.__orient.h; e.webkitCompassAccuracy = 5;
    e.alpha = 0; e.beta = window.__orient.beta; e.gamma = 0;
    window.dispatchEvent(e);
  }, 50);
})();
""" % (LAT, LON, ALT)

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=REPO)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8765), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def main():
    serve()
    results = {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
            '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        # niente rete esterna: Overpass e tile falliscono subito
        ML = '/tmp/claude-0/-home-claude/b2b4e909-7260-54ee-8aa6-aa580d6f0a0e/scratchpad/npm/node_modules/maplibre-gl/dist/'
        import os
        def route(r):
            u = r.request.url
            if u.startswith('http://127.0.0.1'): return r.continue_()
            if 'maplibre-gl' in u and os.path.isdir(ML):
                f = ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js')
                return r.fulfill(path=f)
            return r.abort()
        page.route('**/*', route)
        page.route('**/beta/peaks-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(PEAKS)))
        page.goto('http://127.0.0.1:8765/beta/index.html')
        page.evaluate('window.__setOrient(0, 90)')
        page.click('#go')
        page.wait_for_timeout(2500)
        # chiude eventuali finestre di allineamento iniziale
        for sel in ['#alCancel', 'text=Salta', 'text=Non ora', 'text=Più tardi']:
            try:
                if page.locator(sel).first.is_visible():
                    page.locator(sel).first.click(); page.wait_for_timeout(300)
            except Exception:
                pass
        # rivolto a nord vero: la bussola magnetica deve compensare la declinazione
        decl = page.evaluate("(() => { const t = document.getElementById('declInfo').textContent; const m = t.match(/([+−-]?[0-9],?[0-9]*)°/); return m ? parseFloat(m[1].replace('−','-').replace(',','.')) : 0; })()")
        page.evaluate(f'window.__setOrient({(360 - decl) % 360}, 90)')
        page.wait_for_timeout(1500)
        page.screenshot(path=f'{OUT}/nord.png')
        page.click('#mini'); page.wait_for_timeout(600)
        results['mappa_grande'] = page.evaluate("document.getElementById('miniWrap').className")
        page.screenshot(path=f'{OUT}/mappa.png')
        page.click('#miniExpand'); page.wait_for_timeout(400)
        results['mappa_chiusa'] = page.evaluate("document.getElementById('miniWrap').className")
        page.click('.flt[data-f="peak"]'); page.wait_for_timeout(400)
        results['senza_vette'] = page.evaluate("[...document.querySelectorAll('#labels .pill')].filter(p => p.style.display !== 'none').map(p => p.innerText)")
        page.click('.flt[data-f="peak"]'); page.click('.flt[data-f="sun"]'); page.wait_for_timeout(300)
        page.click('#grab'); page.wait_for_timeout(500)
        page.screenshot(path=f'{OUT}/pannello.png')
        page.click('#segD button[data-dn="3"]'); page.click('#grab'); page.wait_for_timeout(600)
        pills = page.evaluate("""[...document.querySelectorAll('#labels .pill')].filter(p => p.style.display !== 'none').map(p => {
            const r = p.getBoundingClientRect(); return { text: p.innerText.replace(/\\n/g, ' | '), cls: p.className }; })""")
        pins = page.evaluate("""[...document.querySelectorAll('#labels .pin')].filter(p => p.style.display !== 'none').map(p => ({ x: parseFloat(p.style.left), bottom: parseFloat(p.style.top) + parseFloat(p.style.height) }))""")
        results['nord'] = {'pills': pills, 'pins': pins, 'aim': page.inner_text('#aimName') + ' / ' + page.inner_text('#aimInfo'), 'foot': page.inner_text('#foot')}
        page.evaluate(f'window.__setOrient({(90 - decl) % 360}, 90)')
        page.wait_for_timeout(1500)
        page.screenshot(path=f'{OUT}/est.png')
        results['est'] = {'aim': page.inner_text('#aimName') + ' / ' + page.inner_text('#aimInfo')}
        results['errors'] = errs
        b.close()
    print(json.dumps(results, indent=1, ensure_ascii=False))

main()
