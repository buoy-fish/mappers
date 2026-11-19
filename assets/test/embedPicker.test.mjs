// map.buoy.fish embedded in app.buoy.fish as the projects' "Default map view"
// picker: the real public map, reporting its camera to the app and taking
// fly-to requests from it. Run with `npm test --prefix assets`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEmbedPicker, isAllowedParentOrigin, cameraMessage, parseFlyMessage } from '../js/utils/embedPicker.js'

test('?embed=picker carries the starting camera', () => {
    assert.deepEqual(parseEmbedPicker('?embed=picker&lat=10.07&lng=-85.03&zoom=8.3'), { lat: 10.07, lng: -85.03, zoom: 8.3 })
})

test('a picker without (valid) coordinates still embeds, camera unset', () => {
    assert.deepEqual(parseEmbedPicker('?embed=picker'), { lat: null, lng: null, zoom: null })
    assert.deepEqual(parseEmbedPicker('?embed=picker&lat=99&lng=x&zoom=40'), { lat: null, lng: null, zoom: null })
})

test('not an embed', () => {
    assert.equal(parseEmbedPicker(''), null)
    assert.equal(parseEmbedPicker('?play=nova-scotia'), null)
    assert.equal(parseEmbedPicker('?embed=other'), null)
})

test('only the app may talk to the picker', () => {
    assert.ok(isAllowedParentOrigin('https://app.buoy.fish', 'https://app.buoy.fish', 'map.buoy.fish'))
    assert.ok(!isAllowedParentOrigin('https://evil.example', 'https://app.buoy.fish', 'map.buoy.fish'))
    assert.ok(!isAllowedParentOrigin('http://localhost:4031', 'https://app.buoy.fish', 'map.buoy.fish'))
    assert.ok(!isAllowedParentOrigin(null, 'https://app.buoy.fish', 'map.buoy.fish'))
})

test('a local map accepts a local app on any port', () => {
    assert.ok(isAllowedParentOrigin('http://localhost:4031', 'https://app.buoy.fish', 'localhost'))
    assert.ok(isAllowedParentOrigin('http://127.0.0.1:4000', 'https://app.buoy.fish', '127.0.0.1'))
    assert.ok(!isAllowedParentOrigin('https://evil.example', 'https://app.buoy.fish', 'localhost'))
})

test('the camera message is rounded and typed', () => {
    assert.deepEqual(cameraMessage({ latitude: 10.0714851, longitude: -85.0319651, zoom: 8.3456 }),
        { type: 'buoy-map:camera', lat: 10.07149, lng: -85.03197, zoom: 8.35 })
})

test('fly-to requests are validated', () => {
    assert.deepEqual(parseFlyMessage({ type: 'buoy-map:fly', lat: 10, lng: -85, zoom: 9 }), { lat: 10, lng: -85, zoom: 9 })
    assert.equal(parseFlyMessage({ type: 'buoy-map:fly', lat: 100, lng: -85, zoom: 9 }), null)
    assert.equal(parseFlyMessage({ type: 'other', lat: 10, lng: -85, zoom: 9 }), null)
    assert.equal(parseFlyMessage('buoy-map:fly'), null)
})

test('the camera message wraps longitude and clamps zoom, so the app can always replay it', () => {
    assert.deepEqual(cameraMessage({ latitude: 10, longitude: 195.3, zoom: -1.2 }),
        { type: 'buoy-map:camera', lat: 10, lng: -164.7, zoom: 0 })
    assert.deepEqual(cameraMessage({ latitude: 10, longitude: -190, zoom: 23 }),
        { type: 'buoy-map:camera', lat: 10, lng: 170, zoom: 22 })
})
