// Pure helpers for picking a Timeline start date when a project has no
// configured `start` in TIMELINE_PROJECT_CONFIG.
//
// The old fallback was "today minus 60 days", which hid every hex first seen
// before that (and, with the baseline off, made the final frame far sparser
// than the total coverage map). Instead we begin at the earliest first-seen
// hex that sits inside the project's framed view, using the timeline data the
// frontend has already fetched — no extra request.
//
// Framework-free (no React, no MapLibre, no h3-js import) so it runs under
// plain `node --test`; the caller passes the hex-center function in.

// MapLibre's world is 512 px wide at zoom 0.
const TILE_SIZE = 512;
const MAX_MERCATOR_LAT = 85.051129;

function lngToX(lng, worldSize) {
    return ((lng + 180) / 360) * worldSize;
}

function latToY(lat, worldSize) {
    const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
    const rad = (clamped * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2) * worldSize;
}

function xToLng(x, worldSize) {
    return (x / worldSize) * 360 - 180;
}

function yToLat(y, worldSize) {
    const n = Math.PI * (1 - (2 * y) / worldSize);
    return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

// The geographic box visible when the map is centred on { lat, lng } at `zoom`
// in a `width` x `height` px canvas (Web Mercator, no pitch/bearing — the
// timeline launch always frames flat). Returns { west, south, east, north },
// or null when any input is unusable. `west` may exceed `east` only if the
// view straddles the antimeridian, which `boundsContain` handles.
export function viewBounds({ lat, lng, zoom }, width, height) {
    if (![lat, lng, zoom, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;
    const worldSize = TILE_SIZE * Math.pow(2, zoom);
    const cx = lngToX(lng, worldSize);
    const cy = latToY(lat, worldSize);
    const halfW = width / 2;
    const halfH = height / 2;
    // A view wider than the world covers every longitude.
    const spansWorld = width >= worldSize;
    const wrap = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
    return {
        west: spansWorld ? -180 : wrap(xToLng(cx - halfW, worldSize)),
        east: spansWorld ? 180 : wrap(xToLng(cx + halfW, worldSize)),
        north: yToLat(Math.max(0, cy - halfH), worldSize),
        south: yToLat(Math.min(worldSize, cy + halfH), worldSize),
    };
}

export function boundsContain(bounds, lat, lng) {
    if (!bounds || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat < bounds.south || lat > bounds.north) return false;
    if (bounds.west <= bounds.east) return lng >= bounds.west && lng <= bounds.east;
    // Antimeridian-straddling box.
    return lng >= bounds.west || lng <= bounds.east;
}

// Earliest `first_seen` (epoch-ms) among timeline features whose hex centre
// lies inside `bounds`, or null when none do. `centerOf(id)` returns the hex
// centre as [lat, lng] (h3-js `h3ToGeo` in the app).
export function earliestFirstSeenInBounds(features, bounds, centerOf) {
    if (!bounds || !Array.isArray(features)) return null;
    let min = null;
    for (const f of features) {
        const p = f && f.properties;
        const t = p && p.first_seen;
        if (typeof t !== 'number') continue;
        if (min !== null && t >= min) continue;
        const id = p.id != null ? p.id : f.id;
        if (id == null) continue;
        let center;
        try { center = centerOf(id); } catch (_) { continue; }
        if (!center) continue;
        if (boundsContain(bounds, center[0], center[1])) min = t;
    }
    return min;
}

// Resolve the start of a Timeline launch whose project has no configured start
// (and whose deep-link, if any, carried no `start`). Begins at the local day of
// the earliest first-seen hex inside the project's framed view; falls back to
// `lookbackMs` before `now` when the view holds no timeline hexes. Either way,
// a start at or after `end` is pulled back to `lookbackMs` before `end`, so the
// window is never empty.
//
//   features   timeline FeatureCollection features ({ properties: { id, first_seen } })
//   view       { lat, lng, zoom } the launch frames
//   width/height  map canvas size in px
//   startOfDay epoch-ms -> local midnight (TimelineControl's startOfLocalDay)
export function resolveAutoStart({ features, view, width, height, end, now, lookbackMs, centerOf, startOfDay }) {
    const bounds = viewBounds(view || {}, width, height);
    const earliest = earliestFirstSeenInBounds(features, bounds, centerOf);
    let start = startOfDay(earliest != null ? earliest : now - lookbackMs);
    if (Number.isFinite(end) && start >= end) start = startOfDay(end - lookbackMs);
    return start;
}
