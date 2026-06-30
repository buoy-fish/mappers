defmodule MappersWeb.API.V1.HexControllerTest do
  use MappersWeb.ConnCase

  alias Mappers.Repo
  alias Mappers.H3.Res9

  defp square_geom do
    %Geo.Polygon{
      coordinates: [[{-122.0, 37.0}, {-122.0, 37.1}, {-121.9, 37.1}, {-121.9, 37.0}, {-122.0, 37.0}]],
      srid: 4326
    }
  end

  defp insert_hex!(attrs) do
    %Res9{}
    |> Res9.changeset(
      Map.merge(
        %{h3_index_int: System.unique_integer([:positive]), state: "CA", best_rssi: -72.5, snr: 8.0, geom: square_geom()},
        attrs
      )
    )
    |> Repo.insert!()
  end

  test "GET /api/v1/hexes returns a compact [id_string, id_int, best_rssi, snr] array", %{conn: conn} do
    insert_hex!(%{id: "8948469b0bbffff", h3_index_int: 123_456, best_rssi: -64.0, snr: 11.5})

    body = conn |> get("/api/v1/hexes") |> json_response(200)

    assert [[id_str, id_int, best_rssi, snr]] = body
    assert id_str == "8948469b0bbffff"
    assert id_int == 123_456
    assert best_rssi == -64.0
    assert snr == 11.5
  end

  test "sets a short public cache-control header", %{conn: conn} do
    insert_hex!(%{id: "8948469b0c7ffff"})

    conn = get(conn, "/api/v1/hexes")

    assert json_response(conn, 200)
    assert ["public, max-age=60"] = get_resp_header(conn, "cache-control")
  end
end
