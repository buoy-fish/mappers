import * as React from 'react';
import { useState, useRef, useCallback } from 'react';
// Both renderers are imported up-front. We pick which one to mount at runtime
// based on whether a Mapbox token was injected at build time. Bundling both
// adds ~200KB; trivial for a low-traffic mapping app and avoids dynamic-import
// complexity. Source / Layer / GeolocateControl / NavigationControl are shape-
// identical between the two submodules — they're generic wrappers around the
// same Style Spec — so we import them from /maplibre by convention.
// Popup is NOT generic — it instantiates the GL library's own Popup class —
// so, like Map, it must come from the submodule matching the active renderer.
// react-map-gl 7.1 layout: default export is Mapbox-bound, `/maplibre` is MapLibre-bound.
import { Map as MapboxMap, Popup as MapboxPopup } from 'react-map-gl';
import { Map as MaplibreMap, Source, Layer, GeolocateControl, NavigationControl, Popup as MaplibrePopup } from 'react-map-gl/maplibre';
// GL control/logo/attribution CSS is imported in assets/css/app.css (the served
// stylesheet) — NOT here. esbuild puts JS-side CSS imports in the /js/app.css
// sidecar, which the layout never links, so importing them here is dead weight.
import InfoPane from "../components/InfoPane"
import GatewayTooltip from "../components/GatewayTooltip"
import ThemeControl from "../components/ThemeControl"
import WelcomeModal from "../components/WelcomeModal"
import TimelineControl, { startOfLocalDay, endOfLocalDay } from "../components/TimelineControl"
import { uplinkTileServerLayer, uplinkHotspotsLineLayer, uplinkRelayLineLayer, uplinkHotspotsCircleLayer, uplinkHotspotsHexLayer, uplinkChannelLayer, gatewayMarkerLayer, gatewayLabelLayer, selectedHexLayer, timelineRevealLayer, timelineBaselineLayer } from './Layers.js';
import { get } from '../data/Rest'
import { getInitialProjects, fetchProjects } from '../utils/projects'
import { parseTimelineLink, buildTimelineLink } from '../utils/timelineLink'
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
const PopupGL = USE_MAPBOX ? MapboxPopup : MaplibrePopup;

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
}

// Both basemaps draw cartographic clutter the Buoy.Fish map doesn't want — it
// only cares about the land/water divide so the coverage hexes are the focus.
// Hide three families of layers on whichever style is active by matching the
// source-layer they live in, with an id-regex fallback in case a style renames
// a layer. Coastline / water / place (city) labels are left untouched.
//   1. Roads/highways:
//      - CARTO dark-matter (OpenMapTiles): `transportation` (geometry) +
//        `transportation_name` (highway shields).
//      - Mapbox satellite-streets-v12 (Mapbox Streets v8): road geometry,
//        shields, and road labels all use the `road` source-layer.
//   2. Admin boundary lines (province/state/country borders):
//      - Mapbox: `admin` source-layer.  CARTO: `boundary` source-layer.
//   3. National parks (the green fill + tree-icon label):
//      - Mapbox: `national_park` source-layer (fill) + the park label layers
//        (id contains "national-park"/"national_park").  CARTO: `park`.
function hideBasemapClutter(map) {
    const layers = map.getStyle()?.layers || [];
    layers.forEach((layer) => {
        const srcLayer = layer["source-layer"] || "";
        const id = layer.id || "";
        const isClutter =
            // roads
            srcLayer === "transportation" ||
            srcLayer === "transportation_name" ||
            srcLayer === "road" ||
            /road|highway|motorway|trunk|bridge|tunnel|street/i.test(id) ||
            // admin boundaries
            srcLayer === "admin" ||
            srcLayer === "boundary" ||
            /boundary|admin-[01]/i.test(id) ||
            // national parks (fill + label)
            srcLayer === "national_park" ||
            srcLayer === "park" ||
            /national.?park/i.test(id);
        if (!isClutter) return;
        try {
            map.setLayoutProperty(layer.id, "visibility", "none");
        } catch (_) {
            // Layer may not exist in every style variant; ignore.
        }
    });
}

// Layers whose features represent a clickable hex, in the order onClick
// dispatches on them. Gateway markers are interactive too, but they're handled
// separately (they swallow the click) so they're not listed here.
const HEX_LAYERS = ['public.h3_res9', 'uplinkChannelLayer', 'timelineRevealLayer', 'timelineBaselineLayer'];

var selectedStateIdTile = null;
var selectedStateIdChannel = null;

// setFeatureState() errors with "The feature id parameter must be provided."
// when `id` is undefined, and is meaningless when it's null (the normal state
// for whichever hex source has never had a selection). Guard each call on its
// own id rather than on an OR across both.
function setHexSelected(map, source, id, selected) {
    if (id === null || id === undefined) return;
    map.setFeatureState({ source, id }, { selected });
}
const channel = socket.channel("h3:new")

const DAY_MS = 24 * 60 * 60 * 1000;

// Per-project Timeline config, injected at build time from the
// TIMELINE_PROJECT_CONFIG env var (.env.development locally; the server-side
// .env in prod — see .env.production.example). Shape, keyed by project `code`:
//   { "<code>": { "start": "YYYY-MM-DD", "speed": 1|2|4 }, ... }
// `start` = the bloom start date; `speed` = the default sweep speed for that
// project (user can still change it in the expanded scrubber). Missing/invalid
// → empty config; such projects fall back to today − FALLBACK_LOOKBACK_DAYS and
// speed 1. This is the interim home before app.buoy.fish serves it (behind auth).
const TIMELINE_PROJECT_CONFIG = (() => {
  try { return JSON.parse(process.env.TIMELINE_PROJECT_CONFIG || "{}"); }
  catch (e) { console.warn("Invalid TIMELINE_PROJECT_CONFIG JSON:", e); return {}; }
})();
const FALLBACK_LOOKBACK_DAYS = 60;

// 'YYYY-MM-DD' -> epoch-ms at LOCAL midnight of that calendar day.
function parseLocalDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function Map(props) {
    // `startZoom` is supplied by MapScreen.js from the admin-editable
    // map.buoy.fish default view (fetched from app.buoy.fish on page load,
    // cached in localStorage). Falls back to the historical hard-coded 11
    // when callers don't pass anything so behavior is unchanged for any
    // call sites that don't yet wire it through.
    const [viewState, setViewState] = useState({
        latitude: props.startLatitude,
        longitude: props.startLongitude,
        zoom: props.startZoom ?? 11,
        bearing: 0,
        pitch: 0
    });
    const mapRef = useRef(null);

    // Ref-callback that doubles as our earliest hook into the underlying
    // mapbox-gl map instance. We use it to register a `style.load` listener
    // (which fires ~500 ms BEFORE the higher-level `onLoad` callback) so we
    // can apply the dark-satellite treatment to raster layers BEFORE the
    // first tiles render. Hooking from `onLoad` was too late — tiles had
    // already painted with default bright values, producing the bright→dark
    // flash users reported.
    const styleLoadHandlerAttachedRef = useRef(false);
    const setMapRef = useCallback((r) => {
        mapRef.current = r;
        if (!r || styleLoadHandlerAttachedRef.current) return;
        const m = r.getMap?.();
        if (!m) return;
        styleLoadHandlerAttachedRef.current = true;
        m.on('style.load', () => {
            // Strip distracting roads, admin boundaries, and national parks on
            // BOTH basemaps (Mapbox satellite-streets and the CARTO fallback).
            hideBasemapClutter(m);
            if (USE_MAPBOX) {
                applySatelliteTreatment(m, darkSatelliteRef.current ? SATELLITE_DARK_TREATMENT : SATELLITE_LIGHT_TREATMENT);
            }
        });
    }, []);
    // Ref to synchronously track which hex was loaded by a user click.
    // Unlike useState, refs update immediately and are available in closures
    // without waiting for a re-render. This prevents the location useEffect
    // and the deep-link selection effect from re-triggering for a hex that onClick already loaded.
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
    // True when the URL targets a specific hex (/uplinks/hex/:hexId). Used to
    // suppress the first-time WelcomeModal — a user arriving via a shared hex
    // link wants the coverage, not the intro placard.
    const isHexDeepLink = routerParams.hexId != null && routerParams.hexId !== 'undefined';
    const [initComplete, setInitComplete] = useState(false);
    const [lastPath, setLastPath] = useState(false);
    const [showHexPaneCloseButton, setShowHexPaneCloseButton] = useState(false);
    const [hexGeoJson, setHexGeoJson] = useState(emptyFC);
    const [gatewayGeoJson, setGatewayGeoJson] = useState(emptyFC);
    const [gatewayRecords, setGatewayRecords] = useState({});
    const [showGateways, setShowGateways] = useState(false);
    const [hideCoverage, setHideCoverage] = useState(false);
    // ------------------------------------------------------------------
    // Gateway marker tooltip. Desktop: lingering hover (300ms) or click;
    // touch: long-press (500ms). A hover-opened popup is transient (clears
    // when the pointer leaves the marker); click/long-press pins it until
    // it's explicitly closed or the map is clicked elsewhere.
    // ------------------------------------------------------------------
    const [gatewayPopup, setGatewayPopup] = useState(null); // { lng, lat, gw, pinned }
    const gwHoverTimerRef = useRef(null);
    const gwLongPressTimerRef = useRef(null);
    const gwHoveredEuiRef = useRef(null);

    // Pull the gateway feature (if any) out of an interactive-layer event and
    // normalize its properties. queryRenderedFeatures JSON-stringifies array
    // property values, so concentrator_ids comes back as a string.
    const gatewayFromEvent = (event) => {
        const f = (event.features || []).find(ft => ft.layer && ft.layer.id === 'gatewayMarkerLayer');
        if (!f) return null;
        const gw = { ...f.properties };
        if (typeof gw.concentrator_ids === 'string') {
            try { gw.concentrator_ids = JSON.parse(gw.concentrator_ids); }
            catch (_) { gw.concentrator_ids = []; }
        }
        const [lng, lat] = f.geometry.coordinates;
        return { lng, lat, gw };
    };

    // Hover handling is driven from onMouseMove rather than onMouseEnter /
    // onMouseLeave: gateways usually sit ON TOP of coverage hexes, which are
    // also interactive layers, so enter/leave (which fire on the union of all
    // interactive features) never fire when sliding from hex onto marker.
    const onMouseMove = useCallback(event => {
        const canvas = mapRef.current?.getMap()?.getCanvas();
        const gwHit = gatewayFromEvent(event);
        if (gwHit) {
            if (canvas) canvas.style.cursor = 'pointer';
            if (gwHoveredEuiRef.current !== gwHit.gw.gateway_eui) {
                gwHoveredEuiRef.current = gwHit.gw.gateway_eui;
                clearTimeout(gwHoverTimerRef.current);
                gwHoverTimerRef.current = setTimeout(() => {
                    // Never downgrade a pinned popup to a transient one.
                    setGatewayPopup(p => (p && p.pinned ? p : { ...gwHit, pinned: false }));
                }, 300);
            }
        } else {
            if (canvas) canvas.style.cursor = '';
            if (gwHoveredEuiRef.current !== null) {
                gwHoveredEuiRef.current = null;
                clearTimeout(gwHoverTimerRef.current);
                setGatewayPopup(p => (p && !p.pinned ? null : p));
            }
        }
    }, []);

    const onTouchStart = useCallback(event => {
        clearTimeout(gwLongPressTimerRef.current);
        const gwHit = gatewayFromEvent(event);
        if (!gwHit) return;
        gwLongPressTimerRef.current = setTimeout(() => {
            setGatewayPopup({ ...gwHit, pinned: true });
        }, 500);
    }, []);
    // Any movement / release before the long-press fires cancels it (a moving
    // finger is a pan, a quick release is a tap — onClick handles the tap).
    const cancelGwLongPress = useCallback(() => clearTimeout(gwLongPressTimerRef.current), []);

    // Tidy up: no orphaned popup when the layer is toggled off, no timers on unmount.
    React.useEffect(() => { if (!showGateways) setGatewayPopup(null); }, [showGateways]);
    React.useEffect(() => () => {
        clearTimeout(gwHoverTimerRef.current);
        clearTimeout(gwLongPressTimerRef.current);
    }, []);
    // Timeline mode: when on, we mount a separate static render path showing
    // all confirmed-coverage hexes (fetched from /api/v1/coverage/timeline) and
    // suppress the live uplink-tileserver / uplink-channel sources. The live
    // h3:new channel handler is frozen via timelineModeRef (declared below the
    // state it mirrors, to dodge the minifier TDZ gotcha).
    const [timelineMode, setTimelineMode] = useState(false);
    const [timelineGeoJson, setTimelineGeoJson] = useState(emptyFC);
    // When a project ▶ Timeline launch is in flight: holds the queued bloom
    // window { start, end } (epoch-ms), or null. Set by onRunProjectTimeline
    // alongside the fly + setTimelineMode(true), consumed by the deterministic
    // auto-play effect below once the timeline data has loaded.
    const [pendingPlay, setPendingPlay] = useState(null);
    const timelineModeRef = useRef(false);
    React.useEffect(() => { timelineModeRef.current = timelineMode; }, [timelineMode]);

    // ------------------------------------------------------------------
    // Timeline control state. Lifted here so the two timeline Layers'
    // filters stay declarative props driven by rangeStart / cursor.
    //   - rangeStart / rangeEnd: window handles, snapped to LOCAL whole days.
    //   - cursor: continuous epoch-ms playhead ("coverage as-of this instant").
    //   - playing / speed / showBaseline: playback + display knobs.
    // A full sweep of [rangeStart, rangeEnd] takes ~20s at 1x, divided by speed.
    // ------------------------------------------------------------------
    const TIMELINE_SWEEP_MS = 20000;
    const [rangeStart, setRangeStart] = useState(0);
    const [rangeEnd, setRangeEnd] = useState(0);
    const [cursor, setCursor] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [showBaseline, setShowBaseline] = useState(false);
    // Continuous loop: when on, the bloom restarts from rangeStart on reaching
    // the end instead of the default one-shot stop. Drives shareable "always
    // playing" deep-links.
    const [loop, setLoop] = useState(false);
    // The project code currently framed by the timeline, set on launch. Lets the
    // Copy-link button serialize a deep-link back to this exact view.
    const [activeTimelineProjectCode, setActiveTimelineProjectCode] = useState(null);
    // Scrubber expanded/minimized state — LIFTED from TimelineControl so it can
    // be both set from the `open` deep-link param and read into the share URL.
    const [timelineExpanded, setTimelineExpanded] = useState(false);

    // Time domain of the loaded timeline data: [minT, maxT] over first_seen.
    // Memoized so handle/playhead math has a stable domain. When there are no
    // features (or none with first_seen), minT/maxT are null and the control is
    // not rendered (see render path).
    const timeDomain = React.useMemo(() => {
        const feats = timelineGeoJson.features || [];
        let minT = null, maxT = null;
        for (const f of feats) {
            const t = f.properties && f.properties.first_seen;
            if (typeof t !== 'number') continue;
            if (minT === null || t < minT) minT = t;
            if (maxT === null || t > maxT) maxT = t;
        }
        return { minT, maxT };
    }, [timelineGeoJson]);

    // inRangeCount: number of features whose first_seen falls in the selected
    // window. Drives the "No new coverage in this range" empty-state caption.
    const inRangeCount = React.useMemo(() => {
        const feats = timelineGeoJson.features || [];
        let n = 0;
        for (const f of feats) {
            const t = f.properties && f.properties.first_seen;
            if (typeof t !== 'number') continue;
            if (t >= rangeStart && t <= rangeEnd) n++;
        }
        return n;
    }, [timelineGeoJson, rangeStart, rangeEnd]);

    // Animation loop. rAF with a timestamp delta (no 60fps assumption). A full
    // sweep of the selected range takes TIMELINE_SWEEP_MS / speed; on reaching
    // rangeEnd we STOP (one-shot — the bloom plays once to current coverage and
    // rests there; replay via ▶ / Play again). Refs mirror the
    // state the loop needs so the rAF closure (created once per play) reads
    // live values without re-subscribing each frame. Declared AFTER the state
    // they mirror to dodge the minifier TDZ gotcha.
    const rafRef = useRef(null);
    const lastTsRef = useRef(0);
    const rangeStartRef = useRef(rangeStart);
    const rangeEndRef = useRef(rangeEnd);
    const speedRef = useRef(speed);
    const cursorRef = useRef(cursor);
    // loopRef mirrors `loop` so the rAF tick reads the live value without
    // re-subscribing (toggling loop mid-sweep takes effect on the next wrap).
    // Declared AFTER the `loop` state to dodge the minifier TDZ gotcha.
    const loopRef = useRef(loop);
    React.useEffect(() => { rangeStartRef.current = rangeStart; }, [rangeStart]);
    React.useEffect(() => { rangeEndRef.current = rangeEnd; }, [rangeEnd]);
    React.useEffect(() => { speedRef.current = speed; }, [speed]);
    React.useEffect(() => { cursorRef.current = cursor; }, [cursor]);
    React.useEffect(() => { loopRef.current = loop; }, [loop]);

    const stopRaf = useCallback(() => {
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    React.useEffect(() => {
        if (!playing) { stopRaf(); return; }
        const { minT, maxT } = timeDomain;
        if (minT === null || maxT === null) { setPlaying(false); return; }
        // On play: if parked at (or past) the end, restart the sweep at the
        // range start.
        if (cursorRef.current >= rangeEndRef.current) {
            cursorRef.current = rangeStartRef.current;
            setCursor(rangeStartRef.current);
        }
        lastTsRef.current = 0;
        const tick = (ts) => {
            if (lastTsRef.current === 0) lastTsRef.current = ts;
            const dtMs = ts - lastTsRef.current;
            lastTsRef.current = ts;
            const span = Math.max(1, rangeEndRef.current - rangeStartRef.current);
            // data-ms advanced this frame = span * (wallclock-dt / sweepDuration)
            const sweepDuration = TIMELINE_SWEEP_MS / speedRef.current;
            const advance = span * (dtMs / sweepDuration);
            let next = cursorRef.current + advance;
            if (next >= rangeEndRef.current) {
                if (loopRef.current) {
                    // Loop mode: wrap back to the range start and keep sweeping,
                    // so shared "always playing" links cycle forever. Read via
                    // loopRef so toggling loop mid-sweep takes effect here.
                    next = rangeStartRef.current;
                    cursorRef.current = next;
                    setCursor(next);
                    rafRef.current = requestAnimationFrame(tick);
                    return;
                }
                // One-shot: clamp to the end ("current coverage"), stop, and do
                // NOT schedule another frame. The bloom plays once and rests at
                // present-day coverage. Use ▶ / Play again to replay.
                next = rangeEndRef.current;
                cursorRef.current = next;
                setCursor(next);
                setPlaying(false);
                return;
            }
            cursorRef.current = next;
            setCursor(next);
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return stopRaf;
    }, [playing, timeDomain, stopRaf]);

    // Stop playback + cancel rAF when leaving timeline mode or unmounting.
    React.useEffect(() => {
        if (!timelineMode) { setPlaying(false); stopRaf(); }
    }, [timelineMode, stopRaf]);
    React.useEffect(() => () => stopRaf(), [stopRaf]);

    // Deterministic one-shot auto-play. Waits for the timeline data to load, then
    // ~800ms for the fly to settle, then plays the bloom over the pending window.
    React.useEffect(() => {
        if (!pendingPlay) return;
        if (!(timelineGeoJson.features && timelineGeoJson.features.length)) return;
        const { start, end } = pendingPlay;
        const timer = setTimeout(() => {
            cursorRef.current = start;
            setRangeStart(start);
            setRangeEnd(end);
            setCursor(start);
            setPlaying(true);
            setPendingPlay(null);
        }, 800);
        return () => clearTimeout(timer);
    }, [pendingPlay, timelineGeoJson]);

    // Control callbacks. Dragging the playhead / setting the cursor manually is
    // a scrub and should not need to pause here (TimelineControl pauses on
    // playhead drag); these are plain setters used by the control.
    const onSetCursor = useCallback(v => setCursor(v), []);
    const onSetRangeStart = useCallback(v => setRangeStart(v), []);
    const onSetRangeEnd = useCallback(v => setRangeEnd(v), []);
    const onTogglePlay = useCallback(() => setPlaying(p => !p), []);
    const onSetSpeed = useCallback(s => setSpeed(s), []);
    const onToggleBaseline = useCallback(() => setShowBaseline(b => !b), []);

    // Declarative MapLibre filters for the two timeline layers, driven by state.
    //   Bloom:    in-range hexes revealed up to the cursor.
    //   Baseline: pre-range footprint (first_seen < rangeStart).
    const timelineRevealFilter = React.useMemo(() => ([
        'all',
        ['>=', ['get', 'first_seen'], rangeStart],
        ['<=', ['get', 'first_seen'], cursor]
    ]), [rangeStart, cursor]);
    // When showBaseline is off, gate the (always-mounted) baseline layer with a
    // match-nothing filter instead of unmounting it. first_seen is always a
    // positive epoch-ms, so == -1 never matches → nothing drawn.
    const timelineBaselineFilter = React.useMemo(() => (
        showBaseline
            ? ['<', ['get', 'first_seen'], rangeStart]
            : ['==', ['get', 'first_seen'], -1]
    ), [showBaseline, rangeStart]);
    // Dark/light satellite toggle. Default true (dark) so first-time visitors
    // see the visually punchy treatment that lets coverage hexes pop. Persisted
    // per-browser via localStorage so users keep their preference across visits.
    const [darkSatellite, setDarkSatellite] = useLocalStorageState('darkSatellite_v1', { defaultValue: true });
    // Mirror darkSatellite into a ref so the early style.load listener
    // (registered once at mount, in setMapRef) reads the current value rather
    // than the stale closure-captured value from mount time. Must be declared
    // AFTER darkSatellite to avoid a TDZ error when minified.
    const darkSatelliteRef = useRef(darkSatellite);
    React.useEffect(() => { darkSatelliteRef.current = darkSatellite; }, [darkSatellite]);

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

    // True when the URL is a timeline deep-link (?play=...). Captured at mount
    // (empty deps) and used, like isHexDeepLink, to suppress the first-time
    // WelcomeModal — a shared "click to play" link wants the animation, not the
    // intro placard.
    const isTimelineDeepLink = React.useMemo(() => !!parseTimelineLink(location.search), []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load hex data from the Phoenix API (replaces Martin tile server). The
    // endpoint returns a compact array of [id_string, id_int, best_rssi, snr];
    // we rebuild each hex polygon from its H3 index via geojson2h3 — the same
    // call the h3:new channel uses below — so the two sources stay identical.
    // properties.id stays the H3 STRING (onClick navigates /uplinks/hex/:id and
    // calls getHex with it); feature.id is the INTEGER for feature-state select.
    React.useEffect(() => {
        fetch('/api/v1/hexes')
            .then(res => res.json())
            .then(rows => {
                const features = rows.map(([idStr, _idInt, best_rssi, snr]) => {
                    const f = geojson2h3.h3ToFeature(idStr, { id: idStr, id_string: idStr, best_rssi, snr });
                    // The feature id is carried by `promoteId: "id"` on the Source,
                    // not by this top-level field. mapbox-gl's GeoJSON->vector-tile
                    // encoder only writes an id when Number.isSafeInteger(+id), and
                    // h3_index_int exceeds 2^53, so a numeric id is silently dropped
                    // and every clicked feature arrives with id === undefined.
                    // Setting it to the H3 string keeps the deep-link synthetic
                    // feature below consistent with the promoted id.
                    f.id = idStr;
                    return f;
                });
                setHexGeoJson({ type: "FeatureCollection", features });
            })
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
                        last_heard: gw.last_heard ?? null,
                        installed_at: gw.installed_at ?? null,
                        role: gw.role ?? null,
                        description: gw.description ?? null,
                        altitude: gw.altitude ?? null,
                        concentrator_ids: gw.concentrator_ids || []
                    }
                }));
                setGatewayGeoJson({ type: "FeatureCollection", features });

                // Index the inventory record under every identifier the
                // gateway can be heard by: hardware EUI plus each concentrator
                // (slot) GWID. The packet forwarder always emits a slot GWID
                // in rxInfo.gatewayId, never the hardware EUI, so the
                // concentrator IDs are what actually land in
                // uplinks_heard.gateway_id at ingest time. Indexing the full
                // record (not just the name) lets the InfoPane show both the
                // hardware EUI and the concentrator that heard each hop.
                const records = {};
                (data.gateways || []).forEach(gw => {
                    if (!gw.hotspot_name) return;
                    const record = {
                        name: gw.hotspot_name,
                        gateway_eui: gw.gateway_eui,
                        concentrator_ids: gw.concentrator_ids || [],
                    };
                    if (gw.gateway_eui) records[gw.gateway_eui] = record;
                    (gw.concentrator_ids || []).forEach(cid => {
                        if (cid) records[cid] = record;
                    });
                });
                setGatewayRecords(records);
            })
            .catch(err => console.error('Failed to load gateway data:', err));
    }, []);

    // Timeline data fetch. Triggered when entering timeline mode. The endpoint
    // returns a COMPACT array ([{h, t, r}, ...]), NOT GeoJSON — we map each row
    // into a GeoJSON Polygon Feature here (mirroring selectedHexGeoJson's use of
    // h3ToGeoBoundary). Refetch-on-enter is fine since the endpoint is
    // parameterless; the cache guard skips refetch once features are loaded.
    React.useEffect(() => {
        if (!timelineMode) return;
        if (timelineGeoJson.features && timelineGeoJson.features.length > 0) return;
        fetch('/api/v1/coverage/timeline')
            .then(res => res.json())
            .then(rows => {
                const features = (rows || []).map(row => ({
                    type: "Feature",
                    geometry: { type: "Polygon", coordinates: [h3ToGeoBoundary(row.h, true)] },
                    properties: { id: row.h, best_rssi: row.r, first_seen: row.t }
                }));
                setTimelineGeoJson({ type: "FeatureCollection", features });
            })
            .catch(err => console.error('Failed to load timeline data:', err));
    }, [timelineMode]);

    React.useEffect(() => {
        if (!initComplete && location.pathname != lastPath) {
            setLastPath(location.pathname);
            let features = []
            channel.on("new_h3", payload => {
                // Freeze the live channel while in timeline mode so a historical
                // view doesn't twitch as live uplinks land. timelineModeRef is a
                // ref (not state) because this handler closure is created once.
                if (timelineModeRef.current) return;
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

            setInitComplete(true);
        }
        else if (initComplete && location.pathname != lastPath) {

            setLastPath(location.pathname);
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
        setHexSelected(map, 'uplink-tileserver', selectedStateIdTile, true);
        setHexSelected(map, 'uplink-channel', selectedStateIdChannel, true);
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
                    if (h.gateway_id) {
                        gwPositions[h.gateway_id] = { lat: h.lat, lng: h.lng };
                    }
                });
                // Track which gateway IDs are part of a mesh path
                const meshGwIds = new Set();
                uplinks.uplinks.forEach(h => {
                    if (h.relay_gateway_id) {
                        meshGwIds.add(h.relay_gateway_id);
                        meshGwIds.add(h.gateway_id);
                    }
                });

                uplinks.uplinks.map((h, i) => {
                    const hotspot_h3_index = geoToH3(h.lat, h.lng, 8)
                    const hotspot_coords = h3ToGeo(hotspot_h3_index)
                    const hotspot_polygon_coords = h3ToGeoBoundary(hotspot_h3_index, true)
                    const isMesh = meshGwIds.has(h.gateway_id);

                    if (h.relay_gateway_id && gwPositions[h.relay_gateway_id]) {
                        // Relay leg: draw line from mesh GW to this border GW
                        const relayPos = gwPositions[h.relay_gateway_id];
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
        // A gateway marker swallows the click: show its tooltip (pinned)
        // instead of selecting the coverage hex underneath. Always open —
        // never toggle — so the synthetic click that follows a touch
        // long-press doesn't immediately close the popup it just opened.
        const gwHit = gatewayFromEvent(event);
        if (gwHit) {
            clearTimeout(gwHoverTimerRef.current);
            setGatewayPopup({ ...gwHit, pinned: true });
            return;
        }
        setGatewayPopup(null);
        setShowHexPaneCloseButton(false);
        // A click selects exactly ONE hex: the topmost feature under the
        // cursor. queryRenderedFeatures can hand us the same hex more than
        // once (a cell straddling a tile boundary is carried in both tiles'
        // buffers, and the library can only dedupe when features have ids),
        // and distinct hexes can overlap where the live channel source covers
        // a cell the coverage source already has. Iterating the whole array
        // ran the select-navigate-fetch path once per feature, so the last one
        // silently won the URL. Take the first match and dispatch on it.
        const feature = (features || []).find(
            f => f?.layer && HEX_LAYERS.includes(f.layer.id)
        );
        if (!feature) return;

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
            setHexSelected(map, 'uplink-tileserver', selectedStateIdTile, true);
            setHexSelected(map, 'uplink-channel', selectedStateIdChannel, true);
            selectedStateIdTile = feature.id;
            setHexSelected(map, 'uplink-tileserver', selectedStateIdTile, false);
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
            setHexSelected(map, 'uplink-channel', selectedStateIdChannel, true);
            setHexSelected(map, 'uplink-tileserver', selectedStateIdTile, true);
            selectedStateIdChannel = feature.id;
            setHexSelected(map, 'uplink-channel', selectedStateIdChannel, false);

            // Don't fly/zoom on click. The previous `map.fitBounds([bbox of
            // single H3 res9 cell])` zoomed to ~level 18 (a single 150 m
            // hex filling the screen), which felt broken. Hexes from the
            // initial /api/v1/hexes load (handled by the public.h3_res9
            // branch above) never zoomed; matching that behavior makes
            // click feedback consistent regardless of when the hex first
            // appeared on the map.

            setTimeout(() => { setShowHexPaneCloseButton(true); }, 1000)
        }
        else if (feature.layer.id == "timelineRevealLayer" || feature.layer.id == "timelineBaselineLayer") {
            // Timeline hexes open the same InfoPane as live hexes. The
            // detail (hotspot list, distances) comes from
            // /api/v1/uplinks/hex/:id, which works for any hex. Timeline
            // features carry NO `snr` property (the endpoint omits it),
            // so we pass null rather than calling .toFixed on undefined —
            // InfoPane tolerates a null/empty snr. Feature-state
            // selection highlighting is skipped for timeline hexes in
            // this slice.
            clickedHexRef.current = feature.properties.id;
            setHexId(feature.properties.id);
            setBestRssi(feature.properties.best_rssi);
            setSnr(null);
            getHex(feature.properties.id);
            setShowHexPane(true);
            navigate("/uplinks/hex/" + feature.properties.id);
            setTimeout(() => { setShowHexPaneCloseButton(true); }, 1000)
        }
    }, []);

    // Deep-link selection. When the URL is /uplinks/hex/:hexId, select that hex
    // once the coverage GeoJSON has loaded. Keyed on hexGeoJson rather than a
    // fixed timer: the old approach fired a 500ms timer and queried map tiles
    // that were still empty (the /api/v1/hexes fetch is ~2.4MB and lands well
    // after 500ms), found nothing, and gave up — so deep links silently failed.
    // Driving off the data we already hold in state is deterministic and
    // race-free. clickedHexRef guards against re-running for a hex the user
    // just clicked (onClick sets it synchronously before navigate()).
    React.useEffect(() => {
        const hexId = routerParams.hexId;
        if (hexId == null || hexId === 'undefined') return;
        if (hexId === clickedHexRef.current) return;
        const feature = (hexGeoJson.features || []).find(
            f => f.properties && f.properties.id === hexId
        );
        if (!feature) return;
        clickedHexRef.current = hexId;
        const synthetic = {
            ...feature,
            layer: { id: "public.h3_res9", layout: {}, source: "uplink-tileserver", type: "fill" }
        };
        onClick({ features: [synthetic] });
    }, [hexGeoJson, routerParams.hexId]);

    const onFlyToProject = useCallback(project => {
        setViewState(prev => ({
            ...prev,
            latitude: project.lat,
            longitude: project.lng,
            zoom: project.zoom || 12
        }));
    }, []);

    // Core Timeline launcher: fly to the project's framed view, enter Timeline
    // mode, and queue the deterministic bloom over [start, end]. All knobs are
    // explicit so both the InfoPane project launch (config defaults) and a
    // shareable deep-link (URL-derived values) funnel through one path and reuse
    // the existing pendingPlay → data-loaded → auto-play machinery.
    const launchTimeline = useCallback(({ projectCode, lat, lng, zoom, start, end, speed, baseline, loop, open }) => {
        setViewState(prev => ({ ...prev, latitude: lat, longitude: lng, zoom }));
        setTimelineMode(true);
        // Start BLANK so the bloom begins on an empty map (no full→blank flash).
        setRangeStart(0); setRangeEnd(0); setCursor(0); setPlaying(false);
        setActiveTimelineProjectCode(projectCode);
        setSpeed(speed || 1);
        setShowBaseline(!!baseline);
        setLoop(!!loop);
        setTimelineExpanded(!!open);
        setPendingPlay({ start, end });
    }, []);

    // Run the (global) Timeline framed on a project's region (InfoPane ▶ button).
    // No data scoping — the timeline stays global; we only frame the view. Uses
    // the per-project config for start/speed, the project's coords/zoom for
    // framing, and the non-deep-link defaults (baseline/loop off, minimized).
    const onRunProjectTimeline = useCallback((project) => {
        const cfg = TIMELINE_PROJECT_CONFIG[project.code] || {};
        const start = cfg.start
            ? startOfLocalDay(parseLocalDate(cfg.start))
            : startOfLocalDay(Date.now() - FALLBACK_LOOKBACK_DAYS * DAY_MS);
        const end = endOfLocalDay(Date.now());
        launchTimeline({
            projectCode: project.code, lat: project.lat, lng: project.lng, zoom: project.zoom || 12,
            start, end, speed: cfg.speed || 1, baseline: false, loop: false, open: false,
        });
    }, [launchTimeline]);

    // Shareable deep-link: on mount, if the URL carries ?play=<project-code>,
    // resolve the project and launch the timeline with URL-derived values
    // (URL overrides per-project config which overrides hardcoded defaults).
    // Runs ONCE — `location.search` is intentionally NOT a dependency so later
    // in-app navigations don't relaunch. Resolves the slug via the same projects
    // util InfoPane uses (cache-first, then a one-shot live fetch).
    React.useEffect(() => {
        const intent = parseTimelineLink(location.search);
        if (!intent) return;
        const launchFrom = (project) => {
            if (!project) { console.warn('timeline deep-link: unknown project', intent.play); return; }
            const cfg = TIMELINE_PROJECT_CONFIG[project.code] || {};
            const cfgStart = cfg.start
                ? startOfLocalDay(parseLocalDate(cfg.start))
                : startOfLocalDay(Date.now() - FALLBACK_LOOKBACK_DAYS * DAY_MS);
            const cfgEnd = endOfLocalDay(Date.now());
            let start = intent.start != null ? startOfLocalDay(intent.start) : cfgStart;
            let end = intent.end != null ? endOfLocalDay(intent.end) : cfgEnd;
            if (end <= start) {
                console.warn('timeline deep-link: end<=start, falling back to config window');
                start = cfgStart; end = cfgEnd;
            }
            const speed = intent.speed != null ? intent.speed : (cfg.speed || 1);
            // Camera: the sender's exact lat/lng/zoom if the link carries them,
            // else the project's default framing.
            const lat = intent.lat != null ? intent.lat : project.lat;
            const lng = intent.lng != null ? intent.lng : project.lng;
            const zoom = intent.zoom != null ? intent.zoom : (project.zoom || 12);
            launchTimeline({
                projectCode: project.code, lat, lng, zoom,
                start, end, speed, baseline: intent.baseline, loop: intent.loop, open: intent.open,
            });
        };
        const resolve = (list) => (list || []).find(p => p.code === intent.play) || null;
        // getInitialProjects() is synchronous (cache/fallback, never null) — the
        // common case launches immediately.
        const synced = resolve(getInitialProjects());
        if (synced) { launchFrom(synced); return; }
        // Cold cache for a non-fallback project: try the live list once.
        let cancelled = false;
        fetchProjects().then(list => {
            if (cancelled) return;
            if (!list) { console.warn('timeline deep-link: project list unavailable for', intent.play); return; }
            launchFrom(resolve(list));
        });
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

    // Absolute shareable URL reflecting the current timeline state, fed to the
    // Copy-link button. Null until a timeline has been launched (no active
    // project to name).
    const shareUrl = React.useMemo(() => {
        if (!activeTimelineProjectCode) return null;
        return buildTimelineLink({
            projectCode: activeTimelineProjectCode,
            rangeStart, rangeEnd, speed, baseline: showBaseline, loop, open: timelineExpanded,
            // Capture the sender's live camera so the link recreates this exact
            // view, not the project's default coords/zoom.
            lat: viewState.latitude, lng: viewState.longitude, zoom: viewState.zoom,
        });
    }, [activeTimelineProjectCode, rangeStart, rangeEnd, speed, showBaseline, loop, timelineExpanded,
        viewState.latitude, viewState.longitude, viewState.zoom]);

    // Replay the current range from its start (used by the ↻ button in the
    // minimized control). Re-arms playing; the play effect's "if cursor>=end,
    // reset to start" guard also covers the case where the cursor is parked at
    // the end, but we set it explicitly here for immediacy.
    const onPlayAgain = useCallback(() => {
        cursorRef.current = rangeStart;
        setCursor(rangeStart);
        setPlaying(true);
    }, [rangeStart]);

    // Re-apply satellite treatment whenever the user toggles the theme.
    // Initial application happens via the MapGL onLoad callback below; this
    // effect only handles user-initiated toggles after the map is loaded.
    React.useEffect(() => {
        if (!USE_MAPBOX) return;
        const map = mapRef.current?.getMap();
        if (!map || !map.isStyleLoaded()) return;
        applySatelliteTreatment(map, darkSatellite ? SATELLITE_DARK_TREATMENT : SATELLITE_LIGHT_TREATMENT);
    }, [darkSatellite]);

    // Reflect the active basemap brightness on <html> so the map control pane
    // can adapt its chrome (dark frosted glass over dark imagery, light card
    // over bright). The CARTO fallback is always dark.
    React.useEffect(() => {
        const dark = USE_MAPBOX ? darkSatellite : true;
        const el = document.documentElement;
        el.classList.toggle('sat-dark', dark);
        el.classList.toggle('sat-light', !dark);
    }, [darkSatellite]);

    const interactiveLayerIds = [...HEX_LAYERS, 'gatewayMarkerLayer'];

    return (
        <div className='map-container'>
            <MapGL
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                style={{ width: "100vw", height: "100vh" }}
                mapStyle={MAP_STYLE}
                mapboxAccessToken={USE_MAPBOX ? MAPBOX_TOKEN : undefined}
                onClick={onClick}
                onMouseMove={onMouseMove}
                onTouchStart={onTouchStart}
                onTouchEnd={cancelGwLongPress}
                onTouchMove={cancelGwLongPress}
                onTouchCancel={cancelGwLongPress}
                onLoad={USE_MAPBOX ? (e) => {
                    // Belt-and-suspenders: in the rare case the
                    // ref-callback-attached `style.load` listener (in
                    // setMapRef) hasn't fired yet, apply the treatment + hide
                    // roads now too. The primary application path is the
                    // style.load listener — which fires ~500 ms earlier and
                    // BEFORE tiles render, eliminating the bright→dark flash.
                    applySatelliteTreatment(e.target, darkSatellite ? SATELLITE_DARK_TREATMENT : SATELLITE_LIGHT_TREATMENT);
                    hideBasemapClutter(e.target);
                } : undefined}
                ref={setMapRef}
                interactiveLayerIds={interactiveLayerIds}
            >
                {/* Satellite theme toggle, top of the control stack — only on
                    the Mapbox basemap (CARTO has no raster to treat). */}
                {USE_MAPBOX &&
                    <ThemeControl dark={darkSatellite} onToggle={() => setDarkSatellite(!darkSatellite)} />
                }
                <GeolocateControl
                    positionOptions={{ enableHighAccuracy: true }}
                    fitBoundsOptions={{ maxZoom: viewState.zoom }}
                    trackUserLocation={true}
                    position="top-right"
                />
                <NavigationControl position="top-right" />
                {/* Two render paths. In timeline mode we feed the static
                    historical-coverage source and suppress both live sources;
                    otherwise we render the live sources exactly as before.

                    The timeline Source + BOTH Layers are ALWAYS mounted (never
                    conditionally rendered) — react-map-gl's Layer does a setState
                    on unmount, which fired a "state update on unmounted
                    component" warning when exiting timeline mode. We gate them by
                    DATA/FILTER instead: empty FeatureCollection when not in
                    timeline mode (nothing drawn, clicks pass through), and the
                    baseline layer is shown/hidden via a match-nothing filter
                    rather than unmounting. */}
                <Source id="timeline" type="geojson" data={timelineMode ? timelineGeoJson : emptyFC}>
                    {/* Baseline declared FIRST so the bloom paints on top. */}
                    <Layer {...timelineBaselineLayer} filter={timelineBaselineFilter} />
                    <Layer {...timelineRevealLayer} filter={timelineRevealFilter} />
                </Source>
                {!timelineMode && !hideCoverage &&
                    <Source id="uplink-tileserver" type="geojson" data={hexGeoJson} promoteId="id">
                        <Layer {...uplinkTileServerLayer} />
                    </Source>
                }
                {!timelineMode && !hideCoverage &&
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
                {gatewayPopup &&
                    <PopupGL
                        longitude={gatewayPopup.lng}
                        latitude={gatewayPopup.lat}
                        anchor="bottom"
                        offset={14}
                        closeButton={false}
                        closeOnClick={false}
                        maxWidth="320px"
                        className="gateway-popup"
                    >
                        <GatewayTooltip gw={gatewayPopup.gw} onClose={() => setGatewayPopup(null)} />
                    </PopupGL>
                }

            </MapGL>
            <InfoPane hexId={hexId} bestRssi={bestRssi} snr={snr} uplinks={uplinks} gatewayRecords={gatewayRecords} showHexPane={showHexPane} onCloseHexPaneClick={onCloseHexPaneClick} showHexPaneCloseButton={showHexPaneCloseButton} showGateways={showGateways} onToggleGateways={() => setShowGateways(!showGateways)} hideCoverage={hideCoverage} onToggleCoverage={() => setHideCoverage(!hideCoverage)} onFlyToProject={onFlyToProject} onRunProjectTimeline={onRunProjectTimeline} timelineConfig={TIMELINE_PROJECT_CONFIG} />
            {timelineMode && timeDomain.minT !== null && timeDomain.maxT !== null &&
                <TimelineControl
                    minT={timeDomain.minT}
                    maxT={timeDomain.maxT}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    cursor={cursor}
                    playing={playing}
                    speed={speed}
                    showBaseline={showBaseline}
                    inRangeCount={inRangeCount}
                    autoPlayPending={pendingPlay !== null}
                    onSetRangeStart={onSetRangeStart}
                    onSetRangeEnd={onSetRangeEnd}
                    onSetCursor={onSetCursor}
                    onTogglePlay={onTogglePlay}
                    onSetSpeed={onSetSpeed}
                    onToggleBaseline={onToggleBaseline}
                    onPlayAgain={onPlayAgain}
                    onExit={() => setTimelineMode(false)}
                    loop={loop}
                    onToggleLoop={() => setLoop(l => !l)}
                    expanded={timelineExpanded}
                    onToggleExpanded={() => setTimelineExpanded(e => !e)}
                    shareUrl={shareUrl}
                />
            }
            <WelcomeModal showWelcomeModal={showWelcomeModal && !isHexDeepLink && !isTimelineDeepLink} onCloseWelcomeModalClick={onCloseWelcomeModalClick} />
        </div>
    );
}

export default Map;
