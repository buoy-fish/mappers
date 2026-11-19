// Where a timeline replay starts when nothing configures it (no start in the
// project's timeline settings, no `start=` in the link): the earliest
// first_seen among the hexes in view, so the replay shows the project's whole
// build-up instead of opening on a pre-filled map.
//
// Framework-free so it's unit-testable from plain Node.
//
// Ceiling: a plain MIN, so one stray early hex in view drags the start back to
// it. Upgrade path if that bites: a low percentile (e.g. the 1st) of the
// in-view first_seen values.

function lngInRange(lng, west, east) {
    // west > east means the view crosses the antimeridian.
    return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
}

// features: GeoJSON features whose properties carry { lat, lng, first_seen }
// (the hex centre and its epoch-ms first-seen). bounds: { west, south, east,
// north } in degrees. Returns the earliest in-view first_seen, or null when
// no hex is in view (or bounds are missing).
export function firstSeenInBounds(features, bounds) {
    if (!bounds || !features) return null;
    const { west, south, east, north } = bounds;
    let min = null;
    for (const f of features) {
        const p = f && f.properties;
        if (!p) continue;
        if (p.lat < south || p.lat > north || !lngInRange(p.lng, west, east)) continue;
        if (min === null || p.first_seen < min) min = p.first_seen;
    }
    return min;
}
