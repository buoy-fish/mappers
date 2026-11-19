// Per-project timeline defaults come from app.buoy.fish's project feed alone:
// its values, else the built-ins (start null = first coverage in view; speed 1).
// Run with `npm test --prefix assets`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProject, timelineDefaults } from '../js/utils/projects.js'
import { timelineSettingsUrl } from '../js/utils/timelineLink.js'

const RAW = { code: 'gulf-of-nicoya-costa-rica', name: 'Gulf of Nicoya', lat: 10.07, lng: -85.03, zoom: 8.3 }

test('the project feed carries the timeline start and speed', () => {
    const p = normalizeProject({ ...RAW, timeline_start: '2026-07-01', timeline_speed: 2 })
    assert.equal(p.timeline_start, '2026-07-01')
    assert.equal(p.timeline_speed, 2)
})

test('missing or malformed timeline values normalize to null', () => {
    assert.equal(normalizeProject(RAW).timeline_start, null)
    assert.equal(normalizeProject(RAW).timeline_speed, null)
    const bad = normalizeProject({ ...RAW, timeline_start: 'July', timeline_speed: 3 })
    assert.equal(bad.timeline_start, null)
    assert.equal(bad.timeline_speed, null)
})

test("the settings link opens the project's map view in the app, by code", () => {
    assert.equal(
        timelineSettingsUrl('gulf-of-nicoya-costa-rica', 'https://app.buoy.fish'),
        'https://app.buoy.fish/admin/projects?open=gulf-of-nicoya-costa-rica&focus=map'
    )
    assert.equal(timelineSettingsUrl(null, 'https://app.buoy.fish'), null)
    assert.equal(timelineSettingsUrl('x', ''), null)
})

// Once app.buoy.fish serves the fields, its null is a choice ("first coverage,
// 1×"), not "unset": an admin clearing the start must not fall back to the
// env entry the app replaced.

test("the app's values are the defaults", () => {
    const project = normalizeProject({ ...RAW, timeline_start: '2026-07-01', timeline_speed: 4 })
    assert.deepEqual(timelineDefaults(project), { start: '2026-07-01', speed: 4 })
})

test('nothing set in the app: first coverage in view at 1x', () => {
    assert.deepEqual(timelineDefaults(normalizeProject(RAW)), { start: null, speed: 1 })
    assert.deepEqual(timelineDefaults(normalizeProject({ ...RAW, timeline_start: null })), { start: null, speed: 1 })
    assert.deepEqual(timelineDefaults(null), { start: null, speed: 1 })
})

// The retired TIMELINE_PROJECT_CONFIG env var: a second argument, as the old
// callers passed, is ignored.
test('no env-config fallback any more', () => {
    const env = { 'gulf-of-nicoya-costa-rica': { start: '2026-09-19', speed: 2 } }
    assert.deepEqual(timelineDefaults(normalizeProject(RAW), env), { start: null, speed: 1 })
})
