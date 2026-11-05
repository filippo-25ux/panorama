"""Test del rilievo del terreno nella beta, con GPS, bussola, fotocamera e rilievo simulati.
Uso: python3 test_rilievo.py <cartella del repository> <cartella per gli screenshot> [cartella npm con maplibre-gl]

Il rilievo finto (tasselli Terrarium generati qui) ha:
- una cresta a 4 km a nord, alta 500 m, che nasconde «Monte Nascosto» (520 m, 8 km a nord);
- «Monte Alto Nord» (1500 m, 10 km a nord), che spunta sopra la cresta;
- il paese «Collina» su un colle di 450 m, 3 km a ovest;
- il paese «Valle Dietro» a 6 km a nord, dietro la cresta;
- il paese «Pianura» 5 km a sud, in piano (100 m).
I tasselli sono scritti con tutti e cinque i filtri PNG, per provare la lettura dei PNG.
"""
import json, math, os, re, sys, threading, http.server, functools, struct, zlib
import numpy as np
from playwright.sync_api import sync_playwright

REPO, OUT = sys.argv[1], sys.argv[2]
NPM = sys.argv[3] if len(sys.argv) > 3 else ''
LAT, LON, GROUND = 40.0, 15.3, 100.0
os.makedirs(OUT, exist_ok=True)

def offset(dn_km, de_km):
    return LAT + dn_km / 111.195, LON + de_km / (111.195 * math.cos(math.radians(LAT)))

# Colline gaussiane: (nord km, est km, altezza sopra il piano, sigma km)
HILLS = [(10, 0.4, 1400, 1.2), (8, -0.3, 420, 0.5), (0, 5, 200, 0.6), (0.5, -3, 350, 0.8)]
PEAKS = [["Monte Alto Nord", *offset(10, 0.4), 1500], ["Monte Nascosto", *offset(8, -0.3), 520], ["Poggio Est", *offset(0, 5), 300]]
TOWNS = [["Collina", *offset(0.5, -3), 800, 0], ["Valle Dietro", *offset(6, 1.0), 800, 0], ["Pianura", *offset(-5, 0), 800, 0]]

def height(lat, lon):
    n = (lat - LAT) * 111.195
    e = (lon - LON) * 111.195 * math.cos(math.radians(LAT))
    h = GROUND + np.zeros_like(n)
    # cresta est-ovest a 4 km a nord, 400 m sopra il piano, da -3 a +3 km
    ends = np.exp(-np.maximum(0, np.abs(e) - 3) ** 2 / 0.25)
    h = h + 400 * np.exp(-(n - 4) ** 2 / (2 * 0.3 ** 2)) * ends
    for hn, he, hh, sg in HILLS:
        h = h + hh * np.exp(-((n - hn) ** 2 + (e - he) ** 2) / (2 * sg ** 2))
    return h

def png_rgb(rgb):
    """PNG RGB 8 bit, con i filtri 0-4 a rotazione sulle righe."""
    h, w, _ = rgb.shape
    raw = bytearray()
    prev = np.zeros(w * 3, dtype=np.int32)
    for y in range(h):
        cur = rgb[y].reshape(-1).astype(np.int32)
        a = np.concatenate([np.zeros(3, np.int32), cur[:-3]])
        b = prev
        c = np.concatenate([np.zeros(3, np.int32), prev[:-3]])
        f = y % 5
        if f == 0: out = cur
        elif f == 1: out = cur - a
        elif f == 2: out = cur - b
        elif f == 3: out = cur - ((a + b) >> 1)
        else:
            pa, pb, pc = np.abs(b - c), np.abs(a - c), np.abs(a + b - 2 * c)
            pred = np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, b, c))
            out = cur - pred
        raw.append(f)
        raw.extend((out & 255).astype(np.uint8).tobytes())
        prev = cur
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 6)) + chunk(b'IEND', b''))

def tile(z, x, y):
    n = 2 ** z
    i = np.arange(256) + 0.5
    lon = (x + i / 256) / n * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (y + i / 256) / n))))
    LO, LA = np.meshgrid(lon, lat)
    v = height(LA, LO) + 32768
    r = np.floor(v / 256); g = np.floor(v) % 256; b = np.floor((v - np.floor(v)) * 256)
    return png_rgb(np.stack([r, g, b], -1).astype(np.uint8))

INIT = """
(() => {
  const coords = { latitude: %f, longitude: %f, altitude: %f, accuracy: 5, altitudeAccuracy: 5, heading: null, speed: null };
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
""" % (LAT, LON, GROUND + 1.6)

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=REPO)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8766), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

PILLS = """[...document.querySelectorAll('#labels .pill')].filter(p => p.style.display !== 'none').map(p => {
  const pin = p.nextElementSibling; return { text: p.innerText.replace(/\\n/g, ' | '), ay: pin ? parseFloat(pin.style.top) + parseFloat(pin.style.height) : null }; })"""

def main():
    serve()
    res, tiles = {}, []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
            '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        ML = os.path.join(NPM, 'node_modules/maplibre-gl/dist/') if NPM else ''
        def route(r):
            u = r.request.url
            if u.startswith('http://127.0.0.1'): return r.continue_()
            m = re.search(r'/terrarium/(\d+)/(\d+)/(\d+)\.png', u)
            if m:
                tiles.append(u)
                return r.fulfill(status=200, body=tile(*map(int, m.groups())),
                                 headers={'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*'})
            if 'maplibre-gl' in u and ML and os.path.isdir(ML):
                return r.fulfill(path=ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js'))
            return r.abort()
        page.route('**/*', route)
        page.route('**/beta/peaks-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(PEAKS)))
        page.route('**/places-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(TOWNS)))
        page.goto('http://127.0.0.1:8766/beta/index.html')
        page.evaluate('window.__setOrient(0, 90)')
        page.click('#go')
        page.wait_for_timeout(2500)
        for sel in ['#alCancel', 'text=Salta', 'text=Non ora', 'text=Più tardi']:
            try:
                if page.locator(sel).first.is_visible():
                    page.locator(sel).first.click(); page.wait_for_timeout(300)
            except Exception:
                pass
        decl = page.evaluate("(() => { const t = document.getElementById('declInfo').textContent; const m = t.match(/([+−-]?[0-9],?[0-9]*)°/); return m ? parseFloat(m[1].replace('−','-').replace(',','.')) : 0; })()")
        # attende il rilievo
        for _ in range(40):
            st = page.evaluate("document.getElementById('demState').textContent")
            if st in ('attivo', 'non disponibile', 'incompleto'): break
            page.wait_for_timeout(500)
        res['stato_rilievo'] = st
        res['tasselli_richiesti'] = len(tiles)
        page.evaluate("document.querySelector('#segD button[data-dn=\"3\"]').click()")
        def look(h_true):
            page.evaluate(f'window.__setOrient({(h_true - decl) % 360}, 90)')
            page.wait_for_timeout(1200)
            return page.evaluate(PILLS)
        res['nord'] = look(0)
        page.screenshot(path=f'{OUT}/rilievo_nord.png')
        look(math.degrees(math.atan2(1.0, 6)))
        res['mirino_valle'] = page.inner_text('#aimName') + ' / ' + page.inner_text('#aimInfo')
        res['ovest'] = look(270)
        page.screenshot(path=f'{OUT}/rilievo_ovest.png')
        res['sud'] = look(180)
        page.click('#grab'); page.wait_for_timeout(600)
        res['quota_terreno'] = page.inner_text('#spGround')
        res['fov'] = page.inner_text('#vFov')
        page.screenshot(path=f'{OUT}/rilievo_pannello.png')
        # rilievo spento: la vetta nascosta torna, il paese in collina scende all'altezza degli occhi
        page.click('#grab'); page.wait_for_timeout(600)
        page.evaluate("document.querySelector('#more input[data-f=\"dem\"]').click()")
        res['nord_senza'] = look(0)
        res['ovest_senza'] = look(270)
        page.evaluate("document.querySelector('#more input[data-f=\"dem\"]').click()")
        page.wait_for_timeout(1500)
        res['nord_riacceso'] = look(0)
        # sole il 21 marzo: sorge a est, dietro «Poggio Est» (2,3° sopra l'orizzonte)
        page.evaluate("document.querySelector('#more input[data-f=\"sun\"]').click()")
        page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#sunRow button[data-sd=\"3-21\"]').click()")
        page.wait_for_timeout(500)
        res['sole_21_marzo'] = page.inner_text('#sdInfo')
        page.evaluate("document.querySelector('#sunRow button[data-sd=\"6-21\"]').click()")
        page.wait_for_timeout(500)
        res['sole_21_giugno'] = page.inner_text('#sdInfo')
        look(90)
        page.screenshot(path=f'{OUT}/rilievo_sole_est.png')
        # --- Allinea col profilo: bussola sbagliata di +5° (il telefono guarda a nord, la bussola dice 5°) ---
        page.evaluate("document.querySelector('#more input[data-f=\"sun\"]').click()")
        page.evaluate(f'window.__setOrient({(5 - decl) % 360}, 90)')
        page.wait_for_timeout(1200)
        res['al_pulsante'] = page.inner_text('#alignBtnT')
        page.evaluate("document.getElementById('alignBtn').click()")
        page.wait_for_timeout(800)
        res['al_passo'] = page.evaluate('window.__pano.align.step')
        res['al_linea_px'] = page.evaluate("""(() => { const c = document.getElementById('ridge'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()""")
        page.screenshot(path=f'{OUT}/allinea_prima.png')
        fov = page.evaluate('window.__pano.S.fov')
        tanH = math.tan(math.radians(fov / 2)) * 390 / 844
        ppd = (390 / 2) / tanH * math.pi / 180
        page.mouse.move(120, 500); page.mouse.down()
        for k in range(1, 11):
            page.mouse.move(120 + 5 * ppd * k / 10, 500); page.wait_for_timeout(30)
        page.mouse.up(); page.wait_for_timeout(400)
        res['al_info'] = page.inner_text('#alInfo')
        page.screenshot(path=f'{OUT}/allinea_dopo.png')
        page.click('#alOk'); page.wait_for_timeout(400)
        res['al_dopo'] = page.evaluate('({ off: window.__pano.S.alOff, q: window.__pano.S.alQ, step: window.__pano.align.step, pos: !!window.__pano.S.alPos })')
        res['al_toast'] = page.inner_text('#toastText')
        # due dita: allarga (campo visivo più stretto), poi Annulla deve rimettere tutto com'era
        page.evaluate("document.getElementById('alignBtn').click()")
        page.wait_for_timeout(400)
        res['al_pinch'] = page.evaluate("""(async () => {
          const L = document.getElementById('alignLayer'), ev = (t, id, x) => L.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: 500, bubbles: true }));
          ev('pointerdown', 11, 100); ev('pointerdown', 12, 300);
          for (let k = 1; k <= 8; k++) { ev('pointermove', 12, 300 + 5 * k); await new Promise(r => setTimeout(r, 20)); }
          const fov = window.__pano.S.fov;
          ev('pointerup', 12, 340); ev('pointerup', 11, 100);
          return fov; })()""")
        page.click('#alCancel'); page.wait_for_timeout(300)
        res['al_annulla'] = page.evaluate('({ off: window.__pano.S.alOff, q: window.__pano.S.alQ, fov: window.__pano.S.fov })')
        # senza rilievo: si torna al luogo o al sole
        page.click('#grab'); page.wait_for_timeout(500)
        page.evaluate("document.querySelector('#more input[data-f=\"dem\"]').click()")
        page.click('#grab'); page.wait_for_timeout(500)
        res['al_pulsante_senza'] = page.inner_text('#alignBtnT')
        page.evaluate("document.getElementById('alignBtn').click()")
        page.wait_for_timeout(400)
        res['al_passo_senza'] = page.evaluate('window.__pano.align.step')
        page.click('#alCancel')
        res['foot'] = page.evaluate("document.getElementById('foot').textContent")
        res['errors'] = errs
        b.close()
    print(json.dumps(res, indent=1, ensure_ascii=False))

    # Verifiche
    H, ok = 844, True
    fov = float(res['fov'].rstrip('°').replace(',', '.'))
    def names(lst): return ' / '.join(x['text'] for x in lst)
    def check(cond, msg):
        nonlocal ok
        print(('OK   ' if cond else 'NO   ') + msg)
        ok = ok and cond
    check(res['stato_rilievo'] == 'attivo', 'rilievo caricato')
    check('Monte Alto Nord' in names(res['nord']), 'Monte Alto Nord visibile sopra la cresta')
    check('Monte Nascosto' not in names(res['nord']), 'Monte Nascosto nascosto dalla cresta')
    check('Monte Nascosto' in names(res['nord_senza']), 'Monte Nascosto ricompare col rilievo spento')
    check('Monte Nascosto' not in names(res['nord_riacceso']), 'Monte Nascosto di nuovo nascosto col rilievo riacceso')
    check(res['mirino_valle'].startswith('Valle Dietro') and 'dietro i rilievi' in res['mirino_valle'], 'Valle Dietro segnato «dietro i rilievi» (' + res['mirino_valle'] + ')')
    pi = [x for x in res['sud'] if 'Pianura' in x['text']]
    check(bool(pi) and 'dietro i rilievi' not in pi[0]['text'], 'Pianura visibile normalmente')
    check(res['quota_terreno'].startswith('≈ 100 '), 'quota del terreno nel punto di ripresa ≈ 100 m (' + res['quota_terreno'] + ')')
    # paese in collina: angolo atteso con quota 450 m a 3,04 km
    d = math.hypot(0.5, 3) * 1000
    elev = math.degrees(math.atan2(450 - d * d / (2 * 6371000) * 0.87 - (GROUND + 1.6), d))
    tanV = math.tan(math.radians(fov / 2))
    ay_exp = H / 2 - math.tan(math.radians(elev)) / tanV * H / 2
    co = [x for x in res['ovest'] if 'Collina' in x['text']]
    co0 = [x for x in res['ovest_senza'] if 'Collina' in x['text']]
    if co and co0:
        check(abs(co[0]['ay'] - ay_exp) < 6, f'Collina all\'altezza giusta: {co[0]["ay"]:.0f} px (atteso {ay_exp:.0f})')
        check(abs(co0[0]['ay'] - H / 2) < 6, f'senza rilievo Collina torna all\'altezza degli occhi: {co0[0]["ay"]:.0f} px')
    else:
        check(False, 'etichetta Collina trovata')
    m = re.search(r'Alba (\d\d):(\d\d).*senza i monti: alba (\d\d):(\d\d)', res['sole_21_marzo'])
    if m:
        dmin = (int(m.group(1)) * 60 + int(m.group(2))) - (int(m.group(3)) * 60 + int(m.group(4)))
        check(8 <= dmin <= 30, f'21 marzo: alba dietro Poggio Est {dmin} min dopo quella sull\'orizzonte libero')
    else:
        check(False, '21 marzo: alba ritardata dal Poggio Est (' + res['sole_21_marzo'] + ')')
    g = re.search(r'Alba (\d\d:\d\d).*Tramonto (\d\d:\d\d).*senza i monti: alba (\d\d:\d\d), tramonto (\d\d:\d\d)', res['sole_21_giugno'])
    check(bool(g) and g.group(1) == g.group(3), '21 giugno: alba a nord-est libera, uguale a quella sull\'orizzonte libero')
    check(bool(g) and g.group(2) < g.group(4), '21 giugno: tramonto anticipato dal colle di «Collina» a ovest-nord-ovest')
    check(res['al_pulsante'] == 'Allinea col profilo', 'menù Bussola: «Allinea col profilo» col rilievo attivo')
    check(res['al_passo'] == 'ridge' and res['al_linea_px'] > 500, f'linea tratteggiata delle creste disegnata ({res["al_linea_px"]} px)')
    check('−5' in res['al_info'] or '-5' in res['al_info'], 'durante il trascinamento: ' + res['al_info'])
    a = res['al_dopo']
    check(abs(a['off'] + 5) < 0.3 and a['q'] == 2 and a['step'] is None and a['pos'], f'dopo «Combacia: fatto»: correzione {a["off"]:.2f}° (attesa −5), ±{a["q"]}°')
    check(abs(res['al_pinch'] - 60.5) < 0.6, f'due dita: campo visivo {res["al_pinch"]}° (atteso ~60,5)')
    b = res['al_annulla']
    check(abs(b['off'] + 5) < 0.3 and b['q'] == 2 and b['fov'] == fov, f'Annulla rimette tutto com\'era (correzione {b["off"]:.2f}°, campo visivo {b["fov"]}°)')
    check(res['al_pulsante_senza'] == 'Allinea guidato' and res['al_passo_senza'] == 'pick', 'senza rilievo: «Allinea guidato» con luogo o sole')
    check(not res['errors'], 'nessun errore JavaScript')
    print('TUTTO OK' if ok else 'CI SONO PROBLEMI')

main()
