/**
 * Project list fetch + cache for map.buoy.fish.
 *
 * Strategy: fetch-first, cache-as-fallback.
 *
 *   1. `getInitialProjects()` is synchronous: cached value if any, else
 *      the hardcoded FALLBACK_PROJECTS so a brand-new install (or a
 *      downed app.buoy.fish) still renders something useful.
 *   2. `fetchProjects()` returns a promise that resolves to the live
 *      list. Caller updates React state on success so the current
 *      session reflects edits immediately (no stale-cache window).
 *      Writes to localStorage on success so the next page load has a
 *      best-effort starting list even before the new fetch resolves.
 *
 * Why this differs from `mapConfig.js`: map config rarely changes;
 * project metadata changes during pilot/onboarding work, so a TTL-gated
 * cache made edits invisible for up to 5 minutes. Fetching on every
 * page load is cheap (a handful of rows of JSON) and removes the
 * surprise.
 *
 * Public response shape (from /api/v1/public/projects):
 *   [{ code, name, lat, lng, zoom, timeline_start, timeline_speed }, ...]
 * (the timeline fields since app.buoy.fish#1139; older servers omit them).
 * Note `lng` (not `lon`): matches the legacy hardcoded array shape this
 * module replaces, so InfoPane.js stays a near-identity swap.
 */

// v2: entries carry the timeline fields; a v1 cache predates them.
const CACHE_KEY = "projects_v2"
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

const TIMELINE_SPEEDS = [1, 2, 4]
const YMD = /^\d{4}-\d{2}-\d{2}$/

export function normalizeProject(raw) {
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
    // Timeline defaults, edited per project in app.buoy.fish (null = unset).
    const timeline_start = typeof raw.timeline_start === "string" && YMD.test(raw.timeline_start) ? raw.timeline_start : null
    const timeline_speed = TIMELINE_SPEEDS.includes(raw.timeline_speed) ? raw.timeline_speed : null
    // Whether the server sent the timeline fields at all (an older app, or
    // FALLBACK_PROJECTS, doesn't). Kept explicitly so a cached, re-normalized
    // entry, which always has the keys, still knows.
    const timeline_from_app = typeof raw.timeline_from_app === "boolean"
        ? raw.timeline_from_app
        : ("timeline_start" in raw || "timeline_speed" in raw)
    return { code, name, lat, lng, zoom, timeline_start, timeline_speed, timeline_from_app }
}

/**
 * A project's timeline defaults. When app.buoy.fish serves the fields it is
 * the source of truth, nulls included (an admin clearing the start means
 * "first coverage in view"). Otherwise the legacy TIMELINE_PROJECT_CONFIG
 * env entry, then the built-ins. `start` is 'YYYY-MM-DD' or null (null =
 * first coverage in view); `speed` is 1, 2 or 4.
 */
export function timelineDefaults(project, envConfig) {
    if (project && project.timeline_from_app) {
        return { start: project.timeline_start || null, speed: project.timeline_speed || 1 }
    }
    const env = (project && project.code && envConfig && envConfig[project.code]) || {}
    return {
        start: typeof env.start === "string" && YMD.test(env.start) ? env.start : null,
        speed: TIMELINE_SPEEDS.includes(env.speed) ? env.speed : 1,
    }
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
        if (!projects) return null
        return projects
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
    if (cached) return cached
    return [...FALLBACK_PROJECTS]
}

/**
 * Returns a Promise<projects[] | null>. Resolves with the live list on
 * success (also writing it to localStorage); resolves with null on any
 * failure (offline, CORS, shape mismatch, timeout). Caller is expected
 * to update React state on a non-null result so the current session
 * shows the freshest data.
 */
export function fetchProjects() {
    if (!API_BASE_URL) return Promise.resolve(null)

    const url = `${API_BASE_URL}/api/v1/public/projects`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    return fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
        })
        .then((data) => {
            const projects = normalizeProjectsList(data)
            if (projects) writeCache(projects)
            return projects
        })
        .catch(() => null)
        .finally(() => clearTimeout(timer))
}
