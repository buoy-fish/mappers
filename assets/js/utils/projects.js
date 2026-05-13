/**
 * Project list fetch + cache for map.buoy.fish.
 *
 * Mirrors the `mapConfig.js` pattern exactly:
 *
 *   1. `getInitialProjects()` is synchronous: cached value if any, else
 *      the hardcoded FALLBACK_PROJECTS so a brand-new install (or a
 *      downed app.buoy.fish) still renders something useful in the
 *      sidebar.
 *   2. `refreshProjectsInBackground()` fires-and-forgets. Writes to
 *      localStorage on success. The current session does NOT
 *      automatically re-render — the update lands for the next page
 *      load. This avoids surprising list jumps mid-session.
 *
 * The 5-minute TTL means an admin toggling a project's visibility in
 * app.buoy.fish Platform Admin propagates to map.buoy.fish on the next
 * page load that happens 5+ minutes later — satisfying the Phase 1
 * acceptance criterion in `projects-and-customers-reorg-plan.md`.
 *
 * Public response shape (from /api/v1/public/projects):
 *   [{ code, name, lat, lng, zoom }, ...]
 * Note `lng` (not `lon`): matches the legacy hardcoded array shape this
 * module replaces, so InfoPane.js stays a near-identity swap.
 */

const CACHE_KEY = "projects_v1"
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes
const FETCH_TIMEOUT_MS = 4000

const API_BASE_URL = process.env.BUOY_API_BASE_URL || ""

// Brand-new install / downed backend fallback. Keep at least one entry so
// the sidebar isn't empty. Mirrors the seeded `punta-abreojos-baja` row
// in app.buoy.fish's seed migration.
export const FALLBACK_PROJECTS = Object.freeze([
    Object.freeze({ code: "punta-abreojos-baja", name: "Punta Abreojos, Baja", lat: 26.72, lng: -113.56, zoom: 12 }),
])

function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n)
}

function normalizeProject(raw) {
    if (!raw || typeof raw !== "object") return null
    const code = typeof raw.code === "string" && raw.code.length > 0 ? raw.code : null
    const name = typeof raw.name === "string" && raw.name.length > 0 ? raw.name : null
    const lat = Number(raw.lat)
    const lng = Number(raw.lng)
    const zoom = Number(raw.zoom)
    if (!name) return null
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || !isFiniteNumber(zoom)) return null
    if (lat < -90 || lat > 90) return null
    if (lng < -180 || lng > 180) return null
    if (zoom < 0 || zoom > 22) return null
    return { code, name, lat, lng, zoom }
}

function normalizeProjectsList(raw) {
    if (!Array.isArray(raw)) return null
    const out = raw.map(normalizeProject).filter(Boolean)
    return out.length > 0 ? out : null
}

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const projects = normalizeProjectsList(parsed?.projects)
        const fetchedAt = Number(parsed?.fetchedAt)
        if (!projects || !isFiniteNumber(fetchedAt)) return null
        return { projects, fetchedAt }
    } catch (_) {
        return null
    }
}

function writeCache(projects) {
    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ projects, fetchedAt: Date.now() })
        )
    } catch (_) {
        // localStorage may be disabled (private browsing, quota). Silently
        // skip — the next page load will refetch.
    }
}

/**
 * Synchronous: best available initial projects list. Never returns null,
 * never returns empty. Order of preference:
 *   1. Cached list of any age (gives users their last-seen sidebar even
 *      if app.buoy.fish is unreachable right now)
 *   2. Baked-in FALLBACK_PROJECTS
 */
export function getInitialProjects() {
    const cached = readCache()
    if (cached) return cached.projects
    return [...FALLBACK_PROJECTS]
}

/**
 * Fire-and-forget refresh. Writes to cache on success; swallows errors
 * so a downed app.buoy.fish never breaks map.buoy.fish.
 */
export function refreshProjectsInBackground() {
    if (!API_BASE_URL) return
    const cached = readCache()
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        // Cache is still fresh — skip the network roundtrip.
        return
    }

    const url = `${API_BASE_URL}/api/v1/public/projects`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
        })
        .then((data) => {
            const projects = normalizeProjectsList(data)
            if (projects) writeCache(projects)
        })
        .catch(() => { /* offline / CORS / shape mismatch — try again next page load */ })
        .finally(() => clearTimeout(timer))
}
