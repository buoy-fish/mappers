import React, { useEffect, useState } from "react"
import Map from "../components/Map"
import { useParams } from "react-router-dom";
import { h3ToGeo } from "h3-js";
import { getInitialMapView, refreshMapConfigInBackground } from "../utils/mapConfig"

function MapScreen() {
  let routerParams = useParams();

  // Synchronous read so the map mounts with a sensible center on the very
  // first paint. Reads from localStorage cache if fresh; otherwise returns
  // the baked-in fallback (Punta Abreojos). A background fetch refreshes
  // the cache so the next page load gets the current admin-edited value.
  const [initialView] = useState(() => getInitialMapView())

  useEffect(() => {
    refreshMapConfigInBackground()
  }, [])

  let latitude
  let longitude
  let zoom
  if (routerParams.hexId != null) {
    // Deep-link to a specific H3 hex — overrides the admin default. Existing
    // /uplinks/hex/:hexId behavior is unchanged.
    const hotspot_coords = h3ToGeo(routerParams.hexId)
    longitude = hotspot_coords[1]
    latitude = hotspot_coords[0]
    zoom = initialView.zoom
  } else {
    latitude = initialView.lat
    longitude = initialView.lon
    zoom = initialView.zoom
  }

  return (
    <div>
      <Map
        startLatitude={latitude}
        startLongitude={longitude}
        startZoom={zoom}
        routerParams={routerParams}
      />
    </div>
  )
}

export default MapScreen;
