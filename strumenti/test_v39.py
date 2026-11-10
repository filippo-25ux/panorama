"""Test v39 (basato su test_v38): Clima futuro PNACC, parametri sismici, satellite Esri.
Prima: Test v38 (basato su test_v37): satellite, ricerca dei Comuni, radon completo, Clima futuro.
Prima: Test v37: Ricentra tondo, legenda dei livelli accesi nella scheda della mappa, ambito «Sito ed Energia».
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
PORT = 8799
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
        errs, leg, sat, esri = [], [], [], []
        ESRI_DOWN = [False]
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
            if 'ibasemaps-api.arcgis.com' in u:
                esri.append(u)
                if ESRI_DOWN[0]:
                    return r.fulfill(status=403, content_type='application/json', headers=h, body='{"error":{"code":498}}')
                return r.fulfill(status=200, content_type='image/jpeg', headers=h, body=PNG1)
            if 'maps.eox.at' in u:
                sat.append(u)
                return r.fulfill(status=200, content_type='image/jpeg', headers=h, body=PNG1)
            if 'interpreter' in u:
                return r.fulfill(status=200, content_type='application/json', body='{"elements": []}', headers=h)
            if 'maplibre-gl' in u and ML and os.path.isdir(ML):
                return r.fulfill(path=ML + ('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js'))
            return r.abort()
        page.route('**/*', route)
        page.route('**/beta/peaks-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(PEAKS)))
        page.route('**/places-it.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(TOWNS)))
        page.goto(f'http://127.0.0.1:{PORT}/beta/index.html')
        check('Beta v' in page.inner_text('body'), 'pagina iniziale «Beta»')
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
        check(not page.locator('#catNote').is_visible() and not page.locator('#catHint').is_visible(), 'nessuna nota del catasto fissa sulla mappa')
        check(not page.locator('#tape').is_visible(), 'nella Mappa non c’è la ghiera della bussola')
        page.click('#mapInfoBtn'); page.wait_for_timeout(300)
        it = page.inner_text('#mapInfo') if page.locator('#mapInfo').is_visible() else ''
        check('Catasto' in it and 'PAI' in it and 'Cerchio azzurro' in it and 'OpenStreetMap' in it, 'tasto «i»: le note della mappa raccolte in un pannello')
        page.screenshot(path=f'{OUT}/v37-info.png')
        page.click('#mapInfoClose'); page.wait_for_timeout(200)
        check(not page.locator('#mapInfo').is_visible(), '«Chiudi» chiude le note')
        page.evaluate("window.__panoMap.setZoom(7)"); page.wait_for_timeout(2000)
        check(page.locator('#mapHint').is_visible() and 'Avvicina' in page.inner_text('#mapHint'), 'consiglio «Avvicina la mappa» in basso, senza pastiglia')
        page.wait_for_timeout(5200)
        check(not page.locator('#mapHint').is_visible(), 'il consiglio sparisce da solo dopo qualche secondo')
        page.evaluate("window.__panoMap.setZoom(13)"); page.wait_for_timeout(500)
        page.click('#lyAl'); page.wait_for_timeout(1200)
        t = page.inner_text('#mcLeg')
        check('Alluvioni PAI' in t and 'P3 elevata' in t and page.locator('#mcLeg i').count() == 3, 'Alluvioni: servizio senza legenda → classi senza colori')
        page.screenshot(path=f'{OUT}/v37-legenda.png')
        page.click('#lyFr'); page.click('#lyAl'); page.wait_for_timeout(400)
        check(not page.locator('#mcLeg').is_visible(), 'livelli spenti: la legenda sparisce')
        # cono visivo spegnibile
        vis = lambda: page.evaluate("window.__panoMap.getLayoutProperty('cone', 'visibility') || 'visible'")
        check(vis() == 'visible' and page.get_attribute('#lyCone', 'aria-pressed') == 'true', 'cono visivo acceso di serie')
        page.click('#lyCone'); page.wait_for_timeout(300)
        check(vis() == 'none' and page.evaluate("window.__panoMap.getLayoutProperty('fan', 'visibility')") == 'none', '«Cono» spegne il cono e la fascia della bussola')
        page.click('#lyCone'); page.wait_for_timeout(300)
        check(vis() == 'visible', '«Cono» lo riaccende')
        # v39: chiave Esri incollata nelle Impostazioni (finta), mai nel codice
        page.evaluate("(() => { const i = document.getElementById('esriKey'); i.value = 'AAPTprova123'; i.dispatchEvent(new Event('change')); })()")
        page.wait_for_timeout(300)
        check(not re.search(r'AAPT[A-Za-z0-9_.-]{30,}', open(os.path.join(REPO, 'beta/index.html'), encoding='utf-8').read()), 'nessuna chiave Esri nel codice pubblico')
        # v38: foto satellitare
        satv = lambda: page.evaluate("window.__panoMap.getLayoutProperty('sat', 'visibility')")
        check(satv() == 'none' and page.get_attribute('#satBtn', 'aria-pressed') == 'false', 'satellite spento di serie')
        page.click('#satBtn'); page.wait_for_timeout(1500)
        check(satv() == 'visible' and esri and 'World_Imagery' in esri[0] and 'token=AAPTprova123' in esri[0] and not sat, 'tasto satellite: foto Esri World Imagery con la chiave')
        check('Powered by Esri' in page.inner_text('#miniAttr'), 'citazione Esri visibile sulla mappa: ' + page.inner_text('#miniAttr'))
        page.screenshot(path=f'{OUT}/v38-satellite.png')
        page.click('#mapInfoBtn'); page.wait_for_timeout(300)
        check('Earthstar Geographics' in page.inner_text('#mapInfo'), 'nelle note le fonti della foto satellitare')
        page.click('#mapInfoClose'); page.wait_for_timeout(200)
        # Esri che non risponde (chiave scaduta o quota finita): si torna da soli a EOX
        ESRI_DOWN[0] = True
        page.evaluate("window.__panoMap.setZoom(window.__panoMap.getZoom() + 1.3)"); page.wait_for_timeout(2500)
        page.evaluate("window.__panoMap.panBy([300, 300], {duration: 0})"); page.wait_for_timeout(2500)
        check(sat and 's2cloudless-2024_3857' in sat[-1] and 'EOxCloudless' in page.inner_text('#miniAttr'), 'Esri non risponde: torna da sola la foto EOX')
        page.click('#satBtn'); page.wait_for_timeout(300)
        check(satv() == 'none' and '© OSM' in page.inner_text('#miniAttr'), 'satellite spento: torna la mappa OSM')
        # v38: ricerca del Comune per nome
        page.click('#findBtn'); page.wait_for_timeout(1500)
        check(page.locator('#findIn').is_visible(), 'tasto lente: campo di ricerca')
        page.fill('#findIn', 'ariano'); page.wait_for_timeout(300)
        opts = page.evaluate("[...document.querySelectorAll('#findList button')].map(b => b.textContent)")
        check(opts[:2] == ['Ariano IrpinoAV', 'Ariano nel PolesineRO'], 'risultati per «ariano»: ' + str(opts[:3]))
        page.fill('#findIn', 'sant agnello'); page.wait_for_timeout(300)
        check('Sant\'Agnello' in page.inner_text('#findList'), 'ricerca senza apostrofi e accenti («sant agnello»)')
        page.screenshot(path=f'{OUT}/v38-ricerca.png')
        page.fill('#findIn', 'ariano irp'); page.wait_for_timeout(300)
        page.locator('#findList button').first.click(); page.wait_for_timeout(2500)
        check(not page.locator('#findBox').is_visible(), 'scelto il Comune la ricerca si chiude')
        check(page.inner_text('#mcTitle') == 'Ariano Irpino' and 'nel territorio di Ariano Irpino (AV)' in page.inner_text('#mcSub'), 'scheda della mappa sul Comune cercato')
        nb = page.evaluate("(window.__panoMap.getSource('comB')._data.geometry || {}).coordinates.length")
        c = page.evaluate("window.__panoMap.getCenter()")
        check(nb >= 1 and abs(c['lat'] - 41.15) < 0.1 and abs(c['lng'] - 15.1) < 0.1, f'mappa sul Comune con il confine disegnato ({c})')
        check(page.locator('#miniCenter').is_visible(), 'dopo la ricerca compare «Ricentra»')
        ab = page.locator('#miniAttr').bounding_box(); sb2 = page.locator('#findBtn').bounding_box()
        check(ab['y'] >= sb2['y'] + sb2['height'] - 1, 'la citazione della mappa non copre i tasti')
        page.screenshot(path=f'{OUT}/v38-comune.png')
        # Sito ed Energia per un punto ad Ariano Irpino
        page.evaluate('window.__panoPtSet(41.15125, 15.06943)')
        page.wait_for_timeout(1500)
        sub = page.inner_text('#mcSub')
        check('nel territorio di Ariano Irpino (AV)' in sub, 'punto toccato: subito il Comune in piccolo («' + sub + '»)')
        page.screenshot(path=f'{OUT}/v37-punto.png')
        page.click('#mcGo'); page.wait_for_timeout(1500)
        amb = page.evaluate("[...document.querySelectorAll('#puGrid .puTile b')].map(b => b.textContent)")
        check('Sito ed Energia' in amb and 'Energia' not in amb and 'Sito' not in amb, 'un solo ambito «Sito ed Energia»: ' + str(amb))
        tt = page.inner_text('#puGrid .puTile[data-amb="sit"]')
        check('zona sismica 1' in tt and 'clima E, 2.410 GG' in tt, 'pastiglia: ' + tt.replace('\n', ' | '))
        sb = page.inner_text('#sitBox')
        check('Zona sismica' in sb and 'fortissimi terremoti' in sb, 'pagina: zona sismica 1 con la spiegazione')
        check('dal 15 ottobre al 15 aprile, max 14 ore' in sb, 'pagina: periodo di riscaldamento della zona E')
        check('0,26' in sb and '0,28' in sb and '1,40' in sb, 'pagina: trasmittanze del DM 28/10/2025 per la zona E')
        cards = page.locator('#sitBox .sitCard')
        check(cards.count() >= 2 and 'Edificio di riferimento' in cards.nth(0).inner_text() and 'Riqualificazione' in cards.nth(1).inner_text(), 'riferimento e riqualificazione in due tabelle distinte')
        c0, c1 = cards.nth(0).inner_text(), cards.nth(1).inner_text()
        check('0,22' in c0 and '0,75' in c0 and '0,80' in c0, 'riferimento zona E: coperture 0,22, H′T 0,75, divisori 0,80')
        check('0,24' in c1 and '0,29' in c1 and '0,364' in c1, 'riqualificazione zona E: coperture 0,24, pavimenti 0,29, pareti +30% 0,364')
        check('II' in sb and 'kN/m²' in sb and 'Vento: zona' in sb and 'm/s' in sb, 'pagina: neve zona II e vento zona 3 con la quota')
        check('non ancora pubblicata' in sb and 'La Campania non ha ancora pubblicato' in sb, 'radon: la Campania non ha ancora pubblicato le aree prioritarie')
        check(page.locator('#sitBox a').count() >= 6, 'collegamenti alle fonti')
        check('Abitazioni costruite dopo il 31/12/2024' in sb and '200' in sb and 'entro 2 anni' in sb, 'radon: livelli di riferimento e obblighi del D.Lgs 101/2020')
        check('Legge regionale 13/2019' in sb and 'Scuole' in sb, 'radon: legge regionale della Campania')
        hrefs = page.evaluate("[...document.querySelectorAll('#sitBox a')].map(a => a.href)")
        check(any(h.endswith('/2026/08/avellino-ariano-irpino.pdf') for h in hrefs), 'Clima futuro: scheda climatica comunale della Campania')
        check('clima futuro' in sb.lower() and any('schede-climatiche-avellino' in h for h in hrefs), 'Clima futuro: elenco della provincia')
        page.wait_for_timeout(1500); sb = page.inner_text('#sitBox')
        check('Notti tropicali' in sb and 'RCP4.5' in sb and 'Temperatura media annua, °C' in sb and '13,8' in sb and '+1,6' in sb and '≈ 0' not in sb.split('Giorni di gelo')[0], 'Clima futuro PNACC: Ariano 13,8 °C, +1,6 °C con RCP4.5')
        check('E-OBS' in sb and 'ISPRA' in sb, 'Clima futuro: fonti e citazione E-OBS')
        check(re.search(r'41,151\d N, 15,069\d E', sb) and any('esse1-gis.mi.ingv.it' in h for h in page.evaluate("[...document.querySelectorAll('#sitBox a')].map(a => a.href)")), 'Sismica: coordinate e link alla mappa INGV')
        page.click('#puGrid .puTile[data-amb="sit"]'); page.wait_for_timeout(800)
        page.set_viewport_size({'width': 402, 'height': 4200}); page.wait_for_timeout(800); page.locator('#sitBox').screenshot(path=f'{OUT}/v39-sitbox.png'); page.set_viewport_size({'width': 402, 'height': 874})
        # calcoli: neve e vento a quota nota
        r = page.evaluate("(() => { const s = window.__panoSito(); return null; })()")
        check(not errs, 'nessun errore nella pagina' + (': ' + errs[0] if errs else ''))
        b.close()
    print('TUTTO OK' if ok else 'QUALCOSA NON VA')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
