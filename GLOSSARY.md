# Buoy.Fish Coverage Mapper — Context

The coverage mapper visualizes where Buoy.Fish devices have been heard over the
air. This glossary fixes the vocabulary for the **Timeline** feature — letting a
viewer scrub through time and watch confirmed coverage grow — whose primary
audience is investors being shown the real, over-the-air footprint built to date.

## Language

**Coverage**:
The set of hexes where at least one device uplink was confirmed heard by a
gateway over the air. Always means *confirmed, real* reception — never modeled
or predicted.
_Avoid_: Reception, signal map (when you mean the confirmed footprint).

**Permanent coverage (the default view)**:
Coverage restricted to hexes with at least one contributor that is a
permanently-installed gateway, plus device-GPS-only hexes (uplinks recorded
without a usable gateway position — still confirmed, real reception). This is
what the map and Timeline serve by default (`scope=permanent`). Hexes heard
only by mobile or bench/test gateways are excluded from the default footprint
and visible via the "Show mobile gateway hexes" inspection toggle
(`scope=other`).
_Avoid_: Calling the default view "all coverage" — it is deliberately the
installed footprint.

**Hex**:
A single H3 resolution-9 cell. The atomic unit of coverage.
_Avoid_: Tile, cell, hexagon.

**First-seen**:
For a given hex, the earliest moment it became covered — the timestamp of the
oldest uplink linked to that hex. A hex has exactly one first-seen.
_Avoid_: Created-at, discovered-at.

**Cumulative coverage (as-of T)**:
All hexes whose first-seen is at or before instant T. This is what "coverage at
a point in time" means: coverage only ever grows as T advances — a hex mapped in
January is still part of the footprint in March.
_Avoid_: Snapshot (ambiguous — could imply activity-on-that-day-only, which this
is explicitly NOT).

**Baseline coverage**:
The hexes first-seen *before* a selected range's start — the pre-existing
footprint the animation builds on top of. Shown beneath the bloom by default,
and hideable via a toggle so the user can stage a blank-start animation for any
later period.

**Bloom**:
The animated reveal of in-range hexes (first-seen within the selected
[start, end]) as the cursor advances from start to end. The "coverage growing"
visual.

**Timeline cursor** (playhead):
The instant currently being shown. What renders is cumulative coverage as-of the
cursor. Playing sweeps the cursor start→end (the bloom); pausing/dragging it to
an instant is the "coverage as of this day" view. A single unified control with
a start handle, end handle, and playhead; handles default to all-time on entry.
_Avoid_: Scrubber, slider (those name the widget; "cursor" names the instant).

## Flagged ambiguities

- **"Coverage at time T"** was ambiguous between *cumulative-as-of-T* (the map as
  it looked by end of T) and *activity-on-T-only* (hexes active that day, which
  appear and disappear). Resolved to **cumulative-as-of-T** for both the
  single-date and date-range modes. See ADR on cumulative reveal semantics.
