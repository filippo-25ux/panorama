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
        page.route(lambda u: not u.startswith('http://127.0.0.1'), lambda r: r.abort())
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
        pills = page.evaluate("""[...document.querySelectorAll('#labels .pill')].filter(p => p.style.display !== 'none').map(p => {
            const r = p.getBoundingClientRect(); return { text: p.innerText.replace(/\\n/g, ' | '), cls: p.className, x: r.left + r.width / 2, top: r.top }; })""")
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
