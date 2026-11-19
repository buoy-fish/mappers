// Per-project timeline defaults come from app.buoy.fish's project feed alone:
// its values, else the built-ins (start null = first coverage in view; speed 1).
// Run with `npm test --prefix assets`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProject, timelineDefaults, FALLBACK_PROJECTS } from '../js/utils/projects.js'
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

test("the app's values are the defaults", () => {
    const project = normalizeProject({ ...RAW, timeline_start: '2026-07-01', timeline_speed: 4 })
    assert.deepEqual(timelineDefaults(project), { start: '2026-07-01', speed: 4 })
})

test('nothing set in the app: first coverage in view at 1x', () => {
    assert.deepEqual(timelineDefaults(normalizeProject(RAW)), { start: null, speed: 1 })
    assert.deepEqual(timelineDefaults(normalizeProject({ ...RAW, timeline_start: null })), { start: null, speed: 1 })
    assert.deepEqual(timelineDefaults(null), { start: null, speed: 1 })
})

// With app.buoy.fish unreachable and nothing cached, the fallback project
// still replays from the start it has in the app.
test('the fallback project keeps its timeline start', () => {
    const fallback = FALLBACK_PROJECTS.find(p => p.code === 'punta-abreojos-baja')
    assert.deepEqual(timelineDefaults(normalizeProject(fallback)), { start: '2026-04-10', speed: 1 })
})
