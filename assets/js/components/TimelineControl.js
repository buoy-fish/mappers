import * as React from 'react';
import { useRef, useCallback, useState } from 'react';

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

// Crisp line-art SVG icons (24×24 viewBox, stroke-based, currentColor) for the
// frosted-glass FAB cluster. Defined once so the minimized and expanded views
// share identical glyphs.
const IconClock = (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
    </svg>
);
const IconReplay = (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v4h4" />
    </svg>
);
const IconClose = (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);
const IconPlay = (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M8 5v14l11-7z" />
    </svg>
);
const IconPause = (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
);

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
        onPlayAgain,
        onExit,
    } = props;

    // The bar starts MINIMIZED: just the clock / replay / close FAB cluster. The
    // clock toggles the full scrubber open. This keeps the auto-played bloom
    // unobstructed by default; the full controls are one click away.
    const [expanded, setExpanded] = useState(false);

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

    // The clock / replay / close frosted-glass FAB cluster. Shared between the
    // minimized and expanded views. In the minimized view the clock opens the
    // bar; in the expanded view it collapses it again (always .active there).
    const fabCluster = (
        <div className="timeline-fab-cluster">
            <button
                type="button"
                className={'timeline-fab' + (expanded ? ' active' : '')}
                onClick={() => setExpanded(e => !e)}
                aria-label={expanded ? 'Hide timeline scrubber' : 'Show timeline scrubber'}
                aria-expanded={expanded}
                title={expanded ? 'Hide timeline scrubber' : 'Show timeline scrubber'}
            >{IconClock}</button>
            <button
                type="button"
                className="timeline-fab"
                onClick={onPlayAgain}
                aria-label="Play again"
                title="Play again"
            >{IconReplay}</button>
            <button
                type="button"
                className="timeline-fab"
                onClick={onExit}
                aria-label="Exit timeline"
                title="Exit timeline"
            >{IconClose}</button>
        </div>
    );

    // Minimized view: floating FAB cluster only, plus the empty-state caption
    // when there's no new coverage in the current range.
    if (!expanded) {
        return (
            <div className="timeline-control timeline-control-mini">
                {fabCluster}
                {inRangeCount === 0 &&
                    <span className="timeline-empty-caption">No new coverage in this range</span>
                }
            </div>
        );
    }

    return (
        <div className="timeline-control">
            <div className="timeline-control-row">
                <button
                    type="button"
                    className={'timeline-fab' + (playing ? ' active' : '')}
                    onClick={onTogglePlay}
                    aria-label={playing ? 'Pause' : 'Play'}
                    title={playing ? 'Pause' : 'Play'}
                >
                    {playing ? IconPause : IconPlay}
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

                {/* Collapse (clock) / play-again (replay) / exit (close) FAB
                    cluster. The clock here acts as a collapse toggle back to the
                    minimized view (rendered .active to signal "expanded"). */}
                {fabCluster}
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
