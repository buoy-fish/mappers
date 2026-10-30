defmodule Mappers.IngestTest do
  use Mappers.DataCase

  alias Mappers.Coverage.Scope
  alias Mappers.Gateways.Inventory
  alias Mappers.Ingest

  @slot_gwid "0016c001f10b0bc8"
  @reported_at 1_793_400_000_000

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
           "gateway_eui" => "ac1f09fffe000001",
           "slot1_gwid" => @slot_gwid,
           "name" => "Punta Prieta",
           "location_phase" => "permanent"
         }
       ]}
    )

    Inventory.refresh()
  end

  defp uplink(lat \\ 27.0143) do
    %{
      "app_eui" => "0000000000000000",
      "dev_eui" => "a84041000181c4a1",
      "id" => Ecto.UUID.generate(),
      "fcnt" => 7,
      "reported_at" => @reported_at,
      "decoded" => %{
        "payload" => %{
          "latitude" => lat,
          "longitude" => -114.0426,
          "accuracy" => 1.0,
          "altitude" => 2.0
        },
        "status" => "success"
      },
      "hotspots" => [
        %{
          "id" => @slot_gwid,
          "name" => "unknown",
          "gateway_id" => @slot_gwid,
          "lat" => 27.02,
          "long" => -114.05,
          "rssi" => -90.0,
          "snr" => 5.0,
          "frequency" => 904.5,
          "spreading" => "SF9BW125",
          "reported_at" => @reported_at
        }
      ]
    }
  end

  test "an ingested uplink tells open maps which gateway heard it, by EUI" do
    stub_inventory!()

    assert %{status: "success"} = Ingest.ingest_uplink(uplink())

    assert_receive %Phoenix.Socket.Broadcast{
      event: "gateway_heard",
      payload: %{gateways: [%{gateway_eui: "ac1f09fffe000001", last_heard: last_heard}]}
    }

    assert DateTime.to_unix(last_heard, :millisecond) == @reported_at
  end

  test "an uplink landing in an already-mapped hex still announces its gateway" do
    stub_inventory!()

    %{status: "success"} = Ingest.ingest_uplink(uplink())
    assert_receive %Phoenix.Socket.Broadcast{event: "new_h3"}
    assert_receive %Phoenix.Socket.Broadcast{event: "gateway_heard"}

    %{status: "success"} = Ingest.ingest_uplink(uplink())
    refute_receive %Phoenix.Socket.Broadcast{event: "new_h3"}, 50
    assert_receive %Phoenix.Socket.Broadcast{event: "gateway_heard"}
  end

  test "ingest doesn't wait on the broadcast, so a stalled inventory can't hold up an uplink" do
    stub_inventory!()
    # An already-mapped hex: a new one consults the inventory through Scope anyway.
    %{status: "success"} = Ingest.ingest_uplink(uplink())
    assert_receive %Phoenix.Socket.Broadcast{event: "gateway_heard"}

    :sys.suspend(Inventory)
    on_exit(fn -> if Process.whereis(Inventory), do: :sys.resume(Inventory) end)

    task = Task.async(fn -> Ingest.ingest_uplink(uplink()) end)

    assert {:ok, %{status: "success"}} = Task.yield(task, 2_000) || Task.shutdown(task)
    refute_received %Phoenix.Socket.Broadcast{event: "gateway_heard"}

    :sys.resume(Inventory)
    assert_receive %Phoenix.Socket.Broadcast{event: "gateway_heard"}
  end

  test "with no inventory loaded the uplink still ingests and nothing is announced" do
    assert %{status: "success"} = Ingest.ingest_uplink(uplink())

    refute_receive %Phoenix.Socket.Broadcast{event: "gateway_heard"}, 50
  end
end
