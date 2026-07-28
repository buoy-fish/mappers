defmodule Mappers.Test.CoverageFixtures do
  @moduledoc """
  Fixtures for coverage-scope tests: hexes plus the `uplinks` →
  `uplinks_heard` / `h3_links` rows that tie a hex to the gateway that heard
  it (the join `Mappers.Coverage.Scope` classifies over).
  """

  alias Mappers.H3.Links.Link
  alias Mappers.H3.Res9
  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard
  alias Mappers.Uplinks.Uplink

  # uplinks_heard.uplink_id and h3_links.uplink_id both FK to uplinks.
  def insert_uplink! do
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

  def insert_hex!(id, attrs \\ %{}) do
    Repo.insert!(
      struct!(
        %Res9{
          id: id,
          h3_index_int: System.unique_integer([:positive]),
          state: "mapped",
          best_rssi: -90.0,
          snr: 5.0,
          geom: %Geo.Polygon{
            coordinates: [
              [{-122.0, 37.0}, {-122.0, 37.1}, {-121.9, 37.1}, {-121.9, 37.0}, {-122.0, 37.0}]
            ],
            srid: 4326
          }
        },
        attrs
      )
    )
  end

  @doc """
  One heard uplink linked into `hex_id`: the `h3_links` row is what
  `Scope.permanent_hex_ids/1` joins through.
  """
  def hear_in_hex!(hex_id, attrs \\ %{}) do
    uplink = insert_uplink!()

    Repo.insert!(%UplinkHeard{
      hotspot_address: Map.get(attrs, :hotspot_address, "addr"),
      hotspot_name: Map.get(attrs, :hotspot_name, "some-gw"),
      gateway_id: Map.get(attrs, :gateway_id),
      relay_gateway_id: Map.get(attrs, :relay_gateway_id),
      latitude: 27.84,
      longitude: -115.05,
      rssi: -90.0,
      snr: 7.5,
      timestamp: ~U[2026-06-09 18:30:00.000000Z],
      uplink_id: uplink.id
    })

    Repo.insert!(%Link{uplink_id: uplink.id, h3_res9_id: hex_id})
  end
end
