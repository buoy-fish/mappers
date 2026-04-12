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