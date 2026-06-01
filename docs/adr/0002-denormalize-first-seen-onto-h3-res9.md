# Denormalize first-seen onto h3_res9

## Context

The Timeline feature needs each hex's **first-seen** instant (see ADR-0001).
`h3_res9.inserted_at` exists but is **ingest time, not over-the-air time** — the
backfill tasks insert historical hexes at run time, so it misreports when
coverage was actually established. The true first-seen is the earliest
`uplinks.first_timestamp` among the uplinks linked to the hex.

Two ways to source it:
- **Compute-on-read:** `MIN(uplinks.first_timestamp)` grouped by hex via
  `h3_links` on every Timeline open. No schema/ingest change, but re-scans the
  entire (ever-growing) uplink history each time.
- **Denormalize:** store `first_seen` on the per-hex `h3_res9` row.

## Decision

Add a `first_seen` column to `h3_res9` and maintain it at write time in
`Mappers.H3.create/1`:
- **New-hex branch:** set `first_seen` from the ingesting uplink's timestamp.
- **Existing-hex branch:** lower `first_seen` if an earlier uplink arrives —
  a keep-**min**, mirroring the existing keep-**max** logic for `best_rssi`.
  This keeps it correct under out-of-order and backfilled uplinks.

Backfill the column once with the compute-on-read query. The Timeline endpoint
then serves it with a flat `SELECT id, first_seen, best_rssi FROM h3_res9` — one
row per hex, same cost as `/api/v1/hexes`.

We rejected compute-on-read: it scales with total uplinks (not hexes) and
re-aggregates on every open. `h3_res9` already maintains `best_rssi` at write
time; `first_seen` is the symmetric fact and belongs beside it.

## Consequences

- Edits the freshly-split ingest pipeline — the keep-min addition is small and
  mirrors existing keep-max, but it touches the path that captures live coverage,
  so it warrants care and tests.
- Requires a one-time backfill; until it runs, `first_seen` is null for existing
  hexes.
- `first_seen` is over-the-air time (uplink timestamp), never `inserted_at`.
