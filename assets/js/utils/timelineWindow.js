// Where a timeline replay starts when nothing configures it (no start in the
// project's timeline settings, no `start=` in the link): the earliest
// first_seen among the hexes in view, so the replay shows the project's whole
// build-up instead of opening on a pre-filled map.
//
// Framework-free so it's unit-testable from plain Node.
//
// Ceilings:
//   - A plain MIN, so one stray early hex in view drags the start back to it.
//     Upgrade path: a low percentile (e.g. the 1st) of in-view first_seen.
//   - "In view" is the whole map canvas, including any part an overlay (the
//     info pane, the scrubber) covers. Upgrade path: inset the bounds by the
//     map's padding / the pane's width.

// MapLibre's getBounds() doesn't wrap longitude: a view across the
// antimeridian reads e.g. west 177, east 182. Measure the hex's offset east of
// `west` modulo 360 and compare it with the view's span, which handles that,
// the already-wrapped form (west > east), and views wider than the world.
function lngInRange(lng, west, east) {
    let span = east - west;
    if (span < 0) span += 360;
    if (span >= 360) return true;
    const offset = (((lng - west) % 360) + 360) % 360;
    return offset <= span;
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
        if (!p || typeof p.first_seen !== 'number') continue;
        if (p.lat < south || p.lat > north || !lngInRange(p.lng, west, east)) continue;
        if (min === null || p.first_seen < min) min = p.first_seen;
    }
    return min;
}
