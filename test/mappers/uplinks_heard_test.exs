defmodule Mappers.UplinksHeardTest do
  use Mappers.DataCase

  alias Mappers.Repo
  alias Mappers.UplinksHeard
  alias Mappers.UplinksHeards.UplinkHeard
  alias Mappers.Uplinks.Uplink

  # uplinks_heard.uplink_id has a FK to uplinks.id, so we need a real uplink.
  defp insert_uplink do
    %Uplink{}
    |> Uplink.changeset(%{
      "dev_eui" => "0000000000000001",
      "app_eui" => "0000000000000000",
      "device_id" => "dev-1",
      "fcnt" => 1,
      "frequency" => 904.5,
      "spreading_factor" => "SF7BW125",
      "altitude" => 0,
      "gps_accuracy" => 0.0,
      "first_timestamp" => ~U[2023-11-14 22:13:20Z]
    })
    |> Repo.insert!()
  end

  defp hotspot(overrides) do
    Map.merge(
      %{
        "id" => "gw-#{System.unique_integer([:positive])}",
        "name" => "Gateway",
        "gateway_id" => "gw-stream",
        "relay_gateway_id" => nil,
        "lat" => 37.7749,
        "long" => -122.4194,
        "rssi" => -90.0,
        "snr" => 5.0,
        "reported_at" => 1_700_000_000_000
      },
      overrides
    )
  end

  describe "create/2" do
    test "inserts valid hotspots and returns their schemas" do
      uplink_id = insert_uplink().id

      assert {:ok, [schema]} = UplinksHeard.create([hotspot(%{})], uplink_id)
      assert %UplinkHeard{} = schema
      assert schema.uplink_id == uplink_id
    end

    # Regression: when an insert fails, the failure-logging branch called
    # length/1 on the Task.async_stream (a stream, not a list), raising
    # ArgumentError instead of logging. create/2 must survive a partial
    # failure, log it, and return only the successfully-inserted schemas.
    test "skips invalid hotspots without crashing on the failure-log path" do
      uplink_id = insert_uplink().id
      # nil "id" -> nil hotspot_address -> validate_required fails -> insert error
      invalid = hotspot(%{"id" => nil})
      valid = hotspot(%{})

      assert {:ok, [schema]} = UplinksHeard.create([invalid, valid], uplink_id)
      assert %UplinkHeard{} = schema
      assert schema.hotspot_address == valid["id"]
    end
  end
end
