defmodule MappersWeb.API.V1.GatewayController do
  @moduledoc """
  Returns the list of gateways rendered on the "Show Gateways" layer of the
  coverage map.

  Primary source: `app.buoy.fish /api/gateways/public`, which is the authoritative
  inventory of configured gateways (name, EUI, role, intended lat/lon). This
  lets operators see a gateway on the map as soon as it's provisioned, without
  needing an uplink to arrive first.

  Fallback: if the HTTP call to app.buoy.fish fails (network error, non-200,
  etc.), we fall back to the original behavior — DISTINCT ON query against
  `uplinks_heard` to infer gateway locations from observed uplinks.
  """
  use MappersWeb, :controller
  require Logger

  import Ecto.Query
  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard

  @default_app_url "http://localhost:4000"

  def index(conn, _params) do
    case fetch_from_app_buoy() do
      {:ok, gateways} ->
        json(conn, %{gateways: gateways})

      {:error, reason} ->
        Logger.warning(
          "[GatewayController] app.buoy.fish gateway fetch failed: #{inspect(reason)}, falling back to uplinks_heard"
        )

        json(conn, %{gateways: fetch_from_uplinks_heard()})
    end
  end

  defp fetch_from_app_buoy do
    base = System.get_env("APP_BUOY_URL") || @default_app_url
    url = String.to_charlist("#{base}/api/gateways/public")

    :inets.start()
    :ssl.start()

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
        {:ok, Enum.map(gateways, &map_gateway/1)}

      {:ok, _} ->
        {:error, :unexpected_response_shape}

      {:error, reason} ->
        {:error, {:json_decode, reason}}
    end
  end

  defp map_gateway(g) do
    %{
      gateway_eui: g["gateway_eui"],
      hotspot_name: g["name"],
      lat: g["latitude"],
      lng: g["longitude"],
      role: g["role"],
      description: g["description"],
      altitude: g["altitude"]
    }
  end

  defp fetch_from_uplinks_heard do
    from(uh in UplinkHeard,
      where: not is_nil(uh.gateway_eui) and uh.gateway_eui != "",
      distinct: uh.gateway_eui,
      order_by: [asc: uh.gateway_eui, desc: uh.timestamp],
      select: %{
        gateway_eui: uh.gateway_eui,
        hotspot_name: uh.hotspot_name,
        lat: uh.latitude,
        lng: uh.longitude,
        last_heard: uh.timestamp
      }
    )
    |> Repo.all()
  end
end
