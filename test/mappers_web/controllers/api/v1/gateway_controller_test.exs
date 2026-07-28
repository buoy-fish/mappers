defmodule MappersWeb.API.V1.GatewayControllerTest do
  # Non-async: drives the globally-named Inventory via the stub client's
  # :inventory_stub_response application env.
  use MappersWeb.ConnCase

  alias Mappers.Gateways.Inventory
  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard
  alias Mappers.Uplinks.Uplink

  setup do
    Inventory.reset()

    on_exit(fn ->
      Application.delete_env(:mappers, :inventory_stub_response)
      Inventory.reset()
    end)

    :ok
  end

  defp stub_inventory!(gateways) do
    Application.put_env(:mappers, :inventory_stub_response, {:ok, gateways})
    Inventory.refresh()
  end

  defp insert_uplink! do
    Repo.insert!(%Uplink{
      app_eui: "APP0000000000001",
      dev_eui: "DEV0000000000001",
      device_id: "test-device",
      fcnt: 1,
      first_timestamp: ~U[2026-06-01 00:00:00.000000Z],
      frequency: 903.9,
      spreading_factor: "SF9BW125",
      altitude: 0,
      gps_accuracy: 1.0
    })
  end

  defp insert_heard!(gateway_id, timestamp) do
    Repo.insert!(%UplinkHeard{
      hotspot_address: "addr",
      hotspot_name: "test-gw",
      gateway_id: gateway_id,
      latitude: 27.84,
      longitude: -115.05,
      rssi: -90.0,
      snr: 7.5,
      timestamp: timestamp,
      uplink_id: insert_uplink!().id
    })
  end

  test "serves the cached inventory with last_heard attached", %{conn: conn} do
    insert_heard!("ac1f09fffe000001", ~U[2026-06-09 18:30:00.000000Z])

    stub_inventory!([
      %{
        "gateway_eui" => "AC1F09FFFE000001",
        "name" => "Harbor Master",
        "latitude" => 27.84,
        "longitude" => -115.05,
        "role" => "border",
        "location_phase" => "permanent"
      }
    ])

    assert %{"gateways" => [gw]} = conn |> get("/api/v1/gateways") |> json_response(200)
    assert gw["gateway_eui"] == "AC1F09FFFE000001"
    assert gw["hotspot_name"] == "Harbor Master"
    assert gw["location_phase"] == "permanent"
    assert gw["last_heard"] == "2026-06-09T18:30:00.000000Z"
  end

  test "a missing location_phase in the feed is passed through as nil", %{conn: conn} do
    stub_inventory!([%{"gateway_eui" => "AC1F09FFFE000002", "name" => "Old API Gateway"}])

    assert %{"gateways" => [gw]} = conn |> get("/api/v1/gateways") |> json_response(200)
    assert gw["location_phase"] == nil
  end

  test "falls back to uplinks_heard when the inventory is unavailable", %{conn: conn} do
    # No stub response configured -> the Inventory has no snapshot.
    insert_heard!("646cb99320d8e64b", ~U[2026-06-07 09:00:00.000000Z])

    assert %{"gateways" => [gw]} = conn |> get("/api/v1/gateways") |> json_response(200)
    assert gw["gateway_eui"] == "646cb99320d8e64b"
    assert gw["hotspot_name"] == "test-gw"
    assert gw["last_heard"] == "2026-06-07T09:00:00.000000Z"
  end
end
