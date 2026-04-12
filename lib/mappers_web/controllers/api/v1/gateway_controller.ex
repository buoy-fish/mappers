defmodule MappersWeb.API.V1.GatewayController do
  use MappersWeb, :controller

  import Ecto.Query
  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard

  def index(conn, _params) do
    # Get the most recent record per gateway_eui (PostgreSQL DISTINCT ON)
    gateways =
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

    conn |> json(%{gateways: gateways})
  end
end
