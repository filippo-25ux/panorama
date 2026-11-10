// Orientis – server di passaggio (Cloudflare Worker «orientis-catasto»)
// Versione 3 (v40 della beta):
//   /ping                      → «orientis 3», più « esri» se il segreto ESRI_KEY è impostato
//                                (la beta capisce che il server sa dare i tasselli del catasto, PVGIS e le foto Esri)
//   /catasto?lat=..&lon=..     → foglio e particella del punto (risposta HTML dell'Agenzia delle Entrate)
//   /tile/{z}/{x}/{y}.png      → tassello 256×256 della mappa catastale (immagine 512 px, nitida sugli iPhone),
//                                tenuto in memoria dal server per 30 giorni
//   /pvgis?lat=..&lon=..&…     → calcolo fotovoltaico PVGIS 5.3 (PVcalc, risposta JSON). PVGIS non accetta chiamate
//                                dalle pagine web (CORS) ma sì da un server; si passano solo i parametri ammessi;
//                                risposte tenute in memoria 30 giorni (stessi parametri = stesso risultato)
//   /esri/{z}/{y}/{x}          → foto satellitare Esri World Imagery con la chiave del segreto ESRI_KEY
//                                (ArcGIS Location Platform, privilegio Basemaps, referrer https://orientis-app.github.io)
// Dati: Agenzia delle Entrate, cartografia catastale WMS (CC BY 4.0); PVGIS © Unione europea (JRC), riuso con citazione;
// foto Powered by Esri (Esri, Maxar, Earthstar Geographics, and the GIS User Community).
//
// Segreto da impostare su Cloudflare: Workers → orientis-catasto → Settings → Variables and Secrets → Add →
// tipo «Secret», nome ESRI_KEY, valore = chiave API di ArcGIS. Senza il segreto l'app usa le foto EOX.
const PVGIS = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';
const PV_PARAMS = ['lat', 'lon', 'peakpower', 'loss', 'pvtechchoice', 'mountingplace', 'fixed', 'angle', 'aspect', 'optimalinclination',
  'optimalangles', 'inclined_axis', 'inclined_optimum', 'inclinedaxisangle', 'vertical_axis', 'vertical_optimum', 'verticalaxisangle',
  'twoaxis', 'usehorizon', 'userhorizon', 'raddatabase', 'pvprice', 'systemcost', 'interest', 'lifetime'];
const ESRI = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/';
const APP = 'https://orientis-app.github.io/';
const WMS = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/ping') return new Response('orientis 3' + (env && env.ESRI_KEY ? ' esri' : ''), { headers: { ...CORS, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
      if (url.pathname === '/pvgis') return await pvgis(url, request, ctx);
      const e = url.pathname.match(/^\/esri\/(\d+)\/(\d+)\/(\d+)$/);
      if (e) return await esri(+e[1], +e[2], +e[3], env);
      const t = url.pathname.match(/^\/tile\/(\d+)\/(\d+)\/(\d+)\.png$/);
      if (t) return await tile(+t[1], +t[2], +t[3], request, ctx);
      if (url.pathname === '/catasto' || url.pathname === '/') return await info(url);
      return new Response('non trovato', { status: 404, headers: CORS });
    } catch (e) {
      return new Response('errore: ' + (e && e.message), { status: 502, headers: CORS });
    }
  }
};

// Foglio e particella in un punto (GetFeatureInfo al centro di un riquadro di circa 40 m)
async function info(url) {
  const lat = parseFloat(url.searchParams.get('lat')), lon = parseFloat(url.searchParams.get('lon'));
  if (!isFinite(lat) || !isFinite(lon)) return new Response('servono lat e lon', { status: 400, headers: CORS });
  const d = 0.0002;
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo', SRS: 'EPSG:4258',
    BBOX: [lon - d, lat - d, lon + d, lat + d].map((v) => v.toFixed(7)).join(','),
    WIDTH: '101', HEIGHT: '101', X: '50', Y: '50',
    LAYERS: 'CP.CadastralParcel', QUERY_LAYERS: 'CP.CadastralParcel', STYLES: '',
    FORMAT: 'image/png', INFO_FORMAT: 'text/html', FEATURE_COUNT: '1'
  });
  const r = await fetch(WMS + '?' + q.toString(), { headers: { 'User-Agent': 'Orientis (catasto indicativo)' } });
  return new Response(await r.text(), { status: r.status, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } });
}

// Tassello della mappa: il riquadro del tassello (Web Mercator) espresso in gradi, chiesto all'Agenzia in EPSG:4258
async function tile(z, x, y, request, ctx) {
  if (z < 14 || z > 20) return new Response('zoom non servito', { status: 404, headers: CORS });
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const n = Math.pow(2, z);
  const lon = (xx) => xx / n * 360 - 180;
  const lat = (yy) => Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', SRS: 'EPSG:4258',
    BBOX: [lon(x), lat(y + 1), lon(x + 1), lat(y)].map((v) => v.toFixed(8)).join(','),
    WIDTH: '512', HEIGHT: '512', LAYERS: 'CP.CadastralZoning,CP.CadastralParcel', STYLES: '',
    FORMAT: 'image/png', TRANSPARENT: 'true'
  });
  const r = await fetch(WMS + '?' + q.toString(), { headers: { 'User-Agent': 'Orientis (catasto indicativo)' } });
  const type = r.headers.get('Content-Type') || '';
  if (!r.ok || !type.startsWith('image/')) return new Response('servizio non disponibile', { status: 502, headers: CORS });
  const res = new Response(r.body, { headers: { ...CORS, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=2592000' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// Calcolo fotovoltaico PVGIS: solo i parametri ammessi, con valori numerici o parole note
async function pvgis(url, request, ctx) {
  const q = new URLSearchParams();
  for (const k of PV_PARAMS) {
    const v = url.searchParams.get(k);
    if (v === null || v === '') continue;
    if (!/^[A-Za-z0-9.,\-]{1,1200}$/.test(v)) return new Response('parametro non valido: ' + k, { status: 400, headers: CORS });
    q.set(k, v);
  }
  if (!q.has('lat') || !q.has('lon') || !q.has('peakpower') || !q.has('loss')) return new Response('servono lat, lon, peakpower e loss', { status: 400, headers: CORS });
  q.set('outputformat', 'json');
  const cache = caches.default;
  const key = new Request('https://cache.orientis/pvgis?' + q.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const r = await fetch(PVGIS + '?' + q.toString(), { headers: { 'User-Agent': 'Orientis (stima fotovoltaico)' } });
  const body = await r.text();
  const res = new Response(body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': r.ok ? 'public, max-age=2592000' : 'no-store' } });
  if (r.ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// Foto satellitare Esri: la chiave resta sul server
async function esri(z, y, x, env) {
  if (!env || !env.ESRI_KEY) return new Response('chiave Esri non impostata', { status: 404, headers: CORS });
  if (z > 19) return new Response('zoom non servito', { status: 404, headers: CORS });
  const r = await fetch(ESRI + z + '/' + y + '/' + x + '?token=' + encodeURIComponent(env.ESRI_KEY), { headers: { Referer: APP, 'User-Agent': 'Orientis' } });
  const type = r.headers.get('Content-Type') || '';
  if (!r.ok || !type.startsWith('image/')) return new Response('foto non disponibile', { status: 502, headers: CORS });
  return new Response(r.body, { headers: { ...CORS, 'Content-Type': type, 'Cache-Control': r.headers.get('Cache-Control') || 'public, max-age=86400' } });
}
