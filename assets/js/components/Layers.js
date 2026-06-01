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
// The reveal is driven by TWO fill layers off the single `timeline` source,
// both keyed on the same orange `best_rssi` gradient. Their MapLibre filters
// are set dynamically from the control's `rangeStart`/`cursor` state via the
// <Layer filter={...}/> prop in Map.js (the static definitions below carry no
// filter — Map.js supplies it). Vocabulary (see CONTEXT.md):
//   - Baseline: hexes with first_seen < rangeStart, dimmed beneath the bloom.
//   - Bloom:    in-range hexes (rangeStart <= first_seen <= cursor) revealing
//               as the cursor/playhead advances.

// Shared orange RSSI gradient expression, reused by both timeline layers.
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

// Kept for reference / any non-animated callers. The Map.js render path uses
// the two layers below, not this one.
export const timelineLayer = {
    id: 'timelineLayer',
    type: 'fill',
    paint: {
        'fill-color': TIMELINE_RSSI_GRADIENT,
        'fill-opacity': 0.9,
        'fill-outline-color': '#ffffff'
    }
};

// Bloom layer — the animated reveal of in-range hexes. Full opacity. Painted
// ON TOP of the baseline (declared AFTER it in Map.js). Its filter is set from
// state in Map.js: ["all", [">=", first_seen, rangeStart], ["<=", first_seen, cursor]].
export const timelineRevealLayer = {
    id: 'timelineRevealLayer',
    type: 'fill',
    paint: {
        'fill-color': TIMELINE_RSSI_GRADIENT,
        'fill-opacity': 0.9,
        'fill-outline-color': '#ffffff'
    }
};

// Baseline layer — pre-range footprint (first_seen < rangeStart), dimmed to
// ~30% of the bloom's opacity (0.9 * 0.3 ≈ 0.27). Rendered BENEATH the bloom
// and only mounted when `showBaseline` is true. Filter set in Map.js:
// ["<", first_seen, rangeStart].
export const timelineBaselineLayer = {
    id: 'timelineBaselineLayer',
    type: 'fill',
    paint: {
        'fill-color': TIMELINE_RSSI_GRADIENT,
        'fill-opacity': 0.27,
        'fill-outline-color': 'rgba(255,255,255,0.3)'
    }
};

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