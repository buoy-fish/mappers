// Which coverage a hex or gateway belongs to on the map (ADR-0035 gateway
// profiles). Permanent coverage is the default map; mobile coverage is opt-in
// ("Include mobile coverage") because it moves and can't be relied on, and once
// included it draws exactly like the rest of coverage; bench coverage is shown
// nowhere. Pure, so it is unit-tested under node:test
// (assets/test/coverageClass.test.mjs).

/**
 * Where a live `h3:new` hex goes: 'permanent' (the default layer), 'mobile'
 * (the opt-in layer, only when mobile coverage is included) or 'drop'.
 * `permanent`/`mobile` are server flags; a missing `permanent` (older server)
 * means permanent, the fail-open default.
 */
export function liveHexLayer(body, includeMobile) {
    if (body?.permanent !== false) return 'permanent';
    if (body.mobile === true && includeMobile) return 'mobile';
    return 'drop';
}

/**
 * Whether a gateway from /api/v1/gateways gets a marker: permanent installs
 * with a position. A missing location_phase (older app API) means permanent;
 * mobile gateways have no fixed position and never get one.
 */
export function showsGatewayMarker(gw) {
    if (!gw || gw.mobile === true) return false;
    if (gw.lat == null || gw.lng == null) return false;
    return (gw.location_phase ?? 'permanent') === 'permanent';
}

/**
 * Union of two hex feature lists as a FeatureCollection, one feature per hex
 * id (later wins). Repeat uplinks from a mobile gateway would otherwise stack
 * translucent copies of the same hex; also merges the lazy scope=mobile fetch
 * with live hexes that landed while it was in flight.
 */
export function mergeHexFeatures(a, b) {
    const byId = {};
    for (const f of [...(a || []), ...(b || [])]) byId[f.id] = f;
    return { type: 'FeatureCollection', features: Object.values(byId) };
}

/**
 * The FeatureCollection the coverage source draws: permanent coverage, plus
 * mobile coverage when included. Mobile hexes join the same source, so they
 * take the same RSSI colors, hover and selection.
 */
export function coverageFeatures(base, mobile, includeMobile) {
    if (!includeMobile) return base;
    return mergeHexFeatures(base?.features, mobile?.features);
}
