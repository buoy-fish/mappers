defmodule MappersWeb.API.V1.HexControllerTest do
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

  describe "scope param" do
    @permanent_hex "8948469b0b1ffff"
    @bench_hex "8948469b0b9ffff"

    defp seed_scoped! do
      insert_hex!(%{id: @permanent_hex})
      insert_hex!(%{id: @bench_hex})
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

    defp hex_ids(conn, path) do
      conn |> get(path) |> json_response(200) |> Enum.map(fn [id | _] -> id end)
    end

    test "defaults to permanent-gateway hexes only", %{conn: conn} do
      seed_scoped!()

      assert hex_ids(conn, "/api/v1/hexes") == [@permanent_hex]
    end

    test "scope=other serves the complement", %{conn: conn} do
      seed_scoped!()

      assert hex_ids(conn, "/api/v1/hexes?scope=other") == [@bench_hex]
    end

    test "scope=all serves everything", %{conn: conn} do
      seed_scoped!()

      assert Enum.sort(hex_ids(conn, "/api/v1/hexes?scope=all")) ==
               [@permanent_hex, @bench_hex]
    end

    test "an unknown scope value falls back to permanent", %{conn: conn} do
      seed_scoped!()

      assert hex_ids(conn, "/api/v1/hexes?scope=bogus") == [@permanent_hex]
    end

    test "fail-open: all hexes are served when the inventory never loaded", %{conn: conn} do
      insert_hex!(%{id: @permanent_hex})
      insert_hex!(%{id: @bench_hex})

      assert Enum.sort(hex_ids(conn, "/api/v1/hexes")) == [@permanent_hex, @bench_hex]
    end

    test "keeps the cache-control header on scoped responses", %{conn: conn} do
      seed_scoped!()

      conn = get(conn, "/api/v1/hexes?scope=other")

      assert json_response(conn, 200)
      assert ["public, max-age=60"] = get_resp_header(conn, "cache-control")
    end
  end
end
