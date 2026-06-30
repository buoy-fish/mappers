// Running ping tally for a project. Uplinks carry no project association, so
// the count is geographic: the mapper backend counts distinct device pings
// whose abstracted res9 hex falls within ~100km of the project centre (see
// Coverage.count_pings_near/2). Same-origin endpoint — no API base needed.
//
// Resolves to { count, radiusKm } on success, or null on any failure so the
// caller can render a graceful "—".
export function fetchPingCount(lat, lng, { timeoutMs = 6000 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null)

  const coords = `${lat},${lng}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  return fetch(`/api/v1/coverage/count/${coords}`, { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) =>
      j && Number.isFinite(j.count)
        ? { count: j.count, radiusKm: Math.round((j.radius_m || 100000) / 1000) }
        : null
    )
    .catch(() => null)
    .finally(() => clearTimeout(timer))
}
