// Per-project timeline defaults: app.buoy.fish (the project feed) wins, then
// the legacy TIMELINE_PROJECT_CONFIG env var, then the built-in defaults
// (start null = first coverage in view; speed 1). Run with `npm test --prefix assets`.

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

test("the app's values win over the env config", () => {
    const project = normalizeProject({ ...RAW, timeline_start: '2026-07-01', timeline_speed: 4 })
    const env = { 'gulf-of-nicoya-costa-rica': { start: '2026-09-19', speed: 2 } }
    assert.deepEqual(timelineDefaults(project, env), { start: '2026-07-01', speed: 4 })
})

test('the env config fills in what the app leaves blank', () => {
    const project = normalizeProject(RAW)
    const env = { 'gulf-of-nicoya-costa-rica': { start: '2026-09-19', speed: 2 } }
    assert.deepEqual(timelineDefaults(project, env), { start: '2026-09-19', speed: 2 })
})

test('nothing set anywhere: first coverage in view at 1x', () => {
    assert.deepEqual(timelineDefaults(normalizeProject(RAW), {}), { start: null, speed: 1 })
    assert.deepEqual(timelineDefaults(null, undefined), { start: null, speed: 1 })
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
test("the app's null wins over the env config once the feed carries the fields", () => {
    const project = normalizeProject({ ...RAW, timeline_start: null, timeline_speed: null })
    const env = { 'gulf-of-nicoya-costa-rica': { start: '2026-09-19', speed: 2 } }
    assert.deepEqual(timelineDefaults(project, env), { start: null, speed: 1 })
})

test('malformed env values are ignored', () => {
    const env = { 'gulf-of-nicoya-costa-rica': { start: '5/1/2026', speed: 3 } }
    assert.deepEqual(timelineDefaults(normalizeProject(RAW), env), { start: null, speed: 1 })
})

test('a cached project (re-normalized) keeps whether the app served the fields', () => {
    const fromOldFeed = normalizeProject(normalizeProject(RAW))
    const env = { 'gulf-of-nicoya-costa-rica': { start: '2026-09-19', speed: 2 } }
    assert.deepEqual(timelineDefaults(fromOldFeed, env), { start: '2026-09-19', speed: 2 })
    const fromNewFeed = normalizeProject(normalizeProject({ ...RAW, timeline_start: null }))
    assert.deepEqual(timelineDefaults(fromNewFeed, env), { start: null, speed: 1 })
})
