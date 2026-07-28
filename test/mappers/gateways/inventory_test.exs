defmodule Mappers.Gateways.InventoryTest do
  # Non-async: the stub client reads the global :inventory_stub_response env.
  use ExUnit.Case

  alias Mappers.Gateways.Inventory

  defp stub!(response) do
    previous = Application.fetch_env(:mappers, :inventory_stub_response)
    Application.put_env(:mappers, :inventory_stub_response, response)

    on_exit(fn ->
      case previous do
        {:ok, value} -> Application.put_env(:mappers, :inventory_stub_response, value)
        :error -> Application.delete_env(:mappers, :inventory_stub_response)
      end
    end)
  end

  defp start_inventory!(opts \\ []) do
    name = :"inventory_test_#{System.unique_integer([:positive])}"
    start_supervised!({Inventory, Keyword.merge([name: name], opts)})
    name
  end

  defp raw_gateway(attrs) do
    Map.merge(
      %{
        "gateway_eui" => "AC1F09FFFE000001",
        "name" => "harbor-master",
        "latitude" => 27.84,
        "longitude" => -115.05,
        "role" => "border"
      },
      attrs
    )
  end

  test "get/1 returns the mapped inventory after a successful fetch" do
    stub!({:ok, [raw_gateway(%{"location_phase" => "permanent"})]})
    inv = start_inventory!()

    assert {:ok, [gw]} = Inventory.get(inv)
    assert gw.gateway_eui == "AC1F09FFFE000001"
    assert gw.hotspot_name == "harbor-master"
    assert gw.location_phase == "permanent"
  end

  test "get/1 returns :unavailable when no fetch has ever succeeded" do
    stub!({:error, :econnrefused})
    inv = start_inventory!()

    assert Inventory.get(inv) == :unavailable
  end

  test "a failed refresh keeps the last-known-good snapshot" do
    stub!({:ok, [raw_gateway(%{})]})
    inv = start_inventory!()
    assert {:ok, [_gw]} = Inventory.get(inv)

    Application.put_env(:mappers, :inventory_stub_response, {:error, :timeout})
    Inventory.refresh(inv)

    assert {:ok, [gw]} = Inventory.get(inv)
    assert gw.gateway_eui == "AC1F09FFFE000001"
  end

  test "refresh/1 picks up new inventory data" do
    stub!({:ok, [raw_gateway(%{})]})
    inv = start_inventory!()
    assert {:ok, [_gw]} = Inventory.get(inv)

    Application.put_env(
      :mappers,
      :inventory_stub_response,
      {:ok, [raw_gateway(%{"gateway_eui" => "AC1F09FFFE000002"})]}
    )

    Inventory.refresh(inv)

    assert {:ok, [gw]} = Inventory.get(inv)
    assert gw.gateway_eui == "AC1F09FFFE000002"
  end

  test "the timer-driven refresh cycle fetches without any get/refresh call" do
    stub!({:error, :not_yet})
    inv = start_inventory!(refresh_ms: 10)
    assert Inventory.get(inv) == :unavailable

    Application.put_env(:mappers, :inventory_stub_response, {:ok, [raw_gateway(%{})]})

    # The 10ms timer refetches on its own; poll until the snapshot appears.
    assert poll_until(fn -> match?({:ok, [_]}, Inventory.get(inv)) end, 100)
  end

  test "reset/1 clears the snapshot back to :unavailable" do
    stub!({:ok, [raw_gateway(%{})]})
    inv = start_inventory!()
    assert {:ok, [_gw]} = Inventory.get(inv)

    Inventory.reset(inv)

    assert Inventory.get(inv) == :unavailable
  end

  defp poll_until(fun, attempts_left) when attempts_left > 0 do
    if fun.() do
      true
    else
      Process.sleep(5)
      poll_until(fun, attempts_left - 1)
    end
  end

  defp poll_until(_fun, _), do: false
end
