// Unit tests for the Timeline deep-link codec. Run with `npm test --prefix assets`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTimelineLink, buildTimelineLink } from '../js/utils/timelineLink.js'

// GLOSSARY "Baseline coverage": shown beneath the bloom BY DEFAULT, so the end
// of a timeline matches the live map. A link that doesn't say otherwise must
// show it.
test('baseline defaults on when the link omits it', () => {
    assert.equal(parseTimelineLink('?play=gulf-of-nicoya').baseline, true)
})

test('an empty or unrecognised baseline value keeps the default', () => {
    assert.equal(parseTimelineLink('?play=gulf-of-nicoya&baseline=').baseline, true)
    assert.equal(parseTimelineLink('?play=gulf-of-nicoya&baseline=yes').baseline, true)
    assert.equal(parseTimelineLink('?play=gulf-of-nicoya&baseline=false').baseline, false)
})

test('baseline=0 still hides it (blank-start animation)', () => {
    assert.equal(parseTimelineLink('?play=gulf-of-nicoya&baseline=0').baseline, false)
    assert.equal(parseTimelineLink('?play=gulf-of-nicoya&baseline=1').baseline, true)
})

test('baseline round-trips through build -> parse', () => {
    for (const baseline of [true, false]) {
        const url = buildTimelineLink({
            projectCode: 'gulf-of-nicoya', rangeStart: new Date(2026, 8, 19).getTime(),
            rangeEnd: new Date(2026, 10, 18).getTime(), speed: 1, baseline,
        }, 'https://map.buoy.fish')
        assert.equal(parseTimelineLink(new URL(url).search).baseline, baseline)
    }
})
