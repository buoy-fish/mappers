/**
 * Default-view fetch + cache for map.buoy.fish.
 *
 * The map's default lat/lon/zoom is admin-editable on app.buoy.fish (see
 * `Default Map View` card on the Map Buoy Fish admin tab). To avoid a
 * blocking cross-origin request on every page load — and to keep the map
 * usable when app.buoy.fish is unreachable — we cache the response in
 * localStorage with a 5-minute TTL and ALWAYS render synchronously from
 * cache (or a baked-in fallback) on first paint.
 *
 * Flow on page load:
 *
 *   1. `getInitialMapView()` runs synchronously: returns the cached value
 *      if fresh, else the baked-in fallback. Map mounts immediately.
 *   2. `refreshMapConfigInBackground()` fires-and-forgets. Updated value
 *      lands in localStorage for the *next* page load — never disrupts
 *      the current session by snapping the camera.
 *
 * URL deep-links (/uplinks/hex/:hexId) override the default and are
 * handled in MapScreen.js without consulting this module.
 */

const CACHE_KEY = "mapConfig_v1"
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes
const FETCH_TIMEOUT_MS = 4000

// API base URL is inlined at build time by esbuild's `define` block (see
// assets/build.mjs). Production -> https://app.buoy.fish; dev -> usually
// http://localhost:4000. Empty string ("") means "skip the fetch and
// always serve the fallback" — handy for offline previews.
//
// NOTE: do NOT wrap this in `typeof process !== "undefined"` checks. esbuild
// only substitutes the literal expression `process.env.BUOY_API_BASE_URL`;
// any surrounding `process.env` references stay as-is and blow up at runtime
// in browsers (no Node global). Bare reference is the documented pattern —
// see how Map.js consumes process.env.MAPBOX_ACCESS_TOKEN.
const API_BASE_URL = process.env.BUOY_API_BASE_URL || ""

// Punta Abreojos baseline. Mirrors the seed value in app.buoy.fish's
// migration so a brand-new install renders the same view in both apps.
// Used when:
//   - localStorage has no fresh entry, AND
//   - the most recent fetch failed (or never ran).
export const FALLBACK_VIEW = Object.freeze({ lat: 27.80, lon: -114.71, zoom: 11 })

function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n)
}

function normalizeView(raw) {
    if (!raw || typeof raw !== "object") return null
    const lat = Number(raw.lat)
    const lon = Number(raw.lon)
    const zoom = Number(raw.zoom)
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon) || !isFiniteNumber(zoom)) return null
    if (lat < -90 || lat > 90) return null
    if (lon < -180 || lon > 180) return null
    if (zoom < 0 || zoom > 22) return null
    return { lat, lon, zoom }
}

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const view = normalizeView(parsed?.view)
        const fetchedAt = Number(parsed?.fetchedAt)
        if (!view || !isFiniteNumber(fetchedAt)) return null
        return { view, fetchedAt }
    } catch (_) {
        return null
    }
}

function writeCache(view) {
    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ view, fetchedAt: Date.now() })
        )
    } catch (_) {
        // localStorage may be disabled (private browsing, quota). Silently
        // skip — the next page load will refetch.
    }
}

/**
 * Synchronous: best available initial view for the map. Never returns null.
 * Order of preference:
 *   1. Cached value if newer than CACHE_TTL_MS
 *   2. Cached value of any age (still better than the global fallback —
 *      gives users their last-seen view if app.buoy.fish is unreachable)
 *   3. Baked-in FALLBACK_VIEW (Punta Abreojos)
 */
export function getInitialMapView() {
    const cached = readCache()
    if (cached) return cached.view
    return { ...FALLBACK_VIEW }
}

/**
 * Fire-and-forget refresh. Writes to cache on success; swallows errors so
 * a downed app.buoy.fish never breaks map.buoy.fish.
 */
export function refreshMapConfigInBackground() {
    if (!API_BASE_URL) return
    const cached = readCache()
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        // Cache is still fresh — skip the network roundtrip.
        return
    }

    const url = `${API_BASE_URL}/api/v1/public/map-config`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
        })
        .then((data) => {
            const view = normalizeView(data)
            if (view) writeCache(view)
        })
        .catch(() => { /* offline / CORS / shape mismatch — try again next page load */ })
        .finally(() => clearTimeout(timer))
}
