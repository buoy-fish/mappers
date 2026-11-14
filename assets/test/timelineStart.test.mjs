// Unit tests for the Timeline auto-start helpers Map.js uses when a project has
// no configured start in TIMELINE_PROJECT_CONFIG.
//
// Run with `npm test --prefix assets` (node:test — no runner dependency).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { viewBounds, boundsContain, earliestFirstSeenInBounds, resolveAutoStart } from '../js/utils/timelineStart.js'

const DAY = 24 * 60 * 60 * 1000

// Gulf of Nicoya framing as served by /api/v1/public/projects.
const NICOYA = { lat: 10.071485, lng: -85.031965, zoom: 8.3 }

// Fake hex ids that carry their own centre, so tests don't need h3-js.
const centerOf = (id) => id.split(',').map(Number)
const hex = (lat, lng, firstSeen) => ({ properties: { id: `${lat},${lng}`, first_seen: firstSeen } })

test('viewBounds is centred on the view and shrinks as zoom grows', () => {
    const b = viewBounds(NICOYA, 1280, 800)
    assert.ok(b.west < NICOYA.lng && NICOYA.lng < b.east)
    assert.ok(b.south < NICOYA.lat && NICOYA.lat < b.north)
    // 1280 px at zoom 8.3 is ~2.8 degrees of longitude.
    assert.ok(Math.abs((b.east - b.west) - 1280 / (512 * 2 ** 8.3) * 360) < 1e-9)
    const closer = viewBounds({ ...NICOYA, zoom: 10 }, 1280, 800)
    assert.ok(closer.east - closer.west < b.east - b.west)
})

test('viewBounds rejects unusable input', () => {
    assert.equal(viewBounds({ lat: 10, lng: -85, zoom: NaN }, 100, 100), null)
    assert.equal(viewBounds(NICOYA, 0, 100), null)
    assert.equal(viewBounds({}, 100, 100), null)
})

test('boundsContain handles an antimeridian-straddling box', () => {
    const b = { west: 170, east: -170, south: -10, north: 10 }
    assert.equal(boundsContain(b, 0, 175), true)
    assert.equal(boundsContain(b, 0, -175), true)
    assert.equal(boundsContain(b, 0, 0), false)
    assert.equal(boundsContain(b, 20, 175), false)
})

test('earliestFirstSeenInBounds ignores hexes outside the view', () => {
    const bounds = viewBounds(NICOYA, 1280, 800)
    const features = [
        hex(27.7, -114.8, 1000),          // Baja: older, but out of view
        hex(10.0, -85.0, 5000),           // in view
        hex(10.1, -84.9, 3000),           // in view, earliest
        { properties: { id: '10,-85' } }, // no first_seen: skipped
    ]
    assert.equal(earliestFirstSeenInBounds(features, bounds, centerOf), 3000)
})

test('earliestFirstSeenInBounds returns null when nothing is in view', () => {
    const bounds = viewBounds(NICOYA, 1280, 800)
    assert.equal(earliestFirstSeenInBounds([hex(27.7, -114.8, 1000)], bounds, centerOf), null)
    assert.equal(earliestFirstSeenInBounds([], bounds, centerOf), null)
    assert.equal(earliestFirstSeenInBounds([hex(10, -85, 1)], null, centerOf), null)
})

test('earliestFirstSeenInBounds skips ids the centre function rejects', () => {
    const bounds = viewBounds(NICOYA, 1280, 800)
    const throwing = (id) => { if (id === 'bad') throw new Error('invalid h3'); return centerOf(id) }
    const features = [{ properties: { id: 'bad', first_seen: 1 } }, hex(10, -85, 7)]
    assert.equal(earliestFirstSeenInBounds(features, bounds, throwing), 7)
})

const floorDay = (t) => Math.floor(t / DAY) * DAY
const base = { view: NICOYA, width: 1280, height: 800, lookbackMs: 60 * DAY, centerOf, startOfDay: floorDay }

test('resolveAutoStart begins at the day of the earliest hex in view', () => {
    const now = 400 * DAY
    const firstNicoya = 200 * DAY + 5 * 3600 * 1000
    const start = resolveAutoStart({
        ...base, now, end: now + DAY,
        features: [hex(27.7, -114.8, 10 * DAY), hex(10.0, -85.0, firstNicoya), hex(10.05, -85.05, 300 * DAY)],
    })
    assert.equal(start, 200 * DAY)
})

test('resolveAutoStart falls back to the lookback when the view is empty', () => {
    const now = 400 * DAY + 123
    const start = resolveAutoStart({ ...base, now, end: now + DAY, features: [hex(27.7, -114.8, 10 * DAY)] })
    assert.equal(start, 340 * DAY)
})

test('resolveAutoStart never returns a start at or after the end', () => {
    const now = 400 * DAY
    const end = 100 * DAY
    const start = resolveAutoStart({ ...base, now, end, features: [hex(10, -85, 200 * DAY)] })
    assert.ok(start < end)
    assert.equal(start, 40 * DAY)
})
