// Unit tests for the project/view deep-link codec.
//
// Run with `npm test --prefix assets` (node:test — no runner dependency).
// The codec is pure and framework-free precisely so it can be exercised here:
// the round-trip parse(build(state)) is this feature's verification anchor,
// mirroring how utils/timelineLink.js is meant to be checked.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProjectLink, buildProjectPath, urlMirrorAction, VIEW_FLAG_SLUGS } from '../js/utils/projectLink.js'

const NONE = { project: null, showGateways: false, hideCoverage: false, showOtherHexes: false }

test('bare root is a view link with nothing set', () => {
    assert.deepEqual(parseProjectLink('/'), NONE)
    assert.deepEqual(parseProjectLink(''), NONE)
    assert.deepEqual(parseProjectLink(null), NONE)
})

test('a lone segment is the project slug', () => {
    assert.deepEqual(parseProjectLink('/gulf-of-nicoya'), { ...NONE, project: 'gulf-of-nicoya' })
    // Trailing slash and mixed case normalize away.
    assert.deepEqual(parseProjectLink('/Gulf-Of-Nicoya/'), { ...NONE, project: 'gulf-of-nicoya' })
    // Percent-encoding is decoded before validation.
    assert.deepEqual(parseProjectLink('/gulf%2Dof%2Dnicoya'), { ...NONE, project: 'gulf-of-nicoya' })
})

test('flag segments set their toggle', () => {
    assert.deepEqual(parseProjectLink('/gulf-of-nicoya/show-gateways'), {
        project: 'gulf-of-nicoya', showGateways: true, hideCoverage: false, showOtherHexes: false,
    })
})

test('flag order does not matter and flags may precede the project', () => {
    const expected = {
        project: 'gulf-of-nicoya', showGateways: true, hideCoverage: true, showOtherHexes: false,
    }
    assert.deepEqual(parseProjectLink('/gulf-of-nicoya/show-gateways/hide-coverage'), expected)
    assert.deepEqual(parseProjectLink('/hide-coverage/gulf-of-nicoya/show-gateways'), expected)
})

test('nested flags imply their parents', () => {
    // The legend only offers Hide Coverage once Show Gateways is on, and
    // mobile hexes only once coverage is hidden — so a link naming a child
    // flag must switch its parents on, or Map.js would reset it immediately.
    assert.deepEqual(parseProjectLink('/gulf-of-nicoya/hide-coverage'), {
        project: 'gulf-of-nicoya', showGateways: true, hideCoverage: true, showOtherHexes: false,
    })
    assert.deepEqual(parseProjectLink('/gulf-of-nicoya/show-mobile-hexes'), {
        project: 'gulf-of-nicoya', showGateways: true, hideCoverage: true, showOtherHexes: true,
    })
})

test('flags work without a project', () => {
    assert.deepEqual(parseProjectLink('/show-gateways'), { ...NONE, showGateways: true })
})

test('reserved paths are not view links', () => {
    assert.equal(parseProjectLink('/uplinks/hex/8928308280fffff'), null)
    assert.equal(parseProjectLink('/api/v1/hexes'), null)
    assert.equal(parseProjectLink('/metrics'), null)
    assert.equal(parseProjectLink('/tiles/1/2/3.pbf'), null)
})

test('only the first non-flag segment counts; junk is ignored', () => {
    assert.deepEqual(parseProjectLink('/gulf-of-nicoya/whatever/show-gateways'), {
        project: 'gulf-of-nicoya', showGateways: true, hideCoverage: false, showOtherHexes: false,
    })
    // A syntactically invalid slug is dropped rather than trusted.
    assert.deepEqual(parseProjectLink('/../etc/passwd'), NONE)
    assert.deepEqual(parseProjectLink('/<script>'), NONE)
})

test('build emits the canonical path', () => {
    assert.equal(buildProjectPath({}), '/')
    assert.equal(buildProjectPath({ project: 'gulf-of-nicoya' }), '/gulf-of-nicoya')
    assert.equal(
        buildProjectPath({ project: 'gulf-of-nicoya', showGateways: true }),
        '/gulf-of-nicoya/show-gateways'
    )
    assert.equal(
        buildProjectPath({ project: 'gulf-of-nicoya', showGateways: true, hideCoverage: true, showOtherHexes: true }),
        '/gulf-of-nicoya/show-gateways/hide-coverage/show-mobile-hexes'
    )
    assert.equal(buildProjectPath({ showGateways: true }), '/show-gateways')
    // Flags are emitted in legend order regardless of key order in.
    assert.equal(
        buildProjectPath({ showOtherHexes: true, showGateways: true, hideCoverage: true }),
        '/show-gateways/hide-coverage/show-mobile-hexes'
    )
    // Build normalizes the same implications parse does.
    assert.equal(buildProjectPath({ hideCoverage: true }), '/show-gateways/hide-coverage')
    // An unusable slug is omitted rather than emitted into the URL.
    assert.equal(buildProjectPath({ project: 'Not A Slug', showGateways: true }), '/show-gateways')
})

test('parse(build(state)) round-trips every flag combination', () => {
    for (const project of [null, 'gulf-of-nicoya']) {
        for (const showGateways of [false, true]) {
            for (const hideCoverage of [false, true]) {
                for (const showOtherHexes of [false, true]) {
                    const state = { project, showGateways, hideCoverage, showOtherHexes }
                    const path = buildProjectPath(state)
                    const back = parseProjectLink(path)
                    // Both sides normalize identically, so re-building from the
                    // parsed value is a fixed point.
                    assert.equal(buildProjectPath(back), path, `round-trip failed for ${path}`)
                }
            }
        }
    }
})

test('the slug vocabulary is exported for the Elixir side to mirror', () => {
    assert.deepEqual(VIEW_FLAG_SLUGS, ['show-gateways', 'hide-coverage', 'show-mobile-hexes'])
})

// --- urlMirrorAction: who owns the address bar -------------------------------
// The whole mirror policy as one pure decision, so it can be exercised without
// mounting the map. Map.js had none of this under test, which is exactly how
// the shared-link bug below shipped.

const MIRROR = {
    armed: true,
    sharedLinkOwnsUrl: false,
    hexId: null,
    viewPath: '/gulf-of-nicoya',
    currentPath: '/',
    projectChanged: false,
}

test('mirror waits until an incoming deep-link has been applied', () => {
    assert.equal(urlMirrorAction({ ...MIRROR, armed: false }), null)
})

test('a shared timeline link owns the address bar while it holds it', () => {
    // Arriving on /?play=... must not have the path rewritten out from under
    // the link — that would destroy the very URL the visitor was sent.
    assert.equal(urlMirrorAction({ ...MIRROR, sharedLinkOwnsUrl: true }), null)
})

test('mirroring RESUMES once the shared link releases ownership', () => {
    // Regression: ownership used to be captured once at mount, so any session
    // that began at /?play=... never updated its URL again — pick a project
    // after exiting the timeline and the address bar stayed on the old link.
    assert.deepEqual(
        urlMirrorAction({ ...MIRROR, sharedLinkOwnsUrl: false, projectChanged: true }),
        { path: '/gulf-of-nicoya', replace: false }
    )
})

test('an open hex pane owns the path', () => {
    assert.equal(urlMirrorAction({ ...MIRROR, hexId: '8928308280fffff' }), null)
    // react-router hands back the literal string 'undefined' for an absent
    // param in some paths; that is not an open hex.
    assert.deepEqual(urlMirrorAction({ ...MIRROR, hexId: 'undefined' }), { path: '/gulf-of-nicoya', replace: true })
})

test('no navigation when the URL already shows the view', () => {
    assert.equal(urlMirrorAction({ ...MIRROR, currentPath: '/gulf-of-nicoya' }), null)
})

test('changing project pushes history; flipping a toggle replaces it', () => {
    assert.deepEqual(
        urlMirrorAction({ ...MIRROR, projectChanged: true }),
        { path: '/gulf-of-nicoya', replace: false }
    )
    assert.deepEqual(
        urlMirrorAction({ ...MIRROR, projectChanged: false }),
        { path: '/gulf-of-nicoya', replace: true }
    )
})
