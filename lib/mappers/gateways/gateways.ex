defmodule Mappers.Gateways do
  @moduledoc """
  Helpers for the gateway inventory shown on the coverage map's
  "Show Gateways" layer.
  """

  import Ecto.Query

  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard

  @doc """
  Attach `:last_heard` (the most recent `uplinks_heard.timestamp`, or nil if
  the gateway has never heard an uplink) to each inventory gateway.

  The packet forwarder records a concentrator (slot) GWID in
  `uplinks_heard.gateway_id`, never the hardware EUI, so a gateway's uplinks
  are looked up under its EUI *and* every concentrator ID and the max is
  taken across all of them. One grouped query covers the whole list.
  """
  def attach_last_heard(gateways) do
    ids =
      gateways
      |> Enum.flat_map(&identifiers/1)
      |> Enum.uniq()

    last_heard_by_id =
      from(uh in UplinkHeard,
        where: uh.gateway_id in ^ids,
        group_by: uh.gateway_id,
        select: {uh.gateway_id, max(uh.timestamp)}
      )
      |> Repo.all()
      |> Map.new()

    Enum.map(gateways, fn gw ->
      last_heard =
        gw
        |> identifiers()
        |> Enum.map(&Map.get(last_heard_by_id, &1))
        |> Enum.reject(&is_nil/1)
        |> Enum.max(DateTime, fn -> nil end)

      Map.put(gw, :last_heard, last_heard)
    end)
  end

  defp identifiers(gw) do
    [gw.gateway_eui | gw.concentrator_ids || []]
    |> Enum.reject(&(&1 in [nil, ""]))
  end
end
