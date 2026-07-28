defmodule MappersWeb.API.V1.TimelineControllerTest do
  # Non-async: drives the globally-named Inventory/Scope pair via the stub
  # client's :inventory_stub_response application env.
  use MappersWeb.ConnCase

  alias Mappers.Coverage.Scope
  alias Mappers.Gateways.Inventory
  alias Mappers.Repo
  alias Mappers.H3.Res9
  alias Mappers.Test.CoverageFixtures

  setup do
    Inventory.reset()
    Scope.reset()

    on_exit(fn ->
      Application.delete_env(:mappers, :inventory_stub_response)
      Inventory.reset()
      Scope.reset()
    end)

    :ok
  end

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

  describe "scope param" do
    @permanent_hex "8948469b0b1ffff"
    @bench_hex "8948469b0b9ffff"

    defp seed_scoped! do
      insert_hex!(%{id: @permanent_hex, first_seen: ~U[2024-05-08 20:26:40.000000Z]})
      insert_hex!(%{id: @bench_hex, first_seen: ~U[2024-05-09 20:26:40.000000Z]})
      CoverageFixtures.hear_in_hex!(@permanent_hex, %{gateway_id: "ac1f09fffe000001"})
      CoverageFixtures.hear_in_hex!(@bench_hex, %{gateway_id: "ecececececececec"})

      Application.put_env(
        :mappers,
        :inventory_stub_response,
        {:ok,
         [
           %{"gateway_eui" => "AC1F09FFFE000001", "name" => "Harbor Master", "location_phase" => "permanent"},
           %{"gateway_eui" => "ECECECECECECECEC", "name" => "Bench GW", "location_phase" => "bench_test"}
         ]}
      )

      Inventory.refresh()
    end

    defp timeline_ids(conn, path) do
      conn |> get(path) |> json_response(200) |> Enum.map(& &1["h"])
    end

    test "defaults to permanent-gateway hexes only, keeping the h/t/r shape", %{conn: conn} do
      seed_scoped!()

      body = conn |> get("/api/v1/coverage/timeline") |> json_response(200)

      assert [hex] = body
      assert Map.keys(hex) |> Enum.sort() == ["h", "r", "t"]
      assert hex["h"] == @permanent_hex
    end

    test "scope=other serves the complement", %{conn: conn} do
      seed_scoped!()

      assert timeline_ids(conn, "/api/v1/coverage/timeline?scope=other") == [@bench_hex]
    end

    test "scope=all serves everything", %{conn: conn} do
      seed_scoped!()

      assert Enum.sort(timeline_ids(conn, "/api/v1/coverage/timeline?scope=all")) ==
               [@permanent_hex, @bench_hex]
    end

    test "fail-open: all hexes are served when the inventory never loaded", %{conn: conn} do
      insert_hex!(%{id: @permanent_hex, first_seen: ~U[2024-05-08 20:26:40.000000Z]})
      insert_hex!(%{id: @bench_hex, first_seen: ~U[2024-05-09 20:26:40.000000Z]})

      assert Enum.sort(timeline_ids(conn, "/api/v1/coverage/timeline")) ==
               [@permanent_hex, @bench_hex]
    end
  end
end
