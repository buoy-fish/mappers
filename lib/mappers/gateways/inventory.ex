defmodule Mappers.Gateways.Inventory do
  @moduledoc """
  Supervised cache of the app.buoy.fish gateway inventory
  (`GET /api/gateways/public`).

  Refetches every `config :mappers, :inventory_refresh_ms` (60s) and keeps the
  last successful snapshot when app.buoy.fish is down, so a brief outage
  neither blanks the gateway layer nor flips coverage scoping. `get/1` returns
  `{:ok, gateways}` (possibly stale) or `:unavailable` when no fetch has ever
  succeeded.

  The HTTP boundary is injectable via `config :mappers, :inventory_http_client`
  (see `Mappers.Gateways.Inventory.Client`) so tests never hit the network.
  """
  use GenServer
  require Logger

  alias Mappers.Gateways

  defmodule Client do
    @moduledoc """
    Fetches the raw (string-keyed) gateway list from app.buoy.fish.
    """
    @callback fetch_gateways() :: {:ok, [map()]} | {:error, term()}
  end

  defmodule HTTPClient do
    @moduledoc """
    Default `Client`: `:httpc` against `$APP_BUOY_URL/api/gateways/public`.
    """
    @behaviour Client

    @default_app_url "http://localhost:4000"

    @impl true
    def fetch_gateways do
      base = System.get_env("APP_BUOY_URL") || @default_app_url
      url = String.to_charlist("#{base}/api/gateways/public")

      request_opts = [timeout: 5_000, connect_timeout: 2_000]
      http_opts = [body_format: :binary]

      case :httpc.request(:get, {url, []}, request_opts, http_opts) do
        {:ok, {{_, 200, _}, _headers, body}} ->
          parse_body(body)

        {:ok, {{_, status, _}, _headers, _body}} ->
          {:error, {:http_status, status}}

        {:error, reason} ->
          {:error, reason}
      end
    end

    defp parse_body(body) do
      case Jason.decode(body) do
        {:ok, %{"data" => gateways}} when is_list(gateways) ->
          {:ok, gateways}

        {:ok, _} ->
          {:error, :unexpected_response_shape}

        {:error, reason} ->
          {:error, {:json_decode, reason}}
      end
    end
  end

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name, __MODULE__))
  end

  @doc """
  The cached inventory: `{:ok, gateways}` (mapped via
  `Mappers.Gateways.from_inventory/1`) or `:unavailable`.
  """
  def get(server \\ __MODULE__), do: GenServer.call(server, :get)

  @doc """
  Synchronously refetch now (in addition to the periodic timer). Used by tests
  to make the cache deterministic; the periodic timer keeps its own cadence.
  """
  def refresh(server \\ __MODULE__), do: GenServer.call(server, :refresh)

  @doc """
  Drop the snapshot (back to `:unavailable`). Test support only — prod has no
  reason to forget a last-known-good inventory.
  """
  def reset(server \\ __MODULE__), do: GenServer.call(server, :reset)

  @impl true
  def init(opts) do
    state = %{
      gateways: nil,
      client:
        Keyword.get(
          opts,
          :http_client,
          Application.get_env(:mappers, :inventory_http_client, HTTPClient)
        ),
      refresh_ms:
        Keyword.get(opts, :refresh_ms, Application.get_env(:mappers, :inventory_refresh_ms, 60_000))
    }

    {:ok, state, {:continue, :first_fetch}}
  end

  @impl true
  def handle_continue(:first_fetch, state) do
    schedule_refresh(state)
    {:noreply, do_refresh(state)}
  end

  @impl true
  def handle_call(:get, _from, state) do
    reply =
      case state.gateways do
        nil -> :unavailable
        gateways -> {:ok, gateways}
      end

    {:reply, reply, state}
  end

  def handle_call(:refresh, _from, state) do
    {:reply, :ok, do_refresh(state)}
  end

  def handle_call(:reset, _from, state) do
    {:reply, :ok, %{state | gateways: nil}}
  end

  @impl true
  def handle_info(:refresh, state) do
    schedule_refresh(state)
    {:noreply, do_refresh(state)}
  end

  defp schedule_refresh(state), do: Process.send_after(self(), :refresh, state.refresh_ms)

  defp do_refresh(state) do
    case state.client.fetch_gateways() do
      {:ok, raw_gateways} ->
        %{state | gateways: Enum.map(raw_gateways, &Gateways.from_inventory/1)}

      {:error, reason} ->
        Logger.warning(
          "[Gateways.Inventory] app.buoy.fish gateway fetch failed: #{inspect(reason)}, keeping last-known-good snapshot"
        )

        state
    end
  end
end
