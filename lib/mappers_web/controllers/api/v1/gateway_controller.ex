defmodule MappersWeb.API.V1.GatewayController do
  @moduledoc """
  Returns the list of gateways rendered on the "Show Gateways" layer of the
  coverage map.

  Primary source: the `Mappers.Gateways.Inventory` cache of
  `app.buoy.fish /api/gateways/public`, the authoritative inventory of
  configured gateways (name, EUI, role, intended lat/lon). This lets operators
  see a gateway on the map as soon as it's provisioned, without needing an
  uplink to arrive first.

  Fallback: if no inventory fetch has ever succeeded (app.buoy.fish down since
  boot), we fall back to the original behavior — DISTINCT ON query against
  `uplinks_heard` to infer gateway locations from observed uplinks.
  """
  use MappersWeb, :controller
  require Logger

  import Ecto.Query
  alias Mappers.Gateways
  alias Mappers.Gateways.Inventory
  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard

  def index(conn, _params) do
    case Inventory.get() do
      {:ok, gateways} ->
        # The inventory knows where a gateway SHOULD be, but not whether it's
        # alive — last_heard comes from our own uplinks_heard observations.
        json(conn, %{gateways: Gateways.attach_last_heard(gateways)})

      :unavailable ->
        Logger.warning(
          "[GatewayController] gateway inventory unavailable, falling back to uplinks_heard"
        )

        json(conn, %{gateways: fetch_from_uplinks_heard()})
    end
  end

  defp fetch_from_uplinks_heard do
    # Degraded-mode fallback when app.buoy.fish is unreachable. The output
    # `gateway_eui` key is preserved for shape compatibility with the
    # primary inventory path, even though the value here is actually a
    # stream ID (rxInfo.gatewayId), not a hardware EUI.
    from(uh in UplinkHeard,
      where: not is_nil(uh.gateway_id) and uh.gateway_id != "",
      distinct: uh.gateway_id,
      order_by: [asc: uh.gateway_id, desc: uh.timestamp],
      select: %{
        gateway_eui: uh.gateway_id,
        hotspot_name: uh.hotspot_name,
        lat: uh.latitude,
        lng: uh.longitude,
        last_heard: uh.timestamp
      }
    )
    |> Repo.all()
  end
end
