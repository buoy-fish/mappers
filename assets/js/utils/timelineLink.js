// Pure (de)serialization for shareable Timeline deep-links. Build and parse live
// in one file so they stay in lockstep — the round-trip
// parse(serialize(state)) is this feature's verification anchor.
//
// URL contract (query params on root):
//   /?play=<project-code>&start=YYYY-MM-DD&end=YYYY-MM-DD&speed=1|2|4
//      &baseline=0|1&loop=0|1&open=0|1&lat=<deg>&lng=<deg>&zoom=<level>
//
// `play` (project code) is required; absent ⇒ not a Timeline deep-link. The rest
// are optional; when absent/invalid, parse returns null for that field so the
// caller (Map.js) can fall back to per-project TIMELINE_PROJECT_CONFIG, then
// hardcoded defaults. lat/lng/zoom capture the sender's exact camera so the
// receiver sees the same framing (overriding the project's default coords/zoom).
// This module is intentionally framework-free (no React, no Map import) so it's
// trivially unit-testable from plain Node.

const VALID_SPEEDS = [1, 2, 4];

// Parse a numeric query param into a finite number within [min, max], else null.
function numInRange(raw, min, max) {
    if (raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return n;
}

// epoch-ms -> 'YYYY-MM-DD' in the browser's LOCAL timezone (matching how the
// scrubber day-snaps + labels dates). NOT toISOString() — that's UTC and would
// drift the date by a day for negative-offset zones.
export function fmtLocalYMD(epochMs) {
    const d = new Date(epochMs);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' -> epoch-ms at LOCAL midnight, or null if malformed. Null-safe
// twin of Map.js's parseLocalDate, hardened for untrusted URL input (rejects
// bad shapes and calendar rollovers like 2026-02-31).
export function parseLocalYMD(iso) {
    if (typeof iso !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = new Date(y, mo - 1, d).getTime();
    if (!Number.isFinite(t)) return null;
    // Reject rollover (e.g. Feb 31 -> Mar 3): the components must survive a
    // round-trip through Date.
    const back = new Date(t);
    if (back.getFullYear() !== y || back.getMonth() !== mo - 1 || back.getDate() !== d) return null;
    return t;
}

function boolParam(v) {
    if (v == null) return false;
    const s = String(v).toLowerCase();
    return s === '1' || s === 'true';
}

// Build the absolute shareable URL from the current Timeline state. `origin`
// defaults to window.location.origin (falls back to '' in non-browser contexts).
export function buildTimelineLink(state, origin) {
    const { projectCode, rangeStart, rangeEnd, speed, baseline, loop, open, lat, lng, zoom } = state || {};
    const base = (origin != null ? origin : (typeof window !== 'undefined' ? window.location.origin : '')) || '';
    const p = new URLSearchParams();
    p.set('play', projectCode || '');
    p.set('start', fmtLocalYMD(rangeStart));
    p.set('end', fmtLocalYMD(rangeEnd));
    p.set('speed', String(VALID_SPEEDS.includes(speed) ? speed : 1));
    p.set('baseline', baseline ? '1' : '0');
    p.set('loop', loop ? '1' : '0');
    p.set('open', open ? '1' : '0');
    // Sender's exact camera (~1 m of lat/lng precision is plenty). Omitted when
    // not finite so a hand-crafted link can still fall back to project framing.
    if (Number.isFinite(lat)) p.set('lat', lat.toFixed(5));
    if (Number.isFinite(lng)) p.set('lng', lng.toFixed(5));
    if (Number.isFinite(zoom)) p.set('zoom', zoom.toFixed(2));
    return `${base}/?${p.toString()}`;
}

// Parse a raw query string (location.search) into a normalized intent, or null
// when `play` is absent. Does NOT resolve the project (that needs the projects
// list, which lives in Map.js). start/end/speed are null when absent/invalid so
// the caller can apply config fallbacks; booleans default to false.
export function parseTimelineLink(search) {
    const p = new URLSearchParams(search || '');
    const play = p.get('play');
    if (!play) return null;
    const startRaw = p.get('start');
    const endRaw = p.get('end');
    const speedRaw = p.get('speed');
    const speedNum = speedRaw != null ? Number(speedRaw) : null;
    return {
        play,
        start: startRaw != null ? parseLocalYMD(startRaw) : null,
        end: endRaw != null ? parseLocalYMD(endRaw) : null,
        speed: VALID_SPEEDS.includes(speedNum) ? speedNum : null,
        baseline: boolParam(p.get('baseline')),
        loop: boolParam(p.get('loop')),
        open: boolParam(p.get('open')),
        lat: numInRange(p.get('lat'), -90, 90),
        lng: numInRange(p.get('lng'), -180, 180),
        zoom: numInRange(p.get('zoom'), 0, 22),
    };
}
