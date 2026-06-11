defmodule Mappers.Gateways do
  @moduledoc """
  Helpers for the gateway inventory shown on the coverage map's
  "Show Gateways" layer.

  A gateway is heard under many identities (mirroring app.buoy.fish's
  multi-identifier resolution): its hardware EUI, either concentrator
  (slot) GWID, an HPR-derived stream ID, or — when no ID is recorded in
  the inventory — only by the operator name the packet forwarder stamps
  into `uplinks_heard.hotspot_name`. Association fires if ANY identifier
  matches.
  """

  import Ecto.Query

  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard

  @doc """
  Map one raw gateway from app.buoy.fish `/api/gateways/public` (string keys)
  to the shape the mapper serves.

  The public API serializes the concentrator slots as `slot1_gwid` /
  `slot2_gwid` — there is no `concentrator_ids` key (reading one was why only
  EUI matches ever fired in prod). Any legacy `concentrator_ids` is still
  merged in case the API grows one later.
  """
  def from_inventory(g) do
    concentrator_ids =
      ([g["slot1_gwid"], g["slot2_gwid"]] ++ List.wrap(g["concentrator_ids"]))
      |> Enum.reject(&(&1 in [nil, ""]))
      |> Enum.uniq()

    %{
      gateway_eui: g["gateway_eui"],
      concentrator_ids: concentrator_ids,
      hotspot_name: g["name"],
      lat: g["latitude"],
      lng: g["longitude"],
      role: g["role"],
      description: g["description"],
      altitude: g["altitude"]
    }
  end

  @doc """
  Attach `:last_heard` (the most recent `uplinks_heard.timestamp`, or nil if
  the gateway has never heard an uplink) to each inventory gateway.

  Two match dimensions, max taken across all hits:

    * ID: `uplinks_heard.gateway_id` against the hardware EUI and every
      concentrator GWID, case-insensitively (hex IDs are normalized to
      lowercase on both sides).
    * Name: `uplinks_heard.hotspot_name` against the gateway's inventory
      name, normalized (lowercase, `-`/`_` treated as spaces). This is what
      associates gateways whose stream IDs were never recorded in the
      inventory, and Helium-routed uplinks stamped with the animal name.
      A name match only credits rows bearing that name — a stream ID heard
      under several names over time doesn't leak its other rows.
  """
  def attach_last_heard(gateways) do
    ids =
      gateways
      |> Enum.flat_map(&identifiers/1)
      |> Enum.uniq()

    last_heard_by_id =
      from(uh in UplinkHeard,
        where: fragment("lower(?)", uh.gateway_id) in ^ids,
        group_by: fragment("lower(?)", uh.gateway_id),
        select: {fragment("lower(?)", uh.gateway_id), max(uh.timestamp)}
      )
      |> Repo.all()
      |> Map.new()

    # Grouped per distinct hotspot_name (small cardinality), then folded by
    # normalized name in Elixir — normalization is easier here than in SQL.
    last_heard_by_name =
      from(uh in UplinkHeard,
        where: not is_nil(uh.hotspot_name) and uh.hotspot_name != "",
        group_by: uh.hotspot_name,
        select: {uh.hotspot_name, max(uh.timestamp)}
      )
      |> Repo.all()
      |> Enum.group_by(fn {name, _ts} -> normalize_name(name) end, fn {_name, ts} -> ts end)
      |> Map.new(fn {name, timestamps} -> {name, Enum.max(timestamps, DateTime)} end)

    Enum.map(gateways, fn gw ->
      id_hits = Enum.map(identifiers(gw), &Map.get(last_heard_by_id, &1))
      name_hit = Map.get(last_heard_by_name, normalize_name(gw.hotspot_name))

      last_heard =
        [name_hit | id_hits]
        |> Enum.reject(&is_nil/1)
        |> Enum.max(DateTime, fn -> nil end)

      Map.put(gw, :last_heard, last_heard)
    end)
  end

  defp identifiers(gw) do
    [gw.gateway_eui | gw.concentrator_ids || []]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.map(&String.downcase/1)
  end

  defp normalize_name(nil), do: nil

  defp normalize_name(name) do
    name
    |> String.downcase()
    |> String.replace(~r/[-_\s]+/, " ")
    |> String.trim()
  end
end
