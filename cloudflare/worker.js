import route5 from "../data/transit/route-5.json";
import route57 from "../data/transit/route-57.json";
import route57a from "../data/transit/route-57a.json";
import route119 from "../data/transit/route-119.json";
import route123 from "../data/transit/route-123.json";

const ROUTES = [route5, route57, route57a, route119, route123];
const STOPS_URL = "https://data.govmu.org/dataset/2ba9ca15-d2d4-415e-9b37-3148511da1b9/resource/11e30efe-7fb9-41bb-a718-a3f0a5525dd7/download/busstops.csv";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/driving";
let stopCache = null;

function norm(v = "") {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(v) { return new Set(norm(v).split(" ").filter(Boolean)); }
function score(a, b) {
  const aa = norm(a), bb = norm(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1000;
  const A = tokens(aa), B = tokens(bb);
  const inter = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  let s = union ? 500 * inter / union : 0;
  if (aa.includes(bb) || bb.includes(aa)) s += 120;
  return s;
}
function distance(a, b) {
  const p = Math.PI / 180;
  const x = (b.lon - a.lon) * p * Math.cos((a.lat + b.lat) * p / 2);
  const y = (b.lat - a.lat) * p;
  return 6371000 * Math.sqrt(x * x + y * y);
}
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = "";
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(norm);
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()])));
}
async function officialStops() {
  if (stopCache) return stopCache;
  const r = await fetch(STOPS_URL, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) throw new Error(`Official bus-stop feed returned ${r.status}`);
  const rows = parseCsv(await r.text());
  stopCache = rows.map((r, i) => {
    const lat = Number(r.latitude || r.lat || r.y);
    const lon = Number(r.longitude || r.lon || r.lng || r.long || r.x);
    const name = r.stop_name || r.name || r.bus_stop_name || r.description || r.label || r.title || "";
    return Number.isFinite(lat) && Number.isFinite(lon) && lat > -21.5 && lat < -19 && lon > 56 && lon < 59.5
      ? { id: r.stop_id || r.id || r.fid || r.objectid || `MDPA-${i + 1}`, name, n: norm(name), lat, lon } : null;
  }).filter(Boolean);
  if (!stopCache.length) throw new Error("No usable official bus-stop coordinates found");
  return stopCache;
}
function matchOfficial(name, stops) {
  const ranked = stops.map(s => [score(name, s.name), s]).sort((a, b) => b[0] - a[0]);
  if (ranked[0]?.[0] >= 1000) return ranked[0][1];
  if (ranked[0]?.[0] >= 420 && (!ranked[1] || ranked[0][0] - ranked[1][0] >= 20)) return ranked[0][1];
  return null;
}
async function geocode(q) {
  const u = new URL(NOMINATIM);
  u.searchParams.set("q", `${q}, Mauritius`);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("limit", "1");
  const r = await fetch(u, { headers: { "User-Agent": "SegaMap/1.0 routing service" }, cf: { cacheTtl: 86400 } });
  if (!r.ok) throw new Error(`Geocoding failed: ${r.status}`);
  const data = await r.json();
  if (!data[0]) throw new Error(`Could not locate ${q}`);
  return { lat: Number(data[0].lat), lon: Number(data[0].lon), name: data[0].display_name };
}
function routeStops() {
  const out = new Map();
  for (const route of ROUTES) for (const d of route.directions) for (const s of d.stops) {
    const key = norm(s.name);
    if (!out.has(key)) out.set(key, { key, name: s.name, routes: [] });
    out.get(key).routes.push({ route, direction: d, stop: s });
  }
  return out;
}
function nextDeparture(direction, stopIndex, arrivalMinutes) {
  const service = direction.service.weekdays;
  const freq = direction.frequency_weekdays;
  const base = freq?.length ? freq : [{ from: service.first, to: service.last, minutes: 30 }];
  let best = Infinity;
  for (const p of base) {
    let t = toMinutes(p.from) + Number(direction.stops[stopIndex].journey_minutes || 0);
    const end = toMinutes(p.to) + Number(direction.stops[stopIndex].journey_minutes || 0);
    while (t <= end) { if (t >= arrivalMinutes) { best = Math.min(best, t); break; } t += Number(p.minutes); }
  }
  return best;
}
function toMinutes(h) { const [a, b] = String(h).split(":").map(Number); return a * 60 + b; }
function dijkstra(startKeys, targetKeys) {
  const graph = routeStops();
  const dist = new Map(), prev = new Map(), pq = [];
  for (const k of startKeys) { dist.set(k, 0); pq.push([0, k]); }
  const seen = new Set();
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [cost, key] = pq.shift();
    if (seen.has(key)) continue; seen.add(key);
    if (targetKeys.has(key)) {
      const path = []; let cur = key;
      while (cur) { path.push(cur); cur = prev.get(cur)?.from; }
      path.reverse(); return { path, minutes: cost };
    }
    const entries = graph.get(key)?.routes || [];
    for (const e of entries) {
      const i = e.direction.stops.findIndex(s => norm(s.name) === key);
      if (i < 0 || i >= e.direction.stops.length - 1) continue;
      const next = e.direction.stops[i + 1];
      const nk = norm(next.name);
      const ride = Math.max(1, Number(next.journey_minutes || 0) - Number(e.direction.stops[i].journey_minutes || 0));
      const wait = cost === 0 ? 0 : 0;
      const nd = cost + wait + ride;
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, { from: key, route: e.route.route_id, direction: e.direction.direction_id }); pq.push([nd, nk]); }
    }
    // Transfers: same physical/official stop name can board any route at zero transfer cost.
    for (const e of entries) {
      const current = norm(e.stop.name);
      if (current === key) {
        for (const alt of e.direction.stops) {
          if (norm(alt.name) === key) continue;
        }
      }
    }
  }
  return null;
}
async function roadGeometry(points) {
  if (points.length < 2) return { type: "LineString", coordinates: points.map(p => [p.lon, p.lat]) };
  const coords = points.map(p => `${p.lon},${p.lat}`).join(";");
  const u = `${OSRM}/${coords}?overview=full&geometries=geojson&steps=false`;
  const r = await fetch(u, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) throw new Error(`Road routing failed: ${r.status}`);
  const j = await r.json();
  if (j.code !== "Ok" || !j.routes?.[0]) throw new Error("No road route found");
  return j.routes[0].geometry;
}
function cors(h = {}) { return { ...h, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" }; }

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response(JSON.stringify({ ok: true, service: "segamap-routing", routes: ROUTES.map(r => r.route_id) }), { headers: cors({ "Content-Type": "application/json" }) });
    if (url.pathname !== "/api/route") return new Response("SegaMap routing API", { headers: cors({ "Content-Type": "text/plain" }) });
    try {
      const body = request.method === "POST" ? await request.json() : Object.fromEntries(url.searchParams);
      const from = body.from?.lat ? body.from : (body.fromLat ? { lat: Number(body.fromLat), lon: Number(body.fromLon), name: body.from } : await geocode(body.from));
      const to = body.to?.lat ? body.to : (body.toLat ? { lat: Number(body.toLat), lon: Number(body.toLon), name: body.to } : await geocode(body.to));
      const stops = await officialStops();
      const routeMap = routeStops();
      const candidates = [...routeMap.values()].map(s => ({ ...s, point: matchOfficial(s.name, stops) })).filter(s => s.point);
      const nearest = p => candidates.map(s => ({ ...s, d: distance(p, s.point) })).sort((a, b) => a.d - b.d).slice(0, 6);
      const starts = nearest(from), targets = nearest(to);
      const targetKeys = new Set(targets.map(x => x.key));
      const result = dijkstra(starts.map(x => x.key), targetKeys);
      if (!result) return new Response(JSON.stringify({ ok: false, error: "No bus itinerary found in the western network", from, to, nearestFrom: starts.slice(0, 3).map(x => x.name), nearestTo: targets.slice(0, 3).map(x => x.name) }), { status: 404, headers: cors({ "Content-Type": "application/json" }) });
      const pathStops = result.path.map(k => candidates.find(s => s.key === k)).filter(Boolean);
      const geometry = await roadGeometry([from, ...pathStops.map(s => s.point), to]);
      return new Response(JSON.stringify({ ok: true, network: "west", minutes: result.minutes, from, to, stops: pathStops.map(s => ({ name: s.name, lat: s.point.lat, lon: s.point.lon })), geometry }), { headers: cors({ "Content-Type": "application/json" }) });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e?.message || "Routing error" }), { status: 500, headers: cors({ "Content-Type": "application/json" }) });
    }
  }
};
