// map.buoy.fish as app.buoy.fish's "Default map view" picker.
//
// The app embeds `/?embed=picker&lat=&lng=&zoom=` in an iframe so an admin
// frames a project on the real public map (same basemap, hexes and zoom
// semantics a visitor gets) instead of a look-alike. The embed reports its
// camera to the parent on every move end, and accepts fly-to requests (place
// search, typed coordinates) from it. Only the app's origin may do either; a
// map served from localhost also accepts a local app on any port (dev).
//
// Framework-free so it's unit-testable from plain Node.

const CAMERA = 'buoy-map:camera';
const FLY = 'buoy-map:fly';

function num(raw, min, max) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// { lat, lng, zoom } (each null when absent/invalid) for an embed URL, or null
// when this page isn't the picker embed.
export function parseEmbedPicker(search) {
    const p = new URLSearchParams(search || '');
    if (p.get('embed') !== 'picker') return null;
    return {
        lat: num(p.get('lat'), -90, 90),
        lng: num(p.get('lng'), -180, 180),
        zoom: num(p.get('zoom'), 0, 22),
    };
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

export function isAllowedParentOrigin(origin, appUiBase, selfHostname) {
    if (!origin) return false;
    try {
        if (appUiBase && origin === new URL(appUiBase).origin) return true;
    } catch (_) { /* malformed base: fall through */ }
    if (!LOCAL_HOSTS.includes(selfHostname)) return false;
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

// MapLibre lets longitude run past ±180 (panning across world copies) and
// zoom below 0; wrap and clamp so the app can always replay what it's told.
const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function cameraMessage({ latitude, longitude, zoom }) {
    return {
        type: CAMERA,
        lat: round(clamp(latitude, -85.06, 85.06), 5),
        lng: round(wrapLng(longitude), 5),
        zoom: round(clamp(zoom, 0, 22), 2),
    };
}

export function parseFlyMessage(data) {
    if (!data || typeof data !== 'object' || data.type !== FLY) return null;
    const lat = num(data.lat, -90, 90);
    const lng = num(data.lng, -180, 180);
    const zoom = num(data.zoom, 0, 22);
    return lat == null || lng == null || zoom == null ? null : { lat, lng, zoom };
}
