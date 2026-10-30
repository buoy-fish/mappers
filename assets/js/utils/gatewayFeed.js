// Pure shaping of the /api/v1/gateways response, applied on page load and on
// every refresh after it (assets/test/gatewayFeed.test.mjs).

// GeoJSON features for the marker layer. Markers show only PERMANENT
// installations. A missing location_phase (older app.buoy.fish API) means
// permanent — fail-open keeps the map at status quo across the deploy gap.
export function gatewayFeatures(data) {
    return (data.gateways || [])
        .filter(gw => (gw.location_phase ?? "permanent") === "permanent")
        .map(gw => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [gw.lng, gw.lat]
            },
            properties: {
                gateway_eui: gw.gateway_eui,
                name: gw.hotspot_name || gw.gateway_eui,
                last_heard: gw.last_heard ?? null,
                installed_at: gw.installed_at ?? null,
                role: gw.role ?? null,
                description: gw.description ?? null,
                altitude: gw.altitude ?? null,
                concentrator_ids: gw.concentrator_ids || [],
                location_phase: gw.location_phase ?? "permanent"
            }
        }));
}

// Inventory records under every identifier a gateway can be heard by: hardware
// EUI plus each concentrator (slot) GWID. The packet forwarder always emits a
// slot GWID in rxInfo.gatewayId, never the hardware EUI, so the concentrator
// IDs are what actually land in uplinks_heard.gateway_id at ingest time.
// Indexing the full record (not just the name) lets the InfoPane show both the
// hardware EUI and the concentrator that heard each hop. UNFILTERED, unlike the
// markers: hex-detail tables must resolve names for every gateway that ever
// heard an uplink, bench/mobile included.
export function gatewayRecordsIndex(data) {
    const records = {};
    (data.gateways || []).forEach(gw => {
        if (!gw.hotspot_name) return;
        const record = {
            name: gw.hotspot_name,
            gateway_eui: gw.gateway_eui,
            concentrator_ids: gw.concentrator_ids || [],
        };
        if (gw.gateway_eui) records[gw.gateway_eui] = record;
        (gw.concentrator_ids || []).forEach(cid => {
            if (cid) records[cid] = record;
        });
    });
    return records;
}

// An open popup holds a copy of its feature's properties, so a refresh has to
// hand it the new ones, keeping any newer time a gateway_heard message brought in
// while the load ran. A gateway gone from the refresh closes its popup, since
// nothing could update that time again. An EUI-less popup can't be matched, so it
// stays. So does the popup's position if the gateway lost its coordinates: a null
// position would crash the map.
export function refreshPopupGw(popup, features) {
    if (!popup || !popup.gw.gateway_eui) return popup;
    const match = features.find(f => f.properties.gateway_eui === popup.gw.gateway_eui);
    if (!match) return null;
    const [lng, lat] = match.geometry.coordinates;
    const gw = withHeard(match.properties, [{ gateway_eui: popup.gw.gateway_eui, last_heard: popup.gw.last_heard }]);
    return lng == null || lat == null ? { ...popup, gw } : { ...popup, lng, lat, gw };
}

// The gateway's properties with the time from a gateway_heard message
// ([{ gateway_eui, last_heard }]), or the same object if that isn't newer.
function withHeard(gw, heard) {
    const update = heard.find(h => h.gateway_eui === gw.gateway_eui);
    if (!update || !update.last_heard) return gw;
    if (gw.last_heard && new Date(update.last_heard) <= new Date(gw.last_heard)) return gw;
    return { ...gw, last_heard: update.last_heard };
}

// The same array back when nothing changed, so the map skips a redraw.
export function applyHeardToFeatures(features, heard) {
    const updated = features.map(f => {
        const properties = withHeard(f.properties, heard);
        return properties === f.properties ? f : { ...f, properties };
    });
    return updated.some((f, i) => f !== features[i]) ? updated : features;
}

export function applyHeardToPopup(popup, heard) {
    if (!popup) return popup;
    const gw = withHeard(popup.gw, heard);
    return gw === popup.gw ? popup : { ...popup, gw };
}

// A load takes over a second, so a gateway_heard message can arrive after its
// snapshot was taken. The newer time wins whichever way round they land.
export function keepNewerHeard(features, previous) {
    const heard = previous
        .map(f => f.properties)
        .filter(gw => gw.gateway_eui)
        .map(gw => ({ gateway_eui: gw.gateway_eui, last_heard: gw.last_heard }));
    return applyHeardToFeatures(features, heard);
}
