# Timeline coverage animation reveals client-side

## Context

The Timeline feature lets a viewer scrub through time and watch confirmed
coverage grow — primarily to show investors the real, over-the-air footprint
built to date. Coverage is **cumulative**: a hex appears at its `first-seen`
instant and stays. For this feature each hex carries a single `first-seen`
timestamp plus its all-time `best_rssi`; per-hex evolution (redundancy/RSSI
deepening over time) is explicitly **out of scope** here and deferred to a
separate effort.

## Decision

The server returns the **whole set of hexes** for the selected range in one
response, each tagged with `first-seen` (epoch ms) and `best_rssi`. The browser
holds them all and animates by advancing a time cursor, revealing hexes via a
MapLibre filter expression (`first-seen ≤ cursor`). One request per range
selection; the animation then runs entirely client-side.

We rejected **server-side time-slicing** (client requests N per-window snapshots,
server aggregates each). It makes animation smoothness hostage to per-frame
request latency and adds server complexity, with no payoff at this scale.

## Why it holds at this scale

The all-time footprint is ~5.4k hexes / 2.4 MB today and renders fine. A
`first-seen`+`best_rssi` row is smaller than what `/api/v1/hexes` already ships
(send the H3 index, compute the polygon client-side as the `h3:new` channel
does), so the full dataset fits in a single payload.

## Escape hatch

A single payload eventually strains if the footprint grows ~100× or ranges span
years. If that day comes, revisit with a hex cap, server-side simplification, or
tiled delivery — not by abandoning client-side reveal for sub-100k-hex views.
