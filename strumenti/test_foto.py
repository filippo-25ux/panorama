"""Test del passo 2 (zoom, scatto, galleria, modifica, punto di ripresa) con GPS, bussola e fotocamera simulati.
Uso: python3 test_foto.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]
"""
import json, os, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

REPO, OUT = sys.argv[1], sys.argv[2]
ML = (sys.argv[3] + '/node_modules/maplibre-gl/dist/') if len(sys.argv) > 3 else ''
LAT, LON, ALT = 40.03, 15.28, 320.0

INIT = """
(() => {
  const coords = { latitude: %f, longitude: %f, altitude: %f, accuracy: 6, altitudeAccuracy: 9, heading: null, speed: null };
  navigator.geolocation.watchPosition = (ok) => { const f = () => ok({ coords, timestamp: Date.now() }); setTimeout(f, 300); setInterval(f, 2000); return 1; };
  navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords, timestamp: Date.now() }), 300);
  window.__setOrient = (h, beta) => { window.__orient = { h, beta }; };
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
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8766), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


PILLS = """[...document.querySelectorAll('#labels .pill')].filter(p => p.style.display !== 'none')
  .map(p => ({ n: p.querySelector('b').textContent, x: parseFloat(p.nextSibling.style.left) }))"""


def main():
    serve()
    R = {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
            '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'])
        ctx = b.new_context(viewport={'width': 402, 'height': 874}, device_scale_factor=2, accept_downloads=True)
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append('console: ' + m.text[:200]) if m.type == 'error' and 'Failed to fetch' not in m.text and 'ERR_FAILED' not in m.text else None)

        def route(r):
            u = r.request.url
            if u.startswith('http://127.0.0.1'):
                return r.continue_()
            if 'maplibre-gl' in u and ML and os.path.isdir(ML):
                return r.fulfill(path=ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js'))
            return r.abort()
        page.route('**/*', route)
        page.goto('http://127.0.0.1:8766/beta/index.html?tab=guarda')
        page.evaluate('window.__setOrient(300, 90)')
        page.click('#go')
        page.wait_for_timeout(3000)
        for sel in ['#alCancel']:
            if page.locator(sel).first.is_visible():
                page.locator(sel).first.click(); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/1-esplora.png')
        R['camInfo'] = page.inner_text('#camInfo')

        # Zoom: le etichette devono allargarsi dal centro del doppio
        before = page.evaluate(PILLS)
        page.click('#zoom .zp[data-k="2"]')  # pastiglia 2× (v23)
        page.wait_for_timeout(800)
        after = page.evaluate(PILLS)
        R['zoom_video'] = page.evaluate("document.getElementById('video').style.transform")
        R['zoom_knob'] = page.inner_text('#zoom .zp[aria-pressed="true"]')
        W = 402
        ratios = []
        for a in before:
            for c in after:
                if a['n'] == c['n'] and abs(a['x'] - W / 2) > 15:
                    ratios.append(round((c['x'] - W / 2) / (a['x'] - W / 2), 2))
        R['zoom_rapporti_distanza_dal_centro'] = ratios
        page.screenshot(path=f'{OUT}/2-zoom2x.png')
        page.click('#zoom .zp[data-k="1"]')  # torna a 1×
        page.wait_for_timeout(500)

        # Punto di ripresa nel pannello
        page.click('#grab'); page.wait_for_timeout(1200)
        R['spot'] = page.inner_text('#spot')
        page.screenshot(path=f'{OUT}/3-pannello.png')
        page.click('#grab'); page.wait_for_timeout(500)

        # Scatto
        page.click('#shotBtn'); page.wait_for_timeout(800)
        page.screenshot(path=f'{OUT}/4-scatto.png')
        page.click('#shotGo'); page.wait_for_timeout(1500)
        R['toast_scatto'] = page.inner_text('#toastText')
        page.click('#shotNames'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/5-scatto-senza-nomi.png')
        page.click('#shotGo'); page.wait_for_timeout(1500)
        page.click('#shotNames')

        # Galleria
        page.click('#galBtn2'); page.wait_for_timeout(1500)
        R['gal_count'] = page.inner_text('#galCount')
        R['gal_cap'] = page.inner_text('#galCap')
        R['gal_info'] = page.inner_text('#galInfo')
        page.screenshot(path=f'{OUT}/6-galleria.png')
        page.click('#galInfo .giSum'); page.wait_for_timeout(400)   # v26: dettagli in due gruppi
        R['gal_info_dettagli'] = page.inner_text('#galInfo')
        page.screenshot(path=f'{OUT}/6b-galleria-dettagli.png')
        page.click('#galInfo .giSum'); page.wait_for_timeout(300)
        page.locator('#galStrip button').nth(1).click(); page.wait_for_timeout(1000)
        R['gal_count_2'] = page.inner_text('#galCount')
        page.locator('#galStrip button').nth(0).click(); page.wait_for_timeout(1000)

        # Modifica: raddrizza di 5° e ritaglia dall'angolo in basso a destra
        page.click('#galEdit'); page.wait_for_timeout(900)
        page.evaluate("const r = document.getElementById('edRot'); r.value = '5'; r.dispatchEvent(new Event('input'))")
        page.wait_for_timeout(300)
        cb = page.locator('#edCrop').bounding_box()
        page.mouse.move(cb['x'] + cb['width'] - 4, cb['y'] + cb['height'] - 4)
        page.mouse.down(); page.mouse.move(cb['x'] + cb['width'] * 0.7, cb['y'] + cb['height'] * 0.6, steps=6); page.mouse.up()
        page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/7-modifica.png')
        page.click('#edSave'); page.wait_for_timeout(1500)
        R['edit_salvato'] = page.evaluate("new Promise(ok => { const r = indexedDB.open('panorama-foto'); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').getAll(); q.onsuccess = () => ok(q.result.map(x => x.edit)); }; })")
        page.screenshot(path=f'{OUT}/8-galleria-modificata.png')

        # Condividi (nel browser di prova non c'è il foglio di condivisione: deve scaricare il file)
        page.wait_for_timeout(1200)
        with page.expect_download(timeout=15000) as dl:
            page.click('#galShare')
        d = dl.value
        d.save_as(f'{OUT}/9-condivisa.jpg')
        R['file_condiviso'] = d.suggested_filename

        # Elimina con conferma
        page.click('#galDel'); page.wait_for_timeout(200)
        R['elimina_1'] = page.inner_text('#galDel')
        page.click('#galDel'); page.wait_for_timeout(1000)
        R['gal_count_dopo'] = page.inner_text('#galCount')
        # la foto rimasta ha i nomi: condivisa deve avere etichette e fascia con le fonti
        page.wait_for_timeout(1500)
        with page.expect_download(timeout=15000) as dl:
            page.click('#galShare')
        dl.value.save_as(f'{OUT}/10-condivisa-nomi.jpg')
        page.click('#galEdit'); page.wait_for_timeout(600)
        page.evaluate("const r = document.getElementById('edRot'); r.value = '-8'; r.dispatchEvent(new Event('input'))")
        page.wait_for_timeout(400)
        page.screenshot(path=f'{OUT}/11-modifica-nomi.png')
        page.click('#edCancel'); page.wait_for_timeout(300)
        page.click('#tabs button[data-tab="guarda"]'); page.wait_for_timeout(300)
        R['errori'] = errs
        b.close()
    print(json.dumps(R, indent=1, ensure_ascii=False))


main()
