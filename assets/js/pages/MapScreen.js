import React, { useEffect, useState } from "react"
import Map from "../components/Map"
import { useParams, useLocation } from "react-router-dom";
import { h3ToGeo } from "h3-js";
import { getInitialMapView, refreshMapConfigInBackground } from "../utils/mapConfig"
import { parseProjectLink } from "../utils/projectLink"
import { getInitialProjects } from "../utils/projects"

function MapScreen() {
  let routerParams = useParams();
  const location = useLocation();

  // Synchronous read so the map mounts with a sensible center on the very
  // first paint. Reads from localStorage cache if fresh; otherwise returns
  // the baked-in fallback (Punta Abreojos). A background fetch refreshes
  // the cache so the next page load gets the current admin-edited value.
  const [initialView] = useState(() => getInitialMapView())

  useEffect(() => {
    refreshMapConfigInBackground()
  }, [])

  // A project deep-link (/<slug>[/<flag>...]) frames that project. Resolved
  // here, synchronously from the cached/fallback list, so the map's FIRST paint
  // is already at the project — Map.js re-applies the same framing once it
  // resolves the slug (and handles the cold-cache case), but doing it here means
  // a shared link doesn't visibly jump from the default view.
  const deepLinkedProject = React.useMemo(() => {
    if (routerParams.hexId != null) return null
    const intent = parseProjectLink(location.pathname)
    if (!intent || !intent.project) return null
    return getInitialProjects().find((p) => p.code === intent.project) || null
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- first paint only

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
  } else if (deepLinkedProject) {
    latitude = deepLinkedProject.lat
    longitude = deepLinkedProject.lng
    zoom = deepLinkedProject.zoom || 12
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
