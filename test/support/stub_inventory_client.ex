defmodule Mappers.Test.StubInventoryClient do
  @moduledoc """
  Test double for `Mappers.Gateways.Inventory.Client`. Configured as the
  inventory HTTP client in `config/test.exs` so the test suite never makes a
  live call to app.buoy.fish. Tests choose the response via the
  `:inventory_stub_response` application env key (and must restore it in
  `on_exit`, since it is global — inventory-dependent tests are non-async).
  """
  @behaviour Mappers.Gateways.Inventory.Client

  @impl true
  def fetch_gateways do
    Application.get_env(:mappers, :inventory_stub_response, {:error, :no_stub_configured})
  end
end
