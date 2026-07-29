// Pure (de)serialization for shareable project / view deep-links. Build and
// parse live in one file so they stay in lockstep — the round-trip
// parse(build(state)) is this feature's verification anchor
// (assets/test/projectLink.test.mjs).
//
// URL contract (PATH segments on the root, no query string):
//   /<project-slug>
//   /<project-slug>/<flag>/<flag>...
//   /<flag>...                          (flags without a project)
//
// Flags are the three legend display toggles, named by slug:
//   show-gateways      → Show Gateways
//   hide-coverage      → Hide Coverage        (implies show-gateways)
//   show-mobile-hexes  → Show mobile gateway hexes (implies hide-coverage)
//
// Segment ORDER doesn't matter: every segment that is a known flag slug sets
// that flag, and the first segment that isn't becomes the project slug. Unknown
// extra segments are ignored so a mangled link still lands on a sane view.
//
// The nesting implications matter: the legend only offers Hide Coverage once
// Show Gateways is on, and mobile hexes only once coverage is hidden. Map.js
// enforces that invariant by force-closing children when a parent turns off, so
// a link naming a child MUST switch its parents on or the state would collapse
// the moment it was applied. Both parse and build normalize the same way, which
// is what makes the round-trip a fixed point.
//
// This module is intentionally framework-free (no React, no Map import) so it's
// trivially unit-testable from plain Node — same contract as timelineLink.js.

// Flag slugs in legend order (parents before children). The Elixir side mirrors
// this list in MappersWeb.OgMeta — keep the two in sync.
export const VIEW_FLAG_SLUGS = ['show-gateways', 'hide-coverage', 'show-mobile-hexes'];

// slug → state key on Map.js.
const FLAG_KEYS = {
    'show-gateways': 'showGateways',
    'hide-coverage': 'hideCoverage',
    'show-mobile-hexes': 'showOtherHexes',
};

// First path segments that belong to something OTHER than a project view:
// existing SPA routes, API scopes, the tile proxy, and the static prefixes
// served by Plug.Static. A path starting with one of these is not a view link.
const RESERVED = new Set([
    'uplinks', 'api', 'tiles', 'metrics', 'dashboard', 'socket', 'live',
    'css', 'js', 'images', 'fonts', 'favicon.ico', 'robots.txt',
]);

// Project codes are lowercase kebab-case (see the `code` column served by
// app.buoy.fish /api/v1/public/projects). Anything else is not a slug we'd
// ever match, so we drop it rather than carry untrusted text around.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function normalizeSlug(raw) {
    if (typeof raw !== 'string') return null;
    let s = raw;
    try {
        s = decodeURIComponent(s);
    } catch (_) {
        // Malformed percent-escapes: fall through with the raw segment, which
        // SLUG_RE will then reject.
    }
    s = s.trim().toLowerCase();
    return SLUG_RE.test(s) ? s : null;
}

// Apply the legend's nesting rules: a child flag switches its parents on.
function withImpliedParents(flags) {
    const showOtherHexes = !!flags.showOtherHexes;
    const hideCoverage = !!flags.hideCoverage || showOtherHexes;
    const showGateways = !!flags.showGateways || hideCoverage;
    return { showGateways, hideCoverage, showOtherHexes };
}

/**
 * Parse a pathname into a view intent, or null when the path belongs to another
 * route (hex deep-links, the API, static assets). Never throws.
 *
 * Returns `{ project, showGateways, hideCoverage, showOtherHexes }` where
 * `project` is a slug string or null.
 */
export function parseProjectLink(pathname) {
    const segments = String(pathname || '')
        .split('/')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    if (segments.length > 0 && RESERVED.has(segments[0].toLowerCase())) return null;

    const flags = {};
    let project = null;
    let projectSeen = false;
    for (const segment of segments) {
        const key = FLAG_KEYS[segment.toLowerCase()];
        if (key) {
            flags[key] = true;
            continue;
        }
        // The FIRST non-flag segment is the project slot, whether or not it
        // holds a valid slug — otherwise a path like /../etc/passwd would walk
        // past the junk and adopt a later segment as the project.
        if (projectSeen) continue;
        projectSeen = true;
        project = normalizeSlug(segment);
    }

    return { project, ...withImpliedParents(flags) };
}

/**
 * Build the canonical path for a view state: the project slug (when valid)
 * followed by every active flag in legend order. Returns '/' for the default
 * view. Path only — callers hand it straight to react-router's navigate().
 */
export function buildProjectPath(state) {
    const { project } = state || {};
    const flags = withImpliedParents(state || {});
    const slug = normalizeSlug(project);
    const parts = [];
    if (slug) parts.push(slug);
    for (const flagSlug of VIEW_FLAG_SLUGS) {
        if (flags[FLAG_KEYS[flagSlug]]) parts.push(flagSlug);
    }
    return '/' + parts.join('/');
}
