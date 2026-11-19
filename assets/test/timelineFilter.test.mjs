// Semantics of the timeline layer's MapLibre filter. Run with `npm test --prefix assets`.
// A tiny evaluator covers the operators the filter uses, so these assert which
// hexes draw rather than the expression's shape.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timelineRevealFilter } from '../js/components/Layers.js'

function evalExpr(e, props) {
    if (!Array.isArray(e)) return e
    const [op, ...a] = e
    const v = x => evalExpr(x, props)
    switch (op) {
        case 'get': return props[a[0]]
        case 'all': return a.every(v)
        case 'any': return a.some(v)
        case '<': return v(a[0]) < v(a[1])
        case '<=': return v(a[0]) <= v(a[1])
        case '>=': return v(a[0]) >= v(a[1])
        default: throw new Error(`unsupported op ${op}`)
    }
}
const drawn = (filter, firstSeens) => firstSeens.filter(t => evalExpr(filter, { first_seen: t }))

const START = 100, CURSOR = 150
const HEXES = [10, 99, 100, 150, 151, 200]

test('baseline on: cumulative coverage as-of the cursor', () => {
    assert.deepEqual(drawn(timelineRevealFilter({ rangeStart: START, cursor: CURSOR, showBaseline: true }), HEXES),
        [10, 99, 100, 150])
})

test('baseline on, cursor left behind the start handle: all pre-start hexes still draw', () => {
    // Start handle dragged past a paused playhead (cursor 50 < start 100).
    assert.deepEqual(drawn(timelineRevealFilter({ rangeStart: START, cursor: 50, showBaseline: true }), HEXES),
        [10, 99])
})

test('baseline off: only the bloom', () => {
    assert.deepEqual(drawn(timelineRevealFilter({ rangeStart: START, cursor: CURSOR, showBaseline: false }), HEXES),
        [100, 150])
})
