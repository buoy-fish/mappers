defmodule MappersWeb.API.V1.CoverageControllerTest do
  use MappersWeb.ConnCase

  alias Mappers.Repo
  alias Mappers.H3.Res9
  alias Mappers.H3.Links.Link
  alias Mappers.Uplinks.Uplink

  # Build a small square polygon (~0.01° box) centered on lat/lng so the
  # ST_DWithin distance filter in count_pings_near resolves against a real
  # location instead of the fixed test polygon used elsewhere.
  defp square_geom(lat, lng) do
    d = 0.005

    %Geo.Polygon{
      coordinates: [
        [
          {lng - d, lat - d},
          {lng - d, lat + d},
          {lng + d, lat + d},
          {lng + d, lat - d},
          {lng - d, lat - d}
        ]
      ],
      srid: 4326
    }
  end

  defp insert_hex!(id, lat, lng) do
    Repo.insert!(%Res9{
      id: id,
      h3_index_int: System.unique_integer([:positive]),
      state: "live",
      best_rssi: -80.0,
      snr: 6.0,
      geom: square_geom(lat, lng)
    })
  end

  defp insert_uplink! do
    {:ok, u} =
      %Uplink{}
      |> Uplink.changeset(%{
        dev_eui: "0000000000000001",
        app_eui: "0000000000000002",
        device_id: "dev-1",
        fcnt: 1,
        frequency: 904.5,
        spreading_factor: "SF7BW125",
        altitude: 0,
        gps_accuracy: 1.0,
        first_timestamp: ~U[2026-05-01 00:00:00.000000Z]
      })
      |> Repo.insert()

    u
  end

  defp link!(uplink, hex_id) do
    %Link{}
    |> Link.changeset(%{uplink_id: uplink.id, h3_res9_id: hex_id})
    |> Repo.insert!()
  end

  test "counts distinct uplinks within ~100km of the coords", %{conn: conn} do
    near = insert_hex!("near-1", 26.72, -113.56)
    far = insert_hex!("far-1", 0.0, 0.0)

    u1 = insert_uplink!()
    link!(u1, near.id)
    u2 = insert_uplink!()
    link!(u2, near.id)
    u3 = insert_uplink!()
    link!(u3, far.id)

    body =
      conn
      |> get("/api/v1/coverage/count/26.72,-113.56")
      |> json_response(200)

    assert body["count"] == 2
    assert body["radius_m"] == 100_000
  end

  test "an uplink heard far from the coords is not counted", %{conn: conn} do
    far = insert_hex!("far-2", 0.0, 0.0)
    u = insert_uplink!()
    link!(u, far.id)

    body =
      conn
      |> get("/api/v1/coverage/count/26.72,-113.56")
      |> json_response(200)

    assert body["count"] == 0
  end

  test "returns 400 on invalid coords", %{conn: conn} do
    conn
    |> get("/api/v1/coverage/count/not-coords")
    |> json_response(400)
  end
end
