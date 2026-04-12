# Seed script for mesh >> border >> cloud demo data
#
# Run with: mix run priv/repo/seeds_mesh_demo.exs
#
# Creates realistic multi-gateway uplinks in SF Bay to visualize
# end node -> mesh gateway -> border gateway data paths.
#
# Mesh hops: border GW entries have relay_gateway_eui pointing to the
# mesh GW that relayed the packet. This enables chained line rendering
# and per-link stats in the InfoPane.

alias Mappers.Ingest

# Gateway definitions: {eui, name, lat, lng}
gateways = %{
  mesh_ti:           {"0016c001ff000001", "Mesh GW Treasure Island", 37.8235, -122.3706},
  mesh_angel:        {"0016c001ff000002", "Mesh GW Angel Island",    37.8607, -122.4325},
  border_marina:     {"0016c001ff000010", "Border GW SF Marina",     37.8065, -122.4382},
  border_sausalito:  {"0016c001ff000011", "Border GW Sausalito",     37.8590, -122.4850}
}

# Helper to build a ChirpStack-style rxInfo entry
# relay_eui: if set, means this GW received via that relay (mesh hop)
make_rx = fn {eui, name, lat, lng}, rssi, snr, relay_eui ->
  base = %{
    "gatewayId" => eui,
    "rssi" => rssi,
    "snr" => snr,
    "gwTime" => DateTime.utc_now() |> DateTime.to_iso8601(),
    "metadata" => %{
      "gateway_id" => eui,
      "gateway_name" => name,
      "gateway_lat" => lat,
      "gateway_long" => lng
    }
  }
  if relay_eui, do: Map.put(base, "relay_gateway_eui", relay_eui), else: base
end

# Helper to build a full ChirpStack payload
make_payload = fn dev_eui, lat, lng, rx_infos ->
  %{
    "deduplicationId" => Ecto.UUID.generate(),
    "deviceInfo" => %{"devEui" => dev_eui},
    "fCnt" => Enum.random(1..9999),
    "time" => DateTime.utc_now() |> DateTime.to_iso8601(),
    "txInfo" => %{
      "frequency" => 915_000_000,
      "modulation" => %{
        "lora" => %{"spreadingFactor" => 10, "bandwidth" => 125_000}
      }
    },
    "object" => %{
      "latitude" => lat,
      "longitude" => lng,
      "altitude" => 0.0,
      "accuracy" => 5.0
    },
    "rxInfo" => rx_infos
  }
end

IO.puts("\n=== Seeding mesh demo data ===\n")

# Each scenario: {desc, dev_eui, lat, lng, [{gw_key, rssi, snr, relay_via_key | nil}]}
# relay_via_key: if set, the border GW received via this mesh GW (hop)
scenarios = [
  # Buoy near Treasure Island: mesh TI hears directly, border Marina receives via mesh TI
  {"Buoy #1 — Treasure Island, mesh TI -> border Marina",
   "a840681f8200001", 37.8220, -122.3690,
   [{:mesh_ti, -72.0, 10.5, nil},
    {:border_marina, -108.0, 2.0, :mesh_ti}]},

  {"Buoy #2 — NE of Treasure Island, mesh TI -> border Marina",
   "a840681f8200008", 37.8280, -122.3650,
   [{:mesh_ti, -78.0, 8.0, nil},
    {:border_marina, -112.0, 1.5, :mesh_ti}]},

  # Near Alcatraz: heard by both mesh GWs + border via mesh Angel
  {"Buoy #3 — Alcatraz, mesh TI + mesh Angel -> border Marina",
   "a840681f8200002", 37.8270, -122.4230,
   [{:mesh_ti, -95.0, 4.0, nil},
    {:mesh_angel, -82.0, 7.5, nil},
    {:border_marina, -99.0, 3.5, :mesh_angel}]},

  # Angel Island cove: mesh Angel hears directly, border Sausalito via mesh
  {"Buoy #4 — Angel Island, mesh Angel -> border Sausalito",
   "a840681f8200003", 37.8580, -122.4350,
   [{:mesh_angel, -68.0, 12.0, nil},
    {:border_sausalito, -92.0, 5.0, :mesh_angel}]},

  # Raccoon Strait: mesh Angel + both borders via mesh
  {"Buoy #5 — Raccoon Strait, mesh Angel -> border Sausalito + border Marina",
   "a840681f8200004", 37.8500, -122.4500,
   [{:mesh_angel, -76.0, 9.0, nil},
    {:border_sausalito, -88.0, 6.5, :mesh_angel},
    {:border_marina, -105.0, 2.5, :mesh_angel}]},

  # Richardson Bay: border Sausalito hears directly (no mesh needed)
  {"Buoy #6 — Richardson Bay, direct to border Sausalito",
   "a840681f8200005", 37.8640, -122.4750,
   [{:border_sausalito, -74.0, 11.0, nil}]},

  # South of Treasure Island: mesh TI only
  {"Buoy #7 — South of TI, mesh TI only",
   "a840681f8200006", 37.8150, -122.3730,
   [{:mesh_ti, -80.0, 7.0, nil}]},

  # Bay Bridge: mesh TI -> border Marina
  {"Buoy #8 — Bay Bridge, mesh TI -> border Marina",
   "a840681f8200007", 37.8190, -122.3800,
   [{:mesh_ti, -85.0, 6.0, nil},
    {:border_marina, -102.0, 3.0, :mesh_ti}]},

  # 2nd uplinks (slightly moved positions, different signal)
  {"Buoy #1 — Treasure Island (2nd uplink)",
   "a840681f8200001", 37.8222, -122.3688,
   [{:mesh_ti, -70.0, 11.0, nil},
    {:border_marina, -106.0, 2.5, :mesh_ti}]},

  {"Buoy #3 — Alcatraz (2nd uplink)",
   "a840681f8200002", 37.8275, -122.4225,
   [{:mesh_ti, -93.0, 4.5, nil},
    {:mesh_angel, -80.0, 8.0, nil},
    {:border_marina, -97.0, 4.0, :mesh_angel}]},

  {"Buoy #5 — Raccoon Strait (2nd uplink)",
   "a840681f8200004", 37.8505, -122.4495,
   [{:mesh_angel, -74.0, 9.5, nil},
    {:border_sausalito, -86.0, 7.0, :mesh_angel}]},
]

Enum.each(scenarios, fn {desc, dev_eui, lat, lng, gw_list} ->
  rx_infos = Enum.map(gw_list, fn {gw_key, rssi, snr, relay_via_key} ->
    relay_eui = if relay_via_key do
      {eui, _, _, _} = Map.fetch!(gateways, relay_via_key)
      eui
    else
      nil
    end
    make_rx.(Map.fetch!(gateways, gw_key), rssi, snr, relay_eui)
  end)

  payload = make_payload.(dev_eui, lat, lng, rx_infos)

  case Ingest.ingest_uplink(payload) do
    %{status: "success"} ->
      IO.puts("  ok #{desc}")
    %{error: reason} ->
      IO.puts("  FAIL #{desc}: #{inspect(reason)}")
    other ->
      IO.puts("  ?? #{desc}: #{inspect(other)}")
  end

  Process.sleep(100)
end)

IO.puts("\n=== Done! #{length(scenarios)} uplinks seeded ===\n")
