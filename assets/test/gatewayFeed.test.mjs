// Unit tests for the gateway feed helpers Map.js applies to every
// /api/v1/gateways response, on mount and on each refresh.
//
// Run with `npm test --prefix assets` (node:test — no runner dependency).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gatewayFeatures, gatewayRecordsIndex, refreshPopupGw, applyHeardToFeatures, applyHeardToPopup, keepNewerHeard } from '../js/utils/gatewayFeed.js'

const PUNTA_PRIETA = {
    gateway_eui: '0016c001f10b0bc8',
    hotspot_name: 'Punta Prieta Product Receiving Plant',
    lat: 27.0143,
    lng: -114.0426,
    last_heard: '2026-10-30T15:56:35.741900Z',
    role: 'standard',
    altitude: 20,
    concentrator_ids: [],
    location_phase: 'permanent',
}

test('markers show permanent gateways, and a missing phase counts as permanent', () => {
    const features = gatewayFeatures({
        gateways: [
            PUNTA_PRIETA,
            { ...PUNTA_PRIETA, gateway_eui: 'older-api', location_phase: undefined },
            { ...PUNTA_PRIETA, gateway_eui: 'bench', location_phase: 'bench_test' },
            { ...PUNTA_PRIETA, gateway_eui: 'boat', location_phase: 'mobile' },
        ],
    })

    assert.deepEqual(features.map(f => f.properties.gateway_eui), ['0016c001f10b0bc8', 'older-api'])
})

test('hex tables resolve a name by EUI or concentrator id, bench and mobile gateways included', () => {
    const record = {
        name: 'Bench Rig',
        gateway_eui: 'ac1f09fffe21c379',
        concentrator_ids: ['0016c001f1383e4b', 'a05a3035dff9cab5'],
    }

    const records = gatewayRecordsIndex({
        gateways: [
            { ...PUNTA_PRIETA, hotspot_name: 'Bench Rig', gateway_eui: record.gateway_eui, concentrator_ids: record.concentrator_ids, location_phase: 'bench_test' },
            { ...PUNTA_PRIETA, hotspot_name: null, gateway_eui: 'nameless' },
        ],
    })

    assert.deepEqual(records, {
        ac1f09fffe21c379: record,
        '0016c001f1383e4b': record,
        a05a3035dff9cab5: record,
    })
})

test('an open popup picks up the new last-heard time and keeps its place and pin', () => {
    const popup = {
        lng: -114.0426,
        lat: 27.0143,
        pinned: true,
        gw: { gateway_eui: '0016c001f10b0bc8', name: 'Punta Prieta Product Receiving Plant', last_heard: '2026-10-29T19:59:00Z' },
    }

    const refreshed = refreshPopupGw(popup, gatewayFeatures({ gateways: [PUNTA_PRIETA] }))

    assert.equal(refreshed.gw.last_heard, '2026-10-30T15:56:35.741900Z')
    assert.equal(refreshed.pinned, true)
    assert.equal(refreshed.lng, -114.0426)
    assert.equal(refreshed.lat, 27.0143)
})

test('an open popup follows its gateway when the coordinates are corrected', () => {
    const popup = { lng: -100, lat: 20, pinned: true, gw: { gateway_eui: '0016c001f10b0bc8', last_heard: null } }

    const refreshed = refreshPopupGw(popup, gatewayFeatures({ gateways: [PUNTA_PRIETA] }))

    assert.equal(refreshed.lng, -114.0426)
    assert.equal(refreshed.lat, 27.0143)
})

test('a popup closes when its gateway is gone from the refresh, rather than aging a frozen time', () => {
    const popup = { lng: 1, lat: 2, pinned: true, gw: { gateway_eui: 'gone', last_heard: '2026-10-29T19:59:00Z' } }

    assert.equal(refreshPopupGw(popup, gatewayFeatures({ gateways: [PUNTA_PRIETA] })), null)
})

test('a popup for a gateway with no EUI never takes on another EUI-less gateway', () => {
    const popup = { lng: 1, lat: 2, pinned: true, gw: { gateway_eui: null, name: 'First', last_heard: null } }
    const other = { ...PUNTA_PRIETA, gateway_eui: null, hotspot_name: 'Second' }

    assert.equal(refreshPopupGw(popup, gatewayFeatures({ gateways: [other] })), popup)
})

test('no open popup stays no popup', () => {
    assert.equal(refreshPopupGw(null, gatewayFeatures({ gateways: [PUNTA_PRIETA] })), null)
})

test('a gateway_heard message moves that gateway\'s last-heard time and no other', () => {
    const other = { ...PUNTA_PRIETA, gateway_eui: 'other', last_heard: '2026-10-30T10:00:00Z' }
    const features = gatewayFeatures({ gateways: [PUNTA_PRIETA, other] })

    const updated = applyHeardToFeatures(features, [{ gateway_eui: PUNTA_PRIETA.gateway_eui, last_heard: '2026-10-30T18:17:25.000000Z' }])

    assert.equal(updated[0].properties.last_heard, '2026-10-30T18:17:25.000000Z')
    assert.equal(updated[0].properties.name, 'Punta Prieta Product Receiving Plant')
    assert.deepEqual(updated[0].geometry, features[0].geometry)
    assert.equal(updated[1], features[1])
})

test('a late gateway_heard message never moves the time backward', () => {
    const features = gatewayFeatures({ gateways: [PUNTA_PRIETA] })

    assert.equal(applyHeardToFeatures(features, [{ gateway_eui: PUNTA_PRIETA.gateway_eui, last_heard: '2026-10-30T15:00:00.000000Z' }]), features)
})

test('the first gateway_heard message gives a never-heard gateway its time', () => {
    const features = gatewayFeatures({ gateways: [{ ...PUNTA_PRIETA, last_heard: null }] })

    const updated = applyHeardToFeatures(features, [{ gateway_eui: PUNTA_PRIETA.gateway_eui, last_heard: '2026-10-30T15:00:00.000000Z' }])

    assert.equal(updated[0].properties.last_heard, '2026-10-30T15:00:00.000000Z')
})

test('a gateway_heard message for a gateway not on the map changes nothing, so the map skips a redraw', () => {
    const features = gatewayFeatures({ gateways: [PUNTA_PRIETA] })

    assert.equal(applyHeardToFeatures(features, [{ gateway_eui: 'bench', last_heard: '2026-10-30T18:00:00Z' }]), features)
})

test('an open popup follows a gateway_heard message and keeps its place and pin', () => {
    const popup = { lng: -114.0426, lat: 27.0143, pinned: true, gw: { gateway_eui: PUNTA_PRIETA.gateway_eui, name: 'Punta Prieta', last_heard: '2026-10-29T19:59:00Z' } }

    const updated = applyHeardToPopup(popup, [{ gateway_eui: PUNTA_PRIETA.gateway_eui, last_heard: '2026-10-30T18:17:25.000000Z' }])

    assert.equal(updated.gw.last_heard, '2026-10-30T18:17:25.000000Z')
    assert.equal(updated.gw.name, 'Punta Prieta')
    assert.equal(updated.pinned, true)
    assert.equal(updated.lng, -114.0426)
})

test('a popup for another gateway, or no popup, is left alone by a gateway_heard message', () => {
    const heard = [{ gateway_eui: PUNTA_PRIETA.gateway_eui, last_heard: '2026-10-30T18:17:25.000000Z' }]
    const popup = { lng: 1, lat: 2, pinned: true, gw: { gateway_eui: 'other', last_heard: null } }

    assert.equal(applyHeardToPopup(popup, heard), popup)
    assert.equal(applyHeardToPopup(null, heard), null)
})

test('a reload that started before a gateway_heard message can\'t move that time backward', () => {
    const live = applyHeardToFeatures(gatewayFeatures({ gateways: [PUNTA_PRIETA] }), [{ gateway_eui: PUNTA_PRIETA.gateway_eui, last_heard: '2026-10-30T18:17:25.000000Z' }])
    const staleSnapshot = gatewayFeatures({ gateways: [PUNTA_PRIETA] })

    assert.equal(keepNewerHeard(staleSnapshot, live)[0].properties.last_heard, '2026-10-30T18:17:25.000000Z')
})

test('a reload with a newer time wins, and gateways without an EUI never borrow each other\'s time', () => {
    const older = gatewayFeatures({ gateways: [{ ...PUNTA_PRIETA, last_heard: '2026-10-30T10:00:00Z' }, { ...PUNTA_PRIETA, gateway_eui: null, last_heard: '2026-10-30T23:00:00Z' }] })
    const reloaded = gatewayFeatures({ gateways: [PUNTA_PRIETA, { ...PUNTA_PRIETA, gateway_eui: null, last_heard: null }] })

    const kept = keepNewerHeard(reloaded, older)

    assert.equal(kept[0].properties.last_heard, PUNTA_PRIETA.last_heard)
    assert.equal(kept[1].properties.last_heard, null)
})

test('a reload that started before a gateway_heard message can\'t move an open popup backward', () => {
    const popup = { lng: -114.0426, lat: 27.0143, pinned: true, gw: { gateway_eui: PUNTA_PRIETA.gateway_eui, last_heard: '2026-10-30T18:17:25.000000Z' } }

    const refreshed = refreshPopupGw(popup, gatewayFeatures({ gateways: [PUNTA_PRIETA] }))

    assert.equal(refreshed.gw.last_heard, '2026-10-30T18:17:25.000000Z')
    assert.equal(refreshed.gw.name, 'Punta Prieta Product Receiving Plant')
})

test('a popup keeps its place when its gateway loses its coordinates, since a null position would crash the map', () => {
    const popup = { lng: -114.0426, lat: 27.0143, pinned: true, gw: { gateway_eui: PUNTA_PRIETA.gateway_eui, last_heard: null } }

    const refreshed = refreshPopupGw(popup, gatewayFeatures({ gateways: [{ ...PUNTA_PRIETA, lat: null, lng: null }] }))

    assert.equal(refreshed.lng, -114.0426)
    assert.equal(refreshed.lat, 27.0143)
    assert.equal(refreshed.gw.last_heard, PUNTA_PRIETA.last_heard)
})
