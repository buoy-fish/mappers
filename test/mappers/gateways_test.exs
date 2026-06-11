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
    insert_heard!("OTHERGWID0000001", ~U[2026-06-09 18:30:00.000000Z])

    [gw] = Gateways.attach_last_heard([inventory_gateway(%{})])

    assert gw.last_heard == nil
  end
end
