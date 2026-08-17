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
  if (ranked[0]?.[0] >= 300 && (!ranked[1] || ranked[0][0] - ranked[1][0] >= 12)) return ranked[0][1];
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
function makeGraph(stops) {
  const nodes = new Map();
  const byName = new Map();
  for (const route of ROUTES) for (const direction of route.directions) {
    direction.stops.forEach((stop, index) => {
      const point = matchOfficial(stop.name, stops);
      if (!point) return;
      const id = `${route.route_id}|${direction.direction_id}|${index}`;
      const node = { id, route, direction, index, stop, point };
      nodes.set(id, node);
      const k = norm(stop.name);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(node);
    });
  }
  return { nodes, byName };
}
function busMinutes(direction, fromIndex, toIndex) {
  if (toIndex <= fromIndex) return Infinity;
  const a = Number(direction.stops[fromIndex].journey_minutes || 0);
  const b = Number(direction.stops[toIndex].journey_minutes || 0);
  return Math.max(1, b - a);
}
function walkMinutes(meters) { return Math.max(1, Math.round(meters / 83)); }
function nearestNodes(point, graph, maxMeters = 1500) {
  return [...graph.nodes.values()]
    .map(n => ({ n, d: distance(point, n.point) }))
    .filter(x => x.d <= maxMeters)
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);
}
function transferNodes(node, graph) {
  const exact = graph.byName.get(norm(node.stop.name)) || [];
  const nearby = [...graph.nodes.values()]
    .map(n => ({ n, d: distance(node.point, n.point) }))
    .filter(x => x.d <= 150)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8)
    .map(x => x.n);
  return [...new Map([...exact, ...nearby].map(n => [n.id, n])).values()];
}

// Routing objective: prefer a logical itinerary with little walking and few changes,
// rather than blindly choosing the fastest bus-only path. This is especially important
// for Wolmar -> C-Care Tamarin, where the practical journey is 123 from Wolmar and then
// a transfer onto line 5 around Junction Flic en Flac before the final walk.
function routeCost(state) {
  // Walking is deliberately expensive: 1 minute walking counts as ~4 minutes of
  // journey cost. A transfer also carries a fixed penalty so needless line changes
  // are not preferred over a clean direct ride with similar walking.
  return state.busMinutes + state.walkMinutes * 4 + state.transfers * 12;
}
function shortestPath(from, to, graph) {
  const starts = nearestNodes(from, graph);
  const targets = nearestNodes(to, graph);
  if (!starts.length || !targets.length) return null;
  const targetIds = new Set(targets.map(x => x.n.id));
  const best = new Map(), prev = new Map(), queue = [];
  for (const s of starts) {
    const walk = walkMinutes(s.d);
    const state = { busMinutes: 0, walkMinutes: walk, transfers: 0 };
    best.set(s.n.id, { ...state, cost: routeCost(state) });
    queue.push([routeCost(state), s.n.id]);
  }
  let targetId = null;
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, id] = queue.shift();
    const cur = best.get(id);
    if (!cur || cost !== cur.cost) continue;
    if (targetIds.has(id)) { targetId = id; break; }
    const node = graph.nodes.get(id);
    if (!node) continue;

    const nextIndex = node.index + 1;
    if (nextIndex < node.direction.stops.length) {
      const nextId = `${node.route.route_id}|${node.direction.direction_id}|${nextIndex}`;
      if (graph.nodes.has(nextId)) {
        const bus = busMinutes(node.direction, node.index, nextIndex);
        const state = { busMinutes: cur.busMinutes + bus, walkMinutes: cur.walkMinutes, transfers: cur.transfers };
        const nd = routeCost(state);
        if (nd < (best.get(nextId)?.cost ?? Infinity)) {
          best.set(nextId, { ...state, cost: nd });
          prev.set(nextId, { from: id, kind: "bus" });
          queue.push([nd, nextId]);
        }
      }
    }

    for (const alt of transferNodes(node, graph)) {
      if (alt.id === id || (alt.route.route_id === node.route.route_id && alt.direction.direction_id === node.direction.direction_id)) continue;
      const walkMeters = distance(node.point, alt.point);
      const walk = walkMinutes(walkMeters);
      const state = { busMinutes: cur.busMinutes, walkMinutes: cur.walkMinutes + walk, transfers: cur.transfers + 1 };
      const nd = routeCost(state);
      if (nd < (best.get(alt.id)?.cost ?? Infinity)) {
        best.set(alt.id, { ...state, cost: nd });
        prev.set(alt.id, { from: id, kind: "transfer", walkMeters });
        queue.push([nd, alt.id]);
      }
    }
  }
  if (!targetId) return null;
  const ids = [];
  let cur = targetId;
  while (cur) { ids.push(cur); cur = prev.get(cur)?.from; }
  ids.reverse();
  const startNode = graph.nodes.get(ids[0]);
  const endNode = graph.nodes.get(ids.at(-1));
  const edges = [];
  for (let i = 1; i < ids.length; i++) edges.push({ from: graph.nodes.get(ids[i - 1]), to: graph.nodes.get(ids[i]), kind: prev.get(ids[i])?.kind, walkMeters: prev.get(ids[i])?.walkMeters || 0 });
  const finalWalk = walkMinutes(distance(endNode.point, to));
  const state = best.get(targetId);
  return {
    ids,
    nodes: ids.map(id => graph.nodes.get(id)),
    edges,
    minutes: state.busMinutes + state.walkMinutes + finalWalk,
    transfers: state.transfers,
    accessMeters: distance(from, startNode.point),
    egressMeters: distance(endNode.point, to)
  };
}
function buildLegs(path) {
  const legs = [];
  let bus = null;
  const flush = () => { if (bus) { legs.push(bus); bus = null; } };
  for (const edge of path.edges) {
    if (edge.kind === "transfer") {
      flush();
      legs.push({ kind: "transfer", minutes: Math.max(1, walkMinutes(edge.walkMeters)), meters: Math.round(edge.walkMeters), from: edge.from.point, to: edge.to.point, from_name: edge.from.stop.name, to_name: edge.to.stop.name });
      continue;
    }
    const routeId = String(edge.from.route.route_id);
    const directionId = Number(edge.from.direction.direction_id);
    if (!bus || bus.route_id !== routeId || bus.direction_id !== directionId) {
      flush();
      bus = { kind: "bus", route_id: routeId, direction_id: directionId, minutes: 0, stops: [] };
    }
    if (!bus.stops.length) bus.stops.push({ name: edge.from.stop.name, lat: edge.from.point.lat, lon: edge.from.point.lon });
    bus.stops.push({ name: edge.to.stop.name, lat: edge.to.point.lat, lon: edge.to.point.lon });
    bus.minutes += busMinutes(edge.from.direction, edge.from.index, edge.to.index);
  }
  flush();
  return legs;
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
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: cors({ "Content-Type": "application/json" }) }); }

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "segamap-routing", routes: ROUTES.map(r => r.route_id) });
    if (url.pathname !== "/api/route") return new Response("SegaMap routing API", { headers: cors({ "Content-Type": "text/plain" }) });
    try {
      const body = request.method === "POST" ? await request.json() : Object.fromEntries(url.searchParams);
      const from = body.from?.lat ? body.from : (body.fromLat ? { lat: Number(body.fromLat), lon: Number(body.fromLon), name: body.from } : await geocode(body.from));
      const to = body.to?.lat ? body.to : (body.toLat ? { lat: Number(body.toLat), lon: Number(body.toLon), name: body.to } : await geocode(body.to));
      if (!Number.isFinite(Number(from.lat)) || !Number.isFinite(Number(from.lon)) || !Number.isFinite(Number(to.lat)) || !Number.isFinite(Number(to.lon))) throw new Error("Invalid origin or destination coordinates");
      const stops = await officialStops();
      const graph = makeGraph(stops);
      if (graph.nodes.size < 20) throw new Error(`Transit graph has too few matched stops (${graph.nodes.size}); official stop matching failed`);
      const path = shortestPath(from, to, graph);
      if (!path) return json({ ok: false, error: "No bus itinerary found in the western network", from, to }, 404);
      const legs = buildLegs(path);
      const access = { kind: "walk", minutes: walkMinutes(path.accessMeters), meters: Math.round(path.accessMeters), from, to: path.nodes[0].point };
      const egress = { kind: "walk", minutes: walkMinutes(path.egressMeters), meters: Math.round(path.egressMeters), from: path.nodes.at(-1).point, to };
      const geometry = await roadGeometry([from, ...path.nodes.map(n => n.point), to]);
      return json({ ok: true, network: "west", approximate: true, note: "Itinerary prioritizes low walking and few transfers; timetable travel times are published schedule values and live vehicle positions are not included.", minutes: path.minutes, transfers: path.transfers, from, to, legs: [access, ...legs, egress], geometry });
    } catch (e) {
      return json({ ok: false, error: e?.message || "Routing error" }, 500);
    }
  }
};