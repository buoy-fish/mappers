import * as React from 'react';
import { useState, useRef, useCallback } from 'react';
// Both renderers are imported up-front. We pick which one to mount at runtime
// based on whether a Mapbox token was injected at build time. Bundling both
// adds ~200KB; trivial for a low-traffic mapping app and avoids dynamic-import
// complexity. Source / Layer / GeolocateControl / NavigationControl are shape-
// identical between the two submodules — they're generic wrappers around the
// same Style Spec — so we import them from /maplibre by convention.
// react-map-gl 7.1 layout: default export is Mapbox-bound, `/maplibre` is MapLibre-bound.
import { Map as MapboxMap } from 'react-map-gl';
import { Map as MaplibreMap, Source, Layer, GeolocateControl, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import InfoPane from "../components/InfoPane"
import WelcomeModal from "../components/WelcomeModal"
import { uplinkTileServerLayer, uplinkHotspotsLineLayer, uplinkRelayLineLayer, uplinkHotspotsCircleLayer, uplinkHotspotsHexLayer, uplinkChannelLayer, gatewayMarkerLayer, gatewayLabelLayer, selectedHexLayer } from './Layers.js';
import { get } from '../data/Rest'
import { geoToH3, h3ToGeo, h3ToGeoBoundary } from "h3-js";
import socket from "../socket";
import geojson2h3 from 'geojson2h3';
import useLocalStorageState from 'use-local-storage-state';
import '../../css/app.css';
import { useNavigate, useLocation } from "react-router-dom";

// ============================================================================
// Basemap selection
// ----------------------------------------------------------------------------
// MAPBOX_ACCESS_TOKEN is inlined at build time by esbuild's `define` (see
// assets/build.mjs). When set, we use Mapbox's Maxar satellite + topography
// style for byte-for-byte parity with upstream Helium Mappers. When unset
// (e.g. local dev, CI, or after deliberately clearing the env var to dodge
// Mapbox usage costs), we fall back to CartoCDN's open-source dark-matter
// style — no API key required, but no satellite imagery either.
//
// To toggle: set/unset MAPBOX_ACCESS_TOKEN in the env where `npm run deploy`
// runs (production: /home/ubuntu/map.buoy.fish/.env), then rebuild assets.
// ============================================================================
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const USE_MAPBOX = typeof MAPBOX_TOKEN === "string" && MAPBOX_TOKEN.startsWith("pk.");

const MAP_STYLES = {
    // Mapbox first-party Maxar satellite + roads/labels. Visually equivalent
    // to upstream Helium Mappers' look. We previously tried upstream's exact
    // style (`mapbox://styles/petermain/ckmwdn50a1ebk17o3h5e6wwui`) but it's
    // private to that user's Mapbox account and returns HTTP 404 to our
    // token. Mapbox-owned styles are public to any valid `pk.` token.
    mapbox: "mapbox://styles/mapbox/satellite-streets-v12",
    // Open-source fallback. No API key, no satellite imagery.
    carto: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

const MAP_STYLE = USE_MAPBOX ? MAP_STYLES.mapbox : MAP_STYLES.carto;
const MapGL = USE_MAPBOX ? MapboxMap : MaplibreMap;

// Dark / desaturated raster treatment applied at runtime to the satellite
// imagery layers, mimicking upstream Helium Mappers' look (whose effect lives
// in a private Mapbox Studio style we can't access).
//
// Tweak these knobs to taste:
//   raster-saturation:      -1 (gray) to 1 (vivid)
//   raster-brightness-min:  0 to 1 (raise to crush blacks; usually leave 0)
//   raster-brightness-max:  0 to 1 (lower to darken highlights — main "darken" knob)
//   raster-contrast:        -1 to 1 (negative = flatter, positive = punchier)
//   raster-hue-rotate:      0 to 360° (omit; rotation produces orange halos at
//                                       coastline edges where tiles get bilinear
//                                       resampling, since partial-saturation
//                                       pixels wrap around the color wheel)
//
// Applied only when USE_MAPBOX is true (the CartoCDN fallback is already dark
// and vector-only — no raster layers to treat).
const SATELLITE_DARK_TREATMENT = {
    "raster-saturation": -0.85,
    "raster-brightness-max": 0.45,
    "raster-contrast": -0.05,
    "raster-hue-rotate": 0,
};

// "Light" mode = clear back to Mapbox's default paint values.
const SATELLITE_LIGHT_TREATMENT = {
    "raster-saturation": undefined,
    "raster-brightness-max": undefined,
    "raster-contrast": undefined,
    "raster-hue-rotate": undefined,
};

function applySatelliteTreatment(map, treatment) {
    const layers = map.getStyle()?.layers || [];
    // #region agent log
    try {
        const allLayers = layers.map(l => ({ id: l.id, type: l.type, source: l.source }));
        const rasterLayers = layers.filter(l => l.type === "raster");
        const sources = map.getStyle()?.sources || {};
        const rasterSources = Object.entries(sources).filter(([_, s]) => s && (s.type === "raster" || s.type === "raster-dem")).map(([id, s]) => ({ id, type: s.type }));
        const payload = {
            sessionId: 'f70c37', runId: 'pre-fix-1', hypothesisId: 'A,B,C,D',
            location: 'Map.js:applySatelliteTreatment',
            message: 'apply called',
            data: {
                perfNow: Math.round(performance.now()),
                treatmentKeys: Object.keys(treatment),
                isLightMode: treatment["raster-saturation"] === undefined,
                styleLoaded: map.isStyleLoaded(),
                tilesLoaded: typeof map.areTilesLoaded === "function" ? map.areTilesLoaded() : null,
                totalLayers: layers.length,
                rasterLayers: rasterLayers.map(l => ({ id: l.id, source: l.source })),
                rasterSources,
                allLayerTypes: [...new Set(allLayers.map(l => l.type))],
            },
            timestamp: Date.now(),
        };
        console.log('[DEBUG-SAT] applySatelliteTreatment', payload.data);
        fetch('http://127.0.0.1:7821/ingest/eb093061-f534-4da7-ac4f-47b78341fc6b', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f70c37' }, body: JSON.stringify(payload) }).catch(() => { });
    } catch (e) { console.warn('[DEBUG-SAT] log failed', e); }
    // #endregion
    layers.forEach((layer) => {
        if (layer.type !== "raster") return;
        Object.entries(treatment).forEach(([prop, value]) => {
            try {
                map.setPaintProperty(layer.id, prop, value);
            } catch (_) {
                // Some raster layers lock certain paint properties; skip silently.
            }
        });
    });
    // #region agent log
    try {
        const after = layers.filter(l => l.type === "raster").map(l => ({
            id: l.id,
            satNow: map.getPaintProperty(l.id, 'raster-saturation'),
            brightMaxNow: map.getPaintProperty(l.id, 'raster-brightness-max'),
        }));
        const payload = {
            sessionId: 'f70c37', runId: 'pre-fix-1', hypothesisId: 'B,C,D',
            location: 'Map.js:applySatelliteTreatment:after',
            message: 'paint props after setPaintProperty',
            data: { perfNow: Math.round(performance.now()), after },
            timestamp: Date.now(),
        };
        console.log('[DEBUG-SAT] paint after', payload.data);
        fetch('http://127.0.0.1:7821/ingest/eb093061-f534-4da7-ac4f-47b78341fc6b', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f70c37' }, body: JSON.stringify(payload) }).catch(() => { });
    } catch (e) { console.warn('[DEBUG-SAT] log failed', e); }
    // #endregion
}

var selectedStateIdTile = null;
var selectedStateIdChannel = null;
const channel = socket.channel("h3:new")

function Map(props) {
    const [viewState, setViewState] = useState({
        latitude: props.startLatitude,
        longitude: props.startLongitude,
        zoom: 11,
        bearing: 0,
        pitch: 0
    });
    const mapRef = useRef(null);
    // #region agent log
    const debugListenersAttachedRef = useRef(false);
    const setMapRef = useCallback((r) => {
        mapRef.current = r;
        if (!r || debugListenersAttachedRef.current) return;
        const m = r.getMap?.();
        if (!m) return;
        debugListenersAttachedRef.current = true;
        const log = (msg, data, hyp) => {
            const payload = { sessionId: 'f70c37', runId: 'pre-fix-1', hypothesisId: hyp, location: 'Map.js:setMapRef', message: msg, data: { perfNow: Math.round(performance.now()), ...data }, timestamp: Date.now() };
            console.log('[DEBUG-SAT]', msg, payload.data);
            fetch('http://127.0.0.1:7821/ingest/eb093061-f534-4da7-ac4f-47b78341fc6b', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f70c37' }, body: JSON.stringify(payload) }).catch(() => { });
        };
        log('ref-attached', { isStyleLoaded: m.isStyleLoaded(), areTilesLoaded: typeof m.areTilesLoaded === "function" ? m.areTilesLoaded() : null }, 'A');
        m.on('style.load', () => {
            const layers = m.getStyle()?.layers || [];
            log('style.load fired (early listener)', { rasterLayerCount: layers.filter(l => l.type === "raster").length, areTilesLoaded: m.areTilesLoaded() }, 'A,C');
        });
        m.on('idle', () => log('idle (first paint complete)', {}, 'B,D'));
        m.on('data', (e) => {
            if (e.dataType === "source" && e.tile) log('first tile painted', { sourceId: e.sourceId, sourceType: e.source?.type }, 'B,D');
        });
        // CSS sanity check: hypothesis E
        setTimeout(() => {
            try {
                const c = document.querySelector('.map-container');
                const canvas = document.querySelector('.maplibregl-canvas, .mapboxgl-canvas');
                log('css-bg-check', {
                    mapContainerBg: c ? getComputedStyle(c).backgroundColor : null,
                    canvasBg: canvas ? getComputedStyle(canvas).backgroundColor : null,
                    canvasParentBg: canvas?.parentElement ? getComputedStyle(canvas.parentElement).backgroundColor : null,
                }, 'E');
            } catch (_) { }
        }, 50);
    }, []);
    // #endregion
    // Ref to synchronously track which hex was loaded by a user click.
    // Unlike useState, refs update immediately and are available in closures
    // without waiting for a re-render. This prevents the location useEffect
    // from re-triggering simulateUplinkHexClick for a hex that onClick already loaded.
    const clickedHexRef = useRef(null);
    const emptyFC = { type: "FeatureCollection", features: [] };
    const [uplinks, setUplinks] = useState(null);
    const [uplinkHotspotsData, setUplinkHotspotsData] = useState({ line: emptyFC, circle: emptyFC, hex: emptyFC });
    const [uplinkChannelData, setUplinkChannelData] = useState(emptyFC);
    const [hexId, setHexId] = useState(null);
    const [bestRssi, setBestRssi] = useState(null);
    const [snr, setSnr] = useState(null);
    const [showHexPane, setShowHexPane] = useState(false);
    const [showWelcomeModal, setShowWelcomeModal] = useLocalStorageState('welcomeModalOpen_v1', true);
    const onCloseWelcomeModalClick = () => setShowWelcomeModal(false);
    const routerParams = props.routerParams;
    const [initComplete, setInitComplete] = useState(false);
    const [lastPath, setLastPath] = useState(false);
    const [showHexPaneCloseButton, setShowHexPaneCloseButton] = useState(false);
    const [hexGeoJson, setHexGeoJson] = useState(emptyFC);
    const [gatewayGeoJson, setGatewayGeoJson] = useState(emptyFC);
    const [showGateways, setShowGateways] = useState(false);
    const [hideCoverage, setHideCoverage] = useState(false);
    // Dark/light satellite toggle. Default true (dark) so first-time visitors
    // see the visually punchy treatment that lets coverage hexes pop. Persisted
    // per-browser via localStorage so users keep their preference across visits.
    const [darkSatellite, setDarkSatellite] = useLocalStorageState('darkSatellite_v1', { defaultValue: true });

    const selectedHexGeoJson = React.useMemo(() => {
        if (!hexId || !showHexPane) return emptyFC;
        const boundary = h3ToGeoBoundary(hexId, true);
        return {
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                geometry: { type: "Polygon", coordinates: [boundary] },
                properties: { best_rssi: bestRssi }
            }]
        };
    }, [hexId, bestRssi, showHexPane]);

    let navigate = useNavigate();
    const location = useLocation();

    // Load hex data from Phoenix API (replaces Martin tile server)
    React.useEffect(() => {
        fetch('/api/v1/hexes')
            .then(res => res.json())
            .then(data => setHexGeoJson(data))
            .catch(err => console.error('Failed to load hex data:', err));
    }, []);

    // Load gateway positions
    React.useEffect(() => {
        fetch('/api/v1/gateways')
            .then(res => res.json())
            .then(data => {
                const features = (data.gateways || []).map(gw => ({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [gw.lng, gw.lat]
                    },
                    properties: {
                        gateway_eui: gw.gateway_eui,
                        name: gw.hotspot_name || gw.gateway_eui,
                        last_heard: gw.last_heard
                    }
                }));
                setGatewayGeoJson({ type: "FeatureCollection", features });
            })
            .catch(err => console.error('Failed to load gateway data:', err));
    }, []);

    React.useEffect(() => {
        if (!initComplete && location.pathname != lastPath) {
            setLastPath(location.pathname);
            let features = []
            channel.on("new_h3", payload => {
                var new_feature = geojson2h3.h3ToFeature(payload.body.id_string, { 'id': payload.body.id, 'id_string': payload.body.id_string, 'best_rssi': payload.body.best_rssi, 'snr': payload.body.snr })
                new_feature.id = payload.body.id
                features.push(new_feature)
                const featureCollection =
                {
                    "type": "FeatureCollection",
                    "features": [...features]
                }
                // Update data
                setUplinkChannelData(featureCollection)
            })

            channel.join()
                .receive("ok", resp => { console.log("Joined successfully", resp) })
                .receive("error", resp => { console.log("Unable to join", resp) })

            if (routerParams.hexId != null) {
                setTimeout(() => {
                    simulateUplinkHexClick()
                }, 500)
            }

            setInitComplete(true);
        }
        else if (initComplete && location.pathname != lastPath) {

            setLastPath(location.pathname);
            // Only simulate click for direct URL navigation (e.g. page load with /uplinks/hex/:id).
            // Skip if the hex was already loaded by an onClick handler (avoids duplicate API calls
            // and the infinite loop that occurs when rapidly clicking between two hexes).
            // We use clickedHexRef (a synchronous ref) instead of hexId state because setState
            // is async — the state value would be stale here and fail the guard.
            if (routerParams.hexId != null && routerParams.hexId != 'undefined' && routerParams.hexId !== clickedHexRef.current) {
                setTimeout(() => {
                    simulateUplinkHexClick()
                }, 500)
            }
        }

    }, [location,])

    const onCloseHexPaneClick = () => {
        setShowHexPane(false);
        clickedHexRef.current = null;

        clearSelectedHex();
        const hotspotLineFeatureCollection =
        {
            "type": "FeatureCollection",
            "features": []
        }
        const hotspotCircleFeatureCollection =
        {
            "type": "FeatureCollection",
            "features": []
        }
        const hotspotHexFeatureCollection =
        {
            "type": "FeatureCollection",
            "features": []
        }
        setUplinkHotspotsData({ line: hotspotLineFeatureCollection, circle: hotspotCircleFeatureCollection, hex: hotspotHexFeatureCollection })
        navigate("/");
        setShowHexPaneCloseButton(false);
    }

    const clearSelectedHex = () => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        // unselect any currently selected hex on both hex layers
        if (selectedStateIdTile !== null || selectedStateIdChannel !== null) {
            map.setFeatureState(
                { source: 'uplink-tileserver', id: selectedStateIdTile },
                { selected: true }
            );
            map.setFeatureState(
                { source: 'uplink-channel', id: selectedStateIdChannel },
                { selected: true }
            );
        }
    }

    const simulateUplinkHexClick = () => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        if (map.areTilesLoaded()) {
            var features = map.querySourceFeatures('uplink-tileserver')
            features.forEach(function (feature_i) {
                if (feature_i.properties.id == routerParams.hexId) {
                    feature_i.layer = { id: "public.h3_res9", layout: {}, source: "uplink-tileserver", type: "fill" }
                    var syntheticEvent = { features: [feature_i] }
                    onClick(syntheticEvent)
                }
            });
        }
        else {
            setTimeout(() => { simulateUplinkHexClick() }, 500)
        }
    }

    const getHex = h3_index => {
        get("uplinks/hex/" + h3_index)
            .then(res => {
                if (res.status == 429) {
                    console.warn("Rate limited — too many requests. Try again in a moment.");
                    return Promise.reject("rate_limited")
                }
                else
                    return res
            })
            .then(res => res.json())
            .then(uplinks => {
                var hotspot_line_features = [];
                var hotspot_circle_features = [];
                var hotspot_hex_features = [];
                setUplinks(uplinks.uplinks)
                const uplink_coords = h3ToGeo(h3_index)

                // Build a lookup of gateway positions from the uplinks data
                const gwPositions = {};
                uplinks.uplinks.forEach(h => {
                    if (h.gateway_eui) {
                        gwPositions[h.gateway_eui] = { lat: h.lat, lng: h.lng };
                    }
                });
                // Track which gateway_euis are part of a mesh path
                const meshGwEuis = new Set();
                uplinks.uplinks.forEach(h => {
                    if (h.relay_gateway_eui) {
                        meshGwEuis.add(h.relay_gateway_eui);
                        meshGwEuis.add(h.gateway_eui);
                    }
                });

                uplinks.uplinks.map((h, i) => {
                    const hotspot_h3_index = geoToH3(h.lat, h.lng, 8)
                    const hotspot_coords = h3ToGeo(hotspot_h3_index)
                    const hotspot_polygon_coords = h3ToGeoBoundary(hotspot_h3_index, true)
                    const isMesh = meshGwEuis.has(h.gateway_eui);

                    if (h.relay_gateway_eui && gwPositions[h.relay_gateway_eui]) {
                        // Relay leg: draw line from mesh GW to this border GW
                        const relayPos = gwPositions[h.relay_gateway_eui];
                        const relay_h3 = geoToH3(relayPos.lat, relayPos.lng, 8);
                        const relay_coords = h3ToGeo(relay_h3);
                        hotspot_line_features.push({
                            "type": "Feature",
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [
                                    [relay_coords[1], relay_coords[0]],
                                    [hotspot_coords[1], hotspot_coords[0]]
                                ]
                            },
                            "properties": { "is_mesh": true }
                        })
                    } else {
                        // Direct leg: draw line from hex (device) to this gateway
                        hotspot_line_features.push({
                            "type": "Feature",
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [
                                    [hotspot_coords[1], hotspot_coords[0]],
                                    [uplink_coords[1], uplink_coords[0]]
                                ]
                            },
                            "properties": { "is_mesh": isMesh }
                        })
                    }

                    hotspot_circle_features.push(
                        {
                            "type": "Feature",
                            "geometry": {
                                "type": "Point",
                                "coordinates": [hotspot_coords[1], hotspot_coords[0]]
                            },
                            "properties": {
                                "name": h.hotspot_name
                            }
                        }
                    )
                    hotspot_hex_features.push(
                        {
                            "type": "Feature",
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [
                                    hotspot_polygon_coords
                                ]
                            },
                            "properties": {
                                "name": h.hotspot_name
                            }
                        }
                    )
                })
                const hotspotLineFeatureCollection =
                {
                    "type": "FeatureCollection",
                    "features": hotspot_line_features
                }
                const hotspotCircleFeatureCollection =
                {
                    "type": "FeatureCollection",
                    "features": hotspot_circle_features
                }
                const hotspotHexFeatureCollection =
                {
                    "type": "FeatureCollection",
                    "features": hotspot_hex_features
                }

                setUplinkHotspotsData({ line: hotspotLineFeatureCollection, circle: hotspotCircleFeatureCollection, hex: hotspotHexFeatureCollection })
            })
            .catch(err => {
                if (err !== "rate_limited") {
                    console.error("Failed to load hex data:", err);
                }
            })
    }

    const onClick = useCallback(event => {
        const features = event.features;
        const map = mapRef.current?.getMap();
        if (!map) return;
        setShowHexPaneCloseButton(false);
        if (features) {
            features.forEach(feature => {
                if (!feature?.layer) return;
                if (feature.layer.id == "public.h3_res9") {
                    // Mark this hex as clicked synchronously BEFORE navigate(),
                    // so the location useEffect knows onClick already handled it.
                    clickedHexRef.current = feature.properties.id;
                    navigate("/uplinks/hex/" + feature.properties.id);
                    // set hex data for info pane
                    setBestRssi(feature.properties.best_rssi);
                    setSnr(feature.properties.snr.toFixed(2));
                    setHexId(feature.properties.id);
                    getHex(feature.properties.id);
                    setShowHexPane(true);

                    // unselect any currently selected hex on both hex layers
                    if (selectedStateIdTile !== null || selectedStateIdTile !== null) {
                        map.setFeatureState(
                            { source: 'uplink-tileserver', id: selectedStateIdTile },
                            { selected: true }
                        );
                        map.setFeatureState(
                            { source: 'uplink-channel', id: selectedStateIdChannel },
                            { selected: true }
                        );
                    }
                    selectedStateIdTile = feature.id;
                    map.setFeatureState(
                        { source: 'uplink-tileserver', id: selectedStateIdTile },
                        { selected: false }
                    );
                    setTimeout(() => { setShowHexPaneCloseButton(true); }, 1000)
                }
                else if (feature.layer.id == "uplinkChannelLayer") {
                    // Mark this hex as clicked synchronously BEFORE navigate(),
                    // so the location useEffect knows onClick already handled it.
                    clickedHexRef.current = feature.properties.id_string;
                    navigate("/uplinks/hex/" + feature.properties.id_string);
                    // set hex data for info pane
                    setBestRssi(feature.properties.best_rssi);
                    setSnr(feature.properties.snr.toFixed(2));
                    setHexId(feature.properties.id_string);
                    getHex(feature.properties.id_string);
                    setShowHexPane(true);

                    // unselect any currently selected hex on both hex layers
                    if (selectedStateIdChannel !== null || selectedStateIdTile !== null) {
                        map.setFeatureState(
                            { source: 'uplink-channel', id: selectedStateIdChannel },
                            { selected: true }
                        );
                        map.setFeatureState(
                            { source: 'uplink-tileserver', id: selectedStateIdTile },
                            { selected: true }
                        );
                    }
                    selectedStateIdChannel = feature.id;
                    map.setFeatureState(
                        { source: 'uplink-channel', id: selectedStateIdChannel },
                        { selected: false }
                    );

                    // Don't fly/zoom on click. The previous `map.fitBounds([bbox of
                    // single H3 res9 cell])` zoomed to ~level 18 (a single 150 m
                    // hex filling the screen), which felt broken. Hexes from the
                    // initial /api/v1/hexes load (handled by the public.h3_res9
                    // branch above) never zoomed; matching that behavior makes
                    // click feedback consistent regardless of when the hex first
                    // appeared on the map.

                    setTimeout(() => { setShowHexPaneCloseButton(true); }, 1000)
                }
            });
        }
    }, []);

    const onFlyToProject = useCallback(project => {
        setViewState(prev => ({
            ...prev,
            latitude: project.lat,
            longitude: project.lng,
            zoom: project.zoom || 12
        }));
    }, []);

    // Re-apply satellite treatment whenever the user toggles the theme.
    // Initial application happens via the MapGL onLoad callback below; this
    // effect only handles user-initiated toggles after the map is loaded.
    React.useEffect(() => {
        if (!USE_MAPBOX) return;
        const map = mapRef.current?.getMap();
        if (!map || !map.isStyleLoaded()) return;
        applySatelliteTreatment(map, darkSatellite ? SATELLITE_DARK_TREATMENT : SATELLITE_LIGHT_TREATMENT);
    }, [darkSatellite]);

    const interactiveLayerIds = ['public.h3_res9', 'uplinkChannelLayer'];

    return (
        <div className='map-container'>
            <MapGL
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                style={{ width: "100vw", height: "100vh" }}
                mapStyle={MAP_STYLE}
                mapboxAccessToken={USE_MAPBOX ? MAPBOX_TOKEN : undefined}
                onClick={onClick}
                onLoad={USE_MAPBOX ? (e) => {
                    const m = e.target;
                    // #region agent log
                    try {
                        const payload = { sessionId: 'f70c37', runId: 'pre-fix-1', hypothesisId: 'A,B', location: 'Map.js:onLoad', message: 'onLoad fired', data: { perfNow: Math.round(performance.now()), isStyleLoaded: m.isStyleLoaded(), areTilesLoaded: m.areTilesLoaded() }, timestamp: Date.now() };
                        console.log('[DEBUG-SAT] onLoad fired', payload.data);
                        fetch('http://127.0.0.1:7821/ingest/eb093061-f534-4da7-ac4f-47b78341fc6b', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f70c37' }, body: JSON.stringify(payload) }).catch(() => { });
                    } catch (_) { }
                    // #endregion
                    // Apply once now in case style.load already fired.
                    applySatelliteTreatment(m, darkSatellite ? SATELLITE_DARK_TREATMENT : SATELLITE_LIGHT_TREATMENT);
                    // Also re-apply on every subsequent style.load — fires
                    // earlier than `load` (before first tiles render), so any
                    // future style swap (and the initial load on slower
                    // connections) won't flash through bright tiles first.
                    m.on("style.load", () => {
                        applySatelliteTreatment(m, darkSatellite ? SATELLITE_DARK_TREATMENT : SATELLITE_LIGHT_TREATMENT);
                    });
                } : undefined}
                ref={setMapRef}
                interactiveLayerIds={interactiveLayerIds}
            >
                <GeolocateControl
                    positionOptions={{ enableHighAccuracy: true }}
                    fitBoundsOptions={{ maxZoom: viewState.zoom }}
                    trackUserLocation={true}
                    position="top-right"
                />
                <NavigationControl position="top-right" />
                {!hideCoverage &&
                    <Source id="uplink-tileserver" type="geojson" data={hexGeoJson}>
                        <Layer {...uplinkTileServerLayer} />
                    </Source>
                }
                {!hideCoverage &&
                    <Source id="uplink-channel" type="geojson" data={uplinkChannelData}>
                        <Layer {...uplinkChannelLayer} />
                    </Source>
                }
                {hideCoverage && showHexPane &&
                    <Source id="selected-hex" type="geojson" data={selectedHexGeoJson}>
                        <Layer {...selectedHexLayer} />
                    </Source>
                }
                <Source id="uplink-hotspots-hex" type="geojson" data={uplinkHotspotsData.hex}>
                    <Layer {...uplinkHotspotsHexLayer} />
                </Source>
                <Source id="uplink-hotspots-line" type="geojson" data={uplinkHotspotsData.line}>
                    <Layer {...uplinkHotspotsLineLayer} />
                    <Layer {...uplinkRelayLineLayer} />
                </Source>
                <Source id="uplink-hotspots-circle" type="geojson" data={uplinkHotspotsData.circle}>
                    <Layer {...uplinkHotspotsCircleLayer} />
                </Source>
                {showGateways &&
                    <Source id="gateways" type="geojson" data={gatewayGeoJson}>
                        <Layer {...gatewayMarkerLayer} />
                        <Layer {...gatewayLabelLayer} />
                    </Source>
                }

            </MapGL>
            <InfoPane hexId={hexId} bestRssi={bestRssi} snr={snr} uplinks={uplinks} showHexPane={showHexPane} onCloseHexPaneClick={onCloseHexPaneClick} showHexPaneCloseButton={showHexPaneCloseButton} showGateways={showGateways} onToggleGateways={() => setShowGateways(!showGateways)} hideCoverage={hideCoverage} onToggleCoverage={() => setHideCoverage(!hideCoverage)} onFlyToProject={onFlyToProject} darkSatellite={darkSatellite} onToggleDarkSatellite={USE_MAPBOX ? () => setDarkSatellite(!darkSatellite) : null} />
            <WelcomeModal showWelcomeModal={showWelcomeModal} onCloseWelcomeModalClick={onCloseWelcomeModalClick} />
        </div>
    );
}

export default Map;
