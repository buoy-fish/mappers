// Where a timeline replay starts when no start date is configured.
// Run with `npm test --prefix assets`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstSeenInBounds } from '../js/utils/timelineWindow.js'

const hex = (lat, lng, first_seen) => ({ properties: { lat, lng, first_seen } })
// Gulf of Nicoya-ish framing.
const BOUNDS = { west: -85.3, south: 9.7, east: -84.6, north: 10.25 }

test('earliest first_seen among hexes inside the view', () => {
    const feats = [
        hex(10.0, -85.0, 3000),
        hex(9.9, -84.8, 2000),   // earliest in view
        hex(10.1, -84.9, 5000),
    ]
    assert.equal(firstSeenInBounds(feats, BOUNDS), 2000)
})

test('hexes outside the view do not pull the start earlier', () => {
    const feats = [
        hex(10.0, -85.0, 3000),
        hex(26.7, -113.5, 1),    // Baja, far outside
        hex(10.0, -84.5, 2),     // just east of the view
    ]
    assert.equal(firstSeenInBounds(feats, BOUNDS), 3000)
})

test('null when nothing is in view or there are no bounds', () => {
    assert.equal(firstSeenInBounds([hex(26.7, -113.5, 1)], BOUNDS), null)
    assert.equal(firstSeenInBounds([], BOUNDS), null)
    assert.equal(firstSeenInBounds([hex(10.0, -85.0, 3000)], null), null)
})

test('a view crossing the antimeridian (west > east) still matches', () => {
    const fiji = { west: 177, south: -19, east: -178, north: -16 }
    assert.equal(firstSeenInBounds([hex(-17.5, 179, 10), hex(-17.5, -179, 5)], fiji), 5)
})
