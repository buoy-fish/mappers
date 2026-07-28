defmodule MappersWeb.API.V1.HexController do
  use MappersWeb, :controller

  alias Mappers.Coverage.Scope
  alias Mappers.Repo
  alias Mappers.H3.Res9

  import Ecto.Query

  @doc """
  Serves all h3_res9 hexes as a COMPACT array for the map layer (replaces the
  retired Martin vector tile server).

  Each row is `[id_string, id_int, best_rssi, snr]`. We deliberately omit the
  polygon `geom`: the client rebuilds each hex boundary from its H3 index via
  geojson2h3 (the same path the live `h3:new` channel already uses), which cuts
  the payload from ~4 MB of coordinates to a few hundred KB (≈40 KB gzipped).

  `id_string` (the H3 index PK) drives click navigation (`/uplinks/hex/:id`);
  `id_int` (h3_index_int) is the integer feature id used for feature-state
  selection. A short public cache lets browsers reuse the slow-changing set —
  brand-new hexes still arrive live over the channel (URLs differ per scope,
  so the cache stays correct).

  `scope` narrows the set by contributing gateway: `permanent` (default, also
  any unknown value), `other` (the complement — hexes with no permanent
  contributor), `all` (unfiltered). Fail-open: when classification is
  unavailable every scope serves all rows.
  """
  def index(conn, params) do
    rows =
      Repo.all(from r in Res9, select: [r.id, r.h3_index_int, r.best_rssi, r.snr])
      |> Scope.filter_rows(Scope.parse_scope(params["scope"]), fn [id | _] -> id end)

    conn
    |> put_resp_header("cache-control", "public, max-age=60")
    |> json(rows)
  end
end
