defmodule Mappers.H3Test do
  use Mappers.DataCase

  alias Mappers.H3
  alias Mappers.H3.Res9

  # A fixed point so repeated calls map to the SAME res9 hex. Anywhere with a
  # real lat/lng works; :h3.from_geo yields a valid index for these.
  @lat 37.7749
  @lng -122.4194

  # reported_at is epoch milliseconds, matching the console payload shape that
  # Ingest.normalize_payload passes straight through.
  defp message(opts) do
    reported_at = Keyword.get(opts, :reported_at, 1_700_000_000_000)
    lat = Keyword.get(opts, :lat, @lat)
    lng = Keyword.get(opts, :lng, @lng)

    %{
      "reported_at" => reported_at,
      "decoded" => %{
        "payload" => %{"latitude" => lat, "longitude" => lng}
      },
      "hotspots" => [
        %{
          "rssi" => -90.0,
          "snr" => 5.0,
          "frequency" => 904.5,
          "spreading" => "SF7BW125"
        }
      ]
    }
  end

  defp expected_first_seen(reported_at) do
    round(reported_at / 1000) |> DateTime.from_unix!()
  end

  test "new hex sets first_seen from the uplink's reported_at (second resolution)" do
    reported_at = 1_700_000_000_000
    {:ok, res9} = H3.create(message(reported_at: reported_at))

    fetched = Repo.get(Res9, res9.id)
    # Column is :utc_datetime_usec so the round-tripped value carries a
    # microsecond component (.000000Z); DateTime.compare ignores the precision
    # tuple and compares the instant.
    assert DateTime.compare(fetched.first_seen, expected_first_seen(reported_at)) == :eq
  end

  test "existing hex with an earlier uplink lowers first_seen (keep-MIN)" do
    later = 1_700_000_000_000
    earlier = 1_600_000_000_000

    {:ok, res9} = H3.create(message(reported_at: later))
    {:ok, _} = H3.create(message(reported_at: earlier))

    fetched = Repo.get(Res9, res9.id)
    assert DateTime.compare(fetched.first_seen, expected_first_seen(earlier)) == :eq
  end

  test "existing hex with a later (out-of-order) uplink does not change first_seen" do
    earlier = 1_600_000_000_000
    later = 1_700_000_000_000

    {:ok, res9} = H3.create(message(reported_at: earlier))
    {:ok, _} = H3.create(message(reported_at: later))

    fetched = Repo.get(Res9, res9.id)
    assert DateTime.compare(fetched.first_seen, expected_first_seen(earlier)) == :eq
  end

  test "existing hex with a NULL stored first_seen (pre-backfill) gets it set" do
    {:ok, res9} = H3.create(message(reported_at: 1_700_000_000_000))

    # Simulate a pre-backfill row: clear first_seen back to NULL.
    {:ok, _} =
      res9
      |> Ecto.Changeset.change(%{first_seen: nil})
      |> Repo.update()

    incoming = 1_650_000_000_000
    {:ok, _} = H3.create(message(reported_at: incoming))

    fetched = Repo.get(Res9, res9.id)
    assert DateTime.compare(fetched.first_seen, expected_first_seen(incoming)) == :eq
  end

  test "new hex with nil reported_at sets first_seen to nil without crashing" do
    {:ok, res9} = H3.create(message(reported_at: nil))

    fetched = Repo.get(Res9, res9.id)
    assert is_nil(fetched.first_seen)
  end

  describe "h3:new broadcast permanent flag" do
    alias Mappers.Coverage.Scope
    alias Mappers.Gateways.Inventory

    setup do
      Inventory.reset()
      Scope.reset()
      MappersWeb.Endpoint.subscribe("h3:new")

      on_exit(fn ->
        Application.delete_env(:mappers, :inventory_stub_response)
        Inventory.reset()
        Scope.reset()
      end)

      :ok
    end

    defp stub_inventory! do
      Application.put_env(
        :mappers,
        :inventory_stub_response,
        {:ok,
         [
           %{
             "gateway_eui" => "AC1F09FFFE000001",
             "name" => "Harbor Master",
             "location_phase" => "permanent"
           },
           %{
             "gateway_eui" => "ECECECECECECECEC",
             "name" => "Bench GW",
             "location_phase" => "bench_test"
           }
         ]}
      )

      Inventory.refresh()
    end

    defp message_heard_by(gateway_id) do
      update_in(message([]), ["hotspots"], fn [hotspot] ->
        [Map.merge(hotspot, %{"name" => "unknown", "gateway_id" => gateway_id})]
      end)
    end

    test "permanent: true when a permanent gateway heard the uplink" do
      stub_inventory!()

      {:ok, _} = H3.create(message_heard_by("ac1f09fffe000001"))

      assert_receive %Phoenix.Socket.Broadcast{event: "new_h3", payload: %{body: body}}
      assert body.permanent == true
    end

    test "permanent: false when only a non-permanent gateway heard it" do
      stub_inventory!()

      {:ok, _} = H3.create(message_heard_by("ecececececececec"))

      assert_receive %Phoenix.Socket.Broadcast{event: "new_h3", payload: %{body: body}}
      assert body.permanent == false
    end

    test "permanent: true for a device-GPS-only uplink (device_only placeholder)" do
      stub_inventory!()

      message =
        update_in(message([]), ["hotspots"], fn [hotspot] ->
          [Map.merge(hotspot, %{"id" => "device_only", "name" => "device_only"})]
        end)

      {:ok, _} = H3.create(message)

      assert_receive %Phoenix.Socket.Broadcast{event: "new_h3", payload: %{body: body}}
      assert body.permanent == true
    end

    test "fail-open: permanent: true when the inventory never loaded" do
      {:ok, _} = H3.create(message_heard_by("ac1f09fffe000001"))

      assert_receive %Phoenix.Socket.Broadcast{event: "new_h3", payload: %{body: body}}
      assert body.permanent == true
    end
  end
end
