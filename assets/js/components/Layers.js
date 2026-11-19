export const uplinkTileServerLayer = {
    id: 'public.h3_res9',
    type: 'fill',
    paint: {
        'fill-color': [
            'case',
            ['boolean',
                ['feature-state', 'selected'], true],
            ['interpolate',
                ['linear'],
                ['get', 'best_rssi'],
                -120,
                'rgba(255,152,0,0.15)',
                -100,
                'rgba(255,152,0,0.5)',
                -80,
                'rgba(255,152,0,0.85)']
            ,
            '#b67ffe'
        ],
        'fill-opacity': 0.9,
        'fill-outline-color': [
            'case',
            ['boolean',
                ['feature-state', 'selected'], true],
            'rgba(255,152,0,0.5)',
            '#ffffff'
        ]
    }
};

export const hotspotTileServerLayer = {
    id: 'hg.gateways-rewarded-r8.hexes',
    type: 'fill',
    paint: {
        'fill-color': '#ffffff',
        'fill-outline-color': '#fafbfd',
        'fill-opacity': 0.15,
    }
};

export const uplinkHotspotsLineLayer = {
    id: 'uplinkHotspotsLineLayer',
    type: 'line',
    filter: ['!=', ['get', 'is_mesh'], true],
    layout: {
        'line-join': 'round',
        'line-cap': 'round'
    },
    paint: {
        'line-color': '#d8d51d',
        'line-width': 2
    }
};

export const uplinkRelayLineLayer = {
    id: 'uplinkRelayLineLayer',
    type: 'line',
    filter: ['==', ['get', 'is_mesh'], true],
    layout: {
        'line-join': 'round',
        'line-cap': 'round'
    },
    paint: {
        'line-color': '#d8d51d',
        'line-width': 2,
        'line-dasharray': [4, 3]
    }
};

export const uplinkHotspotsCircleLayer = {
    id: 'uplinkHotspotsCircleLayer',
    type: 'circle',
    paint: {
        'circle-color': '#d8d51d',
    }
};

export const uplinkHotspotsHexLayer = {
    id: 'uplinkHotspotsHexLayer',
    type: 'fill',
    paint: {
        'fill-color': '#a5a308',
        'fill-outline-color': '#414a4a',
        'fill-opacity': 0.45,
    }
};

export const selectedHexLayer = {
    id: 'selectedHexLayer',
    type: 'fill',
    paint: {
        'fill-color': ['interpolate', ['linear'], ['get', 'best_rssi'],
            -120, 'rgba(255,152,0,0.15)',
            -100, 'rgba(255,152,0,0.5)',
            -80, 'rgba(255,152,0,0.85)'],
        'fill-opacity': 0.9,
        'fill-outline-color': 'rgba(255,152,0,0.5)'
    }
};

// Inspection-mode layer: hexes whose coverage comes only from NON-permanent
// (mobile / bench) gateways, shown while normal coverage is hidden. Flat
// purple (already in the palette as the unselected-hex color) with
// deliberately NO RSSI ramp — these hexes answer "where", not "how strong".
export const otherHexLayer = {
    id: 'otherHexLayer',
    type: 'fill',
    paint: {
        'fill-color': '#b67ffe',
        'fill-opacity': 0.55,
        'fill-outline-color': '#ffffff'
    }
};

export const gatewayMarkerLayer = {
    id: 'gatewayMarkerLayer',
    type: 'circle',
    paint: {
        'circle-radius': 7,
        'circle-color': '#FF9800',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
    }
};

export const gatewayLabelLayer = {
    id: 'gatewayLabelLayer',
    type: 'symbol',
    layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-optional': true
    },
    paint: {
        'text-color': '#FF9800',
        'text-halo-color': '#000000',
        'text-halo-width': 1
    }
};

// Timeline-mode coverage layers. Same orange RSSI gradient + outline as the
// live `uplinkTileServerLayer` so historical hexes match the live view's
// colors exactly. Hexes are colored by all-time `best_rssi` (static once
// revealed — per-hex RSSI evolution over time is out of scope).
//
// The reveal is ONE fill layer off the `timeline` source. Its MapLibre filter
// is set from the control's `rangeStart`/`cursor`/`showBaseline` state via the
// <Layer filter={...}/> prop in Map.js. Vocabulary (see GLOSSARY.md):
//   - Baseline: hexes with first_seen < rangeStart. Drawn in the same style as
//               the bloom (not dimmed) so the timeline's end matches the map.
//   - Bloom:    in-range hexes (rangeStart <= first_seen <= cursor) revealing
//               as the cursor/playhead advances.

// Shared orange RSSI gradient expression for the timeline layers.
const TIMELINE_RSSI_GRADIENT = [
    'interpolate',
    ['linear'],
    ['get', 'best_rssi'],
    -120,
    'rgba(255,152,0,0.15)',
    -100,
    'rgba(255,152,0,0.5)',
    -80,
    'rgba(255,152,0,0.85)'
];

// The timeline's coverage layer: baseline + bloom, full opacity. Map.js sets
// its filter from timelineRevealFilter below.
export const timelineRevealLayer = {
    id: 'timelineRevealLayer',
    type: 'fill',
    paint: {
        'fill-color': TIMELINE_RSSI_GRADIENT,
        'fill-opacity': 0.9,
        'fill-outline-color': '#ffffff'
    }
};

// MapLibre filter for timelineRevealLayer.
// Baseline on: every pre-range hex, plus the bloom up to the cursor. At
//   cursor = today that is the live map's hex set. The explicit
//   `first_seen < rangeStart` arm keeps the baseline whole when the cursor
//   sits behind the start handle (start dragged past a paused playhead).
// Baseline off: only the bloom (rangeStart <= first_seen <= cursor).
export function timelineRevealFilter({ rangeStart, cursor, showBaseline }) {
    const fs = ['get', 'first_seen'];
    return showBaseline
        ? ['any', ['<', fs, rangeStart], ['<=', fs, cursor]]
        : ['all', ['>=', fs, rangeStart], ['<=', fs, cursor]];
}

export const uplinkChannelLayer = {
    id: 'uplinkChannelLayer',
    type: 'fill',
    paint: {
        'fill-color': [
            'case',
            ['boolean',
                ['feature-state', 'selected'], true],
            ['interpolate',
                ['linear'],
                ['get', 'best_rssi'],
                -120,
                'rgba(255,152,0,0.15)',
                -100,
                'rgba(255,152,0,0.5)',
                -80,
                'rgba(255,152,0,0.85)']
            ,
            '#b67ffe'
        ],
        'fill-opacity': 0.9,
        'fill-outline-color': [
            'case',
            ['boolean',
                ['feature-state', 'selected'], true],
            'rgba(255,152,0,0.5)',
            '#ffffff'
        ]
    }
};