import React from 'react'
import { useControl } from 'react-map-gl/maplibre'

// Shown when dark satellite is ON (a sun → "switch to light").
const SUN = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>'
// Shown when dark satellite is OFF (a moon → "switch to dark").
const MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'

// Imperative MapLibre/Mapbox control so the satellite theme button lives
// NATIVELY in the same top-right ctrl stack as zoom/compass/geolocate — one
// cohesive instrument pane rather than a separate floating panel. Both class
// prefixes are applied so the GL stylesheet groups/positions it correctly
// under either renderer.
class ThemeControlImpl {
  onAdd() {
    const c = document.createElement('div')
    c.className = 'maplibregl-ctrl maplibregl-ctrl-group mapboxgl-ctrl mapboxgl-ctrl-group'
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'theme-ctrl-btn'
    c.appendChild(b)
    this._container = c
    this._button = b
    return c
  }
  onRemove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container)
    }
  }
}

// `dark` = dark-satellite active. Rendered only on the Mapbox basemap (the
// CARTO fallback has no raster layers to treat), so it sits above the
// GeolocateControl/NavigationControl in the stack.
export default function ThemeControl({ dark, onToggle, position = 'top-right' }) {
  const ctl = useControl(() => new ThemeControlImpl(), { position })

  React.useEffect(() => {
    const b = ctl && ctl._button
    if (!b) return
    b.onclick = onToggle
    b.innerHTML = dark ? SUN : MOON
    const label = dark ? 'Switch to light satellite' : 'Switch to dark satellite'
    b.setAttribute('aria-label', label)
    b.title = label
  }, [ctl, dark, onToggle])

  return null
}
