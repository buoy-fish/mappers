// Unit tests for the Timeline deep-link codec (assets/js/utils/timelineLink.js).
//
// Run with `npm test --prefix assets` (node:test — no runner dependency).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTimelineLink, parseTimelineLink, parseLocalYMD } from '../js/utils/timelineLink.js'

test('no play param means not a timeline link', () => {
    assert.equal(parseTimelineLink('?start=2026-09-01'), null)
    assert.equal(parseTimelineLink(''), null)
})

test('baseline defaults to on when the param is absent', () => {
    assert.equal(parseTimelineLink('?play=gulf-of-nicoya-costa-rica').baseline, true)
    assert.equal(parseTimelineLink('?play=x&baseline=').baseline, true)
})

test('an explicit baseline=0 or false still turns the baseline off', () => {
    assert.equal(parseTimelineLink('?play=x&baseline=0').baseline, false)
    assert.equal(parseTimelineLink('?play=x&baseline=false').baseline, false)
    assert.equal(parseTimelineLink('?play=x&baseline=1').baseline, true)
})

test('loop and open still default to off', () => {
    const intent = parseTimelineLink('?play=x')
    assert.equal(intent.loop, false)
    assert.equal(intent.open, false)
})

test('round-trip preserves the baseline flag either way', () => {
    const state = {
        projectCode: 'gulf-of-nicoya-costa-rica',
        rangeStart: parseLocalYMD('2026-09-01'),
        rangeEnd: parseLocalYMD('2026-11-13'),
        speed: 2, loop: true, open: false, lat: 10.07, lng: -85.03, zoom: 8.3,
    }
    for (const baseline of [true, false]) {
        const url = buildTimelineLink({ ...state, baseline }, 'https://map.buoy.fish')
        const intent = parseTimelineLink(new URL(url).search)
        assert.equal(intent.baseline, baseline)
        assert.equal(intent.play, state.projectCode)
        assert.equal(intent.start, state.rangeStart)
        assert.equal(intent.end, state.rangeEnd)
        assert.equal(intent.speed, 2)
        assert.equal(intent.loop, true)
    }
})

test('missing start leaves it null so Map.js can resolve it from the data', () => {
    assert.equal(parseTimelineLink('?play=x').start, null)
})
