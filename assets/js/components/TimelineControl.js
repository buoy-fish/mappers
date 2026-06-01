import * as React from 'react';
import { useRef, useCallback } from 'react';

// ============================================================================
// TimelineControl — scrub-and-play widget for the coverage Timeline feature.
// ----------------------------------------------------------------------------
// Vocabulary (see CONTEXT.md):
//   - Cumulative coverage as-of T: all hexes with first_seen <= T.
//   - Baseline: hexes with first_seen < rangeStart (dimmed beneath the bloom).
//   - Bloom:    in-range hexes (rangeStart <= first_seen <= cursor) revealing
//               as the cursor advances.
//   - Cursor/playhead: the instant currently shown; continuous epoch-ms.
//
// All control STATE lives in Map.js and is passed down here as props, so the
// two timeline Layers' filters stay declarative props driven by rangeStart /
// cursor. This component is the presentation + interaction layer only.
//
// Track domain mapping (commented at each use site):
//   - The two range HANDLES map over the full data domain [minT, maxT]: a
//     handle's pixel x = ((handleT - minT) / (maxT - minT)) * trackWidth.
//   - The PLAYHEAD maps over the selected range [rangeStart, rangeEnd] for its
//     own travel, but we draw it on the SAME track as the handles (full domain)
//     so the visual stays consistent — playhead pixel x uses the [minT,maxT]
//     mapping too. Scrubbing (click/drag on the track) converts pixel -> time
//     in [minT,maxT] then CLAMPS into [rangeStart, rangeEnd] (the cursor can
//     only live inside the selected range).
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// Snap an epoch-ms instant to LOCAL midnight (start of that calendar day in the
// browser's timezone).
export function startOfLocalDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

// Snap to the LAST millisecond of the local calendar day containing t.
export function endOfLocalDay(t) {
    const d = new Date(t);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
}

function fmtDate(t) {
    // Browser-local short date, e.g. "5/31/2026" in en-US. No timezone selector.
    return new Date(t).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

function TimelineControl(props) {
    const {
        minT, maxT,
        rangeStart, rangeEnd, cursor,
        playing, speed, showBaseline,
        inRangeCount,
        onSetRangeStart, onSetRangeEnd,
        onSetCursor, onTogglePlay, onSetSpeed, onToggleBaseline,
    } = props;

    const trackRef = useRef(null);
    // Which thing is being dragged: 'start' | 'end' | 'playhead' | null.
    const dragRef = useRef(null);

    // Track domain is day-snapped so whole-day-snapped handles map exactly to 0%-100%.
    const domainMin = startOfLocalDay(minT);
    const domainMax = endOfLocalDay(maxT);
    const domainSpan = Math.max(1, domainMax - domainMin); // guard divide-by-zero

    // time -> fraction [0,1] across the full data domain.
    const tToFrac = useCallback((t) => (t - domainMin) / domainSpan, [domainMin, domainSpan]);

    // A clientX pixel -> epoch-ms over the full data domain [domainMin, domainMax].
    const pxToTime = useCallback((clientX) => {
        const el = trackRef.current;
        if (!el) return domainMin;
        const rect = el.getBoundingClientRect();
        let frac = (clientX - rect.left) / Math.max(1, rect.width);
        frac = Math.min(1, Math.max(0, frac));
        return domainMin + frac * domainSpan;
    }, [domainMin, domainSpan]);

    const onPointerMove = useCallback((e) => {
        const mode = dragRef.current;
        if (!mode) return;
        const t = pxToTime(e.clientX);
        if (mode === 'start') {
            // Snap to local midnight; constrain to [minT, rangeEnd].
            let v = startOfLocalDay(t);
            if (v < startOfLocalDay(minT)) v = startOfLocalDay(minT);
            if (v > rangeEnd) v = startOfLocalDay(rangeEnd);
            onSetRangeStart(v);
        } else if (mode === 'end') {
            // Snap to local end-of-day; constrain to [rangeStart, maxT].
            let v = endOfLocalDay(t);
            if (v > endOfLocalDay(maxT)) v = endOfLocalDay(maxT);
            if (v < rangeStart) v = endOfLocalDay(rangeStart);
            onSetRangeEnd(v);
        } else if (mode === 'playhead') {
            // Scrub: clamp the continuous instant into the selected range.
            let v = Math.min(rangeEnd, Math.max(rangeStart, t));
            onSetCursor(v);
        }
    }, [pxToTime, minT, maxT, rangeStart, rangeEnd, onSetRangeStart, onSetRangeEnd, onSetCursor]);

    const endDrag = useCallback(() => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', endDrag);
    }, [onPointerMove]);

    const startDrag = useCallback((mode) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = mode;
        // Dragging the playhead pauses playback (scrub = manual control).
        if (mode === 'playhead' && playing) onTogglePlay();
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', endDrag);
    }, [onPointerMove, endDrag, playing, onTogglePlay]);

    // Clicking the track body (not a handle) moves the cursor to that instant.
    const onTrackClick = useCallback((e) => {
        if (dragRef.current) return; // ignore the click that ends a drag
        const t = pxToTime(e.clientX);
        const v = Math.min(rangeEnd, Math.max(rangeStart, t));
        if (playing) onTogglePlay();
        onSetCursor(v);
    }, [pxToTime, rangeStart, rangeEnd, playing, onTogglePlay, onSetCursor]);

    const startPct = tToFrac(rangeStart) * 100;
    const endPct = tToFrac(rangeEnd) * 100;
    const cursorPct = tToFrac(cursor) * 100;
    const rangeWidthPct = Math.max(0, endPct - startPct);

    return (
        <div className="timeline-control">
            <div className="timeline-control-row">
                <button
                    className="timeline-playpause"
                    onClick={onTogglePlay}
                    aria-label={playing ? 'Pause' : 'Play'}
                    title={playing ? 'Pause' : 'Play'}
                >
                    {playing ? '❚❚' : '▶'}
                </button>

                <div className="timeline-track-wrap">
                    <div
                        className="timeline-track"
                        ref={trackRef}
                        onClick={onTrackClick}
                    >
                        {/* Selected range highlight (rangeStart..rangeEnd) */}
                        <div
                            className="timeline-range-fill"
                            style={{ left: startPct + '%', width: rangeWidthPct + '%' }}
                        />
                        {/* Playhead marker at the cursor instant */}
                        <div
                            className="timeline-playhead"
                            style={{ left: cursorPct + '%' }}
                            onPointerDown={startDrag('playhead')}
                            title={'Cursor: ' + fmtDate(cursor)}
                        />
                        {/* Range handles (drag to redefine the window) */}
                        <div
                            className="timeline-handle timeline-handle-start"
                            style={{ left: startPct + '%' }}
                            onPointerDown={startDrag('start')}
                            title={'Range start: ' + fmtDate(rangeStart)}
                        />
                        <div
                            className="timeline-handle timeline-handle-end"
                            style={{ left: endPct + '%' }}
                            onPointerDown={startDrag('end')}
                            title={'Range end: ' + fmtDate(rangeEnd)}
                        />
                    </div>
                    <div className="timeline-labels">
                        <span className="timeline-label-start">{fmtDate(rangeStart)}</span>
                        <span className="timeline-label-cursor">{fmtDate(cursor)}</span>
                        <span className="timeline-label-end">{fmtDate(rangeEnd)}</span>
                    </div>
                </div>

                <div className="timeline-speed">
                    {[1, 2, 4].map(s => (
                        <button
                            key={s}
                            className={'timeline-speed-btn' + (speed === s ? ' active' : '')}
                            onClick={() => onSetSpeed(s)}
                        >{s}×</button>
                    ))}
                </div>
            </div>

            <div className="timeline-control-row timeline-control-row-secondary">
                <label className="gateway-toggle timeline-baseline-toggle">
                    <button
                        role="switch"
                        aria-checked={showBaseline}
                        onClick={onToggleBaseline}
                        className={`gateway-switch ${showBaseline ? 'active' : ''}`}
                    >
                        <span className="gateway-switch-knob" />
                    </button>
                    <span>Show baseline</span>
                </label>
                {inRangeCount === 0 &&
                    <span className="timeline-empty-caption">No new coverage in this range</span>
                }
            </div>
        </div>
    );
}

export default TimelineControl;
