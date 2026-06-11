defmodule Mappers.GatewaysTest do
  use Mappers.DataCase

  alias Mappers.Gateways
  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard
  alias Mappers.Uplinks.Uplink

  # uplinks_heard.uplink_id has a FK to uplinks, so each heard row needs a
  # real parent uplink.
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

  # The packet forwarder writes a concentrator (slot) GWID into
  # uplinks_heard.gateway_id, never the hardware EUI — so the enrichment must
  # look across BOTH the EUI and every concentrator ID.
  defp insert_heard!(gateway_id, timestamp, hotspot_name \\ "test-gw") do
    Repo.insert!(%UplinkHeard{
      hotspot_address: "addr",
      hotspot_name: hotspot_name,
      gateway_id: gateway_id,
      latitude: 27.84,
      longitude: -115.05,
      rssi: -90.0,
      snr: 7.5,
      timestamp: timestamp,
      uplink_id: insert_uplink!().id
    })
  end

  defp inventory_gateway(attrs) do
    Map.merge(
      %{
        gateway_eui: "AC1F09FFFE000001",
        concentrator_ids: [],
        hotspot_name: "harbor-master",
        lat: 27.84,
        lng: -115.05,
        role: "border",
        description: nil,
        altitude: nil
      },
      attrs
    )
  end

  test "attach_last_heard/1 takes the max timestamp across EUI and concentrator IDs" do
    insert_heard!("AC1F09FFFE000001", ~U[2026-06-01 10:00:00.000000Z])
    insert_heard!("SLOT0GWID0000001", ~U[2026-06-09 18:30:00.000000Z])
    insert_heard!("SLOT1GWID0000001", ~U[2026-06-05 12:00:00.000000Z])

    [gw] =
      Gateways.attach_last_heard([
        inventory_gateway(%{concentrator_ids: ["SLOT0GWID0000001", "SLOT1GWID0000001"]})
      ])

    assert gw.last_heard == ~U[2026-06-09 18:30:00.000000Z]
  end

  test "attach_last_heard/1 leaves last_heard nil for a gateway never heard" do
    [gw] = Gateways.attach_last_heard([inventory_gateway(%{gateway_eui: "AC1F09FFFE00DEAD"})])

    assert gw.last_heard == nil
  end

  test "attach_last_heard/1 does not attribute another gateway's uplinks" do
    insert_heard!("OTHERGWID0000001", ~U[2026-06-09 18:30:00.000000Z], "some-other-gw")

    [gw] = Gateways.attach_last_heard([inventory_gateway(%{})])

    assert gw.last_heard == nil
  end

  test "attach_last_heard/1 matches identifiers case-insensitively" do
    insert_heard!("ac1f09fffe000001", ~U[2026-06-09 18:30:00.000000Z])

    [gw] = Gateways.attach_last_heard([inventory_gateway(%{gateway_eui: "AC1F09FFFE000001"})])

    assert gw.last_heard == ~U[2026-06-09 18:30:00.000000Z]
  end

  # Several prod gateways are heard under stream IDs the inventory doesn't
  # know (no slot GWIDs recorded), but the forwarder stamps the operator's
  # gateway name into hotspot_name — mirror app.buoy.fish's multi-identifier
  # resolution by also matching on the (normalized) name.
  test "attach_last_heard/1 falls back to a normalized hotspot_name match" do
    insert_heard!("646cb99320d8e64b", ~U[2026-06-07 09:00:00.000000Z], "Bahia Tortuga Town")

    [gw] =
      Gateways.attach_last_heard([
        inventory_gateway(%{gateway_eui: "0016c001ff18aff7", hotspot_name: "bahia-tortuga-town"})
      ])

    assert gw.last_heard == ~U[2026-06-07 09:00:00.000000Z]
  end

  # A single stream ID can be stamped with different names over time (e.g. a
  # Helium animal name and later an operator rename). A name match must only
  # credit rows bearing the matching name, not everything that stream ID sent.
  test "attach_last_heard/1 name match only counts rows with the matching name" do
    insert_heard!("ad7c0d2a02857898", ~U[2026-06-01 08:00:00.000000Z], "Punta Abreojos Office")
    insert_heard!("ad7c0d2a02857898", ~U[2026-06-09 08:00:00.000000Z], "shiny-black-bee")

    [gw] =
      Gateways.attach_last_heard([
        inventory_gateway(%{gateway_eui: "AAAAAAAA00000001", hotspot_name: "Punta Abreojos Office"})
      ])

    assert gw.last_heard == ~U[2026-06-01 08:00:00.000000Z]
  end

  test "attach_last_heard/1 takes the max across ID and name matches" do
    insert_heard!("AC1F09FFFE000001", ~U[2026-06-03 10:00:00.000000Z], "old-name")
    insert_heard!("0000000000000ABC", ~U[2026-06-10 10:00:00.000000Z], "Harbor Master")

    [gw] = Gateways.attach_last_heard([inventory_gateway(%{hotspot_name: "harbor-master"})])

    assert gw.last_heard == ~U[2026-06-10 10:00:00.000000Z]
  end

  # /api/gateways/public serializes the two concentrator slots as
  # slot1_gwid / slot2_gwid — there is no concentrator_ids key. from_inventory/1
  # owns that translation (the controller previously read a key that never
  # existed, so only EUI matches ever fired in prod).
  test "from_inventory/1 builds concentrator_ids from slot1_gwid/slot2_gwid" do
    gw =
      Gateways.from_inventory(%{
        "gateway_eui" => "ac1f09fffe21be45",
        "slot1_gwid" => "0016c001f1399e45",
        "slot2_gwid" => "58575da16f2d964a",
        "name" => "El Tavo Mtn",
        "latitude" => 27.0,
        "longitude" => -114.0,
        "role" => "border",
        "description" => nil,
        "altitude" => 12
      })

    assert gw.gateway_eui == "ac1f09fffe21be45"
    assert gw.concentrator_ids == ["0016c001f1399e45", "58575da16f2d964a"]
    assert gw.hotspot_name == "El Tavo Mtn"
    assert gw.lat == 27.0
    assert gw.lng == -114.0
  end

  test "from_inventory/1 drops missing slots and merges any legacy concentrator_ids" do
    gw =
      Gateways.from_inventory(%{
        "gateway_eui" => "0016c001ff18aff7",
        "slot1_gwid" => nil,
        "slot2_gwid" => nil,
        "concentrator_ids" => ["646cb99320d8e64b", nil],
        "name" => "Bahia Tortuga Town"
      })

    assert gw.concentrator_ids == ["646cb99320d8e64b"]
  end
end
