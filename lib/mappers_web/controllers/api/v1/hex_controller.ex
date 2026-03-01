defmodule MappersWeb.API.V1.HexController do
  use MappersWeb, :controller

  alias Mappers.Repo
  alias Mappers.H3.Res9

  import Ecto.Query

  @doc """
  Serves all h3_res9 hexes as GeoJSON for the map layer.
  This replaces the Martin vector tile server for development
  and small-scale deployments.
  """
  def index(conn, _params) do
    hexes = Repo.all(from r in Res9, select: r)

    features =
      Enum.map(hexes, fn hex ->
        # Convert Geo.Polygon to GeoJSON coordinates
        coords = case hex.geom do
          %Geo.Polygon{coordinates: rings} ->
            Enum.map(rings, fn ring ->
              Enum.map(ring, fn {lng, lat} -> [lng, lat] end)
            end)
          _ -> []
        end

        %{
          type: "Feature",
          id: hex.h3_index_int,
          properties: %{
            id: hex.id,
            best_rssi: hex.best_rssi,
            snr: hex.snr,
            state: hex.state
          },
          geometry: %{
            type: "Polygon",
            coordinates: coords
          }
        }
      end)

    json(conn, %{
      type: "FeatureCollection",
      features: features
    })
  end
end
