// Unit tests for the coverage-class decisions the map makes per hex and per
// gateway (ADR-0035 gateway profiles). Pure, so they run under node:test.
//
// Permanent coverage is the default map. Mobile coverage is opt-in ("Include
// mobile coverage") because it moves and can't be relied on. Bench coverage is
// shown nowhere.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveHexLayer, showsGatewayMarker, mergeHexFeatures, coverageFeatures } from '../js/utils/coverageClass.js'

test('a live hex heard by a permanent gateway joins the default layer', () => {
    assert.equal(liveHexLayer({ permanent: true, mobile: false }, false), 'permanent')
    // Older servers send no flags at all: permanent, the fail-open default.
    assert.equal(liveHexLayer({}, false), 'permanent')
})

test('a live mobile hex joins the mobile layer only when mobile coverage is included', () => {
    assert.equal(liveHexLayer({ permanent: false, mobile: true }, true), 'mobile')
    assert.equal(liveHexLayer({ permanent: false, mobile: true }, false), 'drop')
})

test('a live hex heard only by a bench (or unknown) gateway is dropped', () => {
    assert.equal(liveHexLayer({ permanent: false, mobile: false }, true), 'drop')
    // A server that predates the mobile flag: non-permanent is not mobile.
    assert.equal(liveHexLayer({ permanent: false }, true), 'drop')
})

test('markers: permanent gateways with a position, nothing else', () => {
    const at = { lat: 27.1, lng: -114.3 }
    assert.equal(showsGatewayMarker({ ...at, location_phase: 'permanent' }), true)
    // Missing location_phase (older app API) is permanent, fail-open.
    assert.equal(showsGatewayMarker({ ...at }), true)
    assert.equal(showsGatewayMarker({ ...at, location_phase: 'bench_test' }), false)
    // Mobile gateways have no fixed position, and their phase is null.
    assert.equal(showsGatewayMarker({ lat: null, lng: null, location_phase: null, mobile: true }), false)
    assert.equal(showsGatewayMarker({ ...at, location_phase: null, mobile: true }), false)
    assert.equal(showsGatewayMarker({ lat: null, lng: null, location_phase: 'permanent' }), false)
})

test('mobile hexes merge one per id: repeats and fetch-vs-live overlap never stack', () => {
    const hex = (id) => ({ id, type: 'Feature' })
    const merged = mergeHexFeatures([hex('a'), hex('b')], [hex('b'), hex('c'), hex('c')])
    assert.deepEqual(merged.features.map(f => f.id).sort(), ['a', 'b', 'c'])
    assert.equal(merged.type, 'FeatureCollection')
    assert.deepEqual(mergeHexFeatures(undefined, [hex('a')]).features.map(f => f.id), ['a'])
})

test('included mobile hexes join the coverage source itself (same colors, hover, selection)', () => {
    const hex = (id) => ({ id, type: 'Feature' })
    const base = { type: 'FeatureCollection', features: [hex('p1'), hex('p2')] }
    const mobile = { type: 'FeatureCollection', features: [hex('m1'), hex('p2')] }

    assert.equal(coverageFeatures(base, mobile, false), base)
    assert.deepEqual(coverageFeatures(base, mobile, true).features.map(f => f.id).sort(), ['m1', 'p1', 'p2'])
})
