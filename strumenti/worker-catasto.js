// Orientis – server di passaggio per il catasto (Cloudflare Worker «orientis-catasto»)
// Versione 2 (v31 della beta):
//   /ping                      → «orientis 2» (la beta capisce che il server sa dare i tasselli)
//   /catasto?lat=..&lon=..     → foglio e particella del punto (risposta HTML dell'Agenzia delle Entrate)
//   /tile/{z}/{x}/{y}.png      → tassello 256×256 della mappa catastale (immagine 512 px, nitida sugli iPhone),
//                                tenuto in memoria dal server per 30 giorni
// Dati: Agenzia delle Entrate, cartografia catastale WMS (CC BY 4.0).
const WMS = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/ping') return new Response('orientis 2', { headers: { ...CORS, 'Content-Type': 'text/plain' } });
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
