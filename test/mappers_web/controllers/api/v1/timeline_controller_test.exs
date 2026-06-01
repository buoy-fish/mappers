defmodule MappersWeb.API.V1.TimelineControllerTest do
  use MappersWeb.ConnCase

  alias Mappers.Repo
  alias Mappers.H3.Res9

  # Minimal valid square polygon. Res9.changeset validates :geom is present,
  # so every inserted hex needs a geom even though the timeline endpoint
  # never loads or returns it.
  defp square_geom do
    %Geo.Polygon{
      coordinates: [
        [
          {-122.0, 37.0},
          {-122.0, 37.1},
          {-121.9, 37.1},
          {-121.9, 37.0},
          {-122.0, 37.0}
        ]
      ],
      srid: 4326
    }
  end

  defp insert_hex!(attrs) do
    %Res9{}
    |> Res9.changeset(
      Map.merge(
        %{
          h3_index_int: System.unique_integer([:positive]),
          state: "CA",
          best_rssi: -55.0,
          snr: 7.5,
          geom: square_geom()
        },
        attrs
      )
    )
    |> Repo.insert!()
  end

  test "GET /api/v1/coverage/timeline returns 200 and a JSON array", %{conn: conn} do
    insert_hex!(%{
      id: "8948469b0bbffff",
      best_rssi: -55.0,
      first_seen: ~U[2024-05-08 20:26:40.000000Z]
    })

    body = conn |> get("/api/v1/coverage/timeline") |> json_response(200)

    assert is_list(body)
  end

  test "each element has exactly h/t/r with correct values", %{conn: conn} do
    first_seen = ~U[2024-05-08 20:26:40.000000Z]

    insert_hex!(%{
      id: "8948469b0bbffff",
      best_rssi: -42.0,
      first_seen: first_seen
    })

    body = conn |> get("/api/v1/coverage/timeline") |> json_response(200)

    assert [hex] = body
    assert Map.keys(hex) |> Enum.sort() == ["h", "r", "t"]
    assert hex["h"] == "8948469b0bbffff"
    assert hex["r"] == -42.0
    assert is_integer(hex["t"])
    assert hex["t"] == DateTime.to_unix(first_seen, :millisecond)
  end

  test "rows with first_seen = nil are excluded", %{conn: conn} do
    insert_hex!(%{
      id: "8948469b0bbffff",
      first_seen: ~U[2024-05-08 20:26:40.000000Z]
    })

    insert_hex!(%{
      id: "8948469b0c7ffff",
      first_seen: nil
    })

    body = conn |> get("/api/v1/coverage/timeline") |> json_response(200)

    ids = Enum.map(body, & &1["h"])
    assert "8948469b0bbffff" in ids
    refute "8948469b0c7ffff" in ids
    assert length(body) == 1
  end
end
