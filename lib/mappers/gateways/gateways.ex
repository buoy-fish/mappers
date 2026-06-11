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
      altitude: g["altitude"],
      # Helium / mesh identities (exposed by app.buoy.fish since PR #161;
      # nil on older API versions, which every consumer below tolerates).
      helium_pubkey: g["helium_pubkey"],
      helium_animal_name: g["helium_animal_name"],
      mesh_relay_id: g["mesh_relay_id"]
    }
  end

  @doc """
  Attach `:last_heard` (the most recent `uplinks_heard.timestamp`, or nil if
  the gateway has never heard an uplink) to each inventory gateway.

  Three match dimensions, max taken across all hits:

    * ID: `uplinks_heard.gateway_id` against the hardware EUI, every
      concentrator GWID, and the Helium pubkey, case-insensitively.
    * Name: `uplinks_heard.hotspot_name` against the gateway's inventory
      name AND its Helium animal name, normalized (lowercase, `-`/`_`
      treated as spaces). This is what associates gateways whose stream IDs
      were never recorded in the inventory, and Helium-routed uplinks
      stamped with the animal name. A name match only credits rows bearing
      that name — a stream ID heard under several names over time doesn't
      leak its other rows.
    * Mesh suffix: mesh uplinks reach the LNS under a 16-hex virtual GWID
      `<mesh_prefix><mesh_relay_id>`; the prefix lives in the GWMP, so a
      relay gateway is canonicalized by matching the trailing 8 hex of
      16-char stream IDs against its `mesh_relay_id`.
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

    last_heard_by_relay_suffix = relay_suffix_hits(gateways)

    Enum.map(gateways, fn gw ->
      id_hits = Enum.map(identifiers(gw), &Map.get(last_heard_by_id, &1))

      name_hits =
        gw
        |> name_candidates()
        |> Enum.map(&Map.get(last_heard_by_name, &1))

      relay_hit =
        case relay_suffix(gw) do
          nil -> nil
          suffix -> Map.get(last_heard_by_relay_suffix, suffix)
        end

      last_heard =
        (id_hits ++ name_hits ++ [relay_hit])
        |> Enum.reject(&is_nil/1)
        |> Enum.max(DateTime, fn -> nil end)

      Map.put(gw, :last_heard, last_heard)
    end)
  end

  defp identifiers(gw) do
    [gw.gateway_eui, Map.get(gw, :helium_pubkey) | gw.concentrator_ids || []]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.map(&String.downcase/1)
  end

  defp name_candidates(gw) do
    [gw.hotspot_name, Map.get(gw, :helium_animal_name)]
    |> Enum.map(&normalize_name/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
  end

  defp relay_suffix(gw) do
    case Map.get(gw, :mesh_relay_id) do
      id when is_binary(id) and id != "" -> String.downcase(id)
      _ -> nil
    end
  end

  # last-heard per 8-hex mesh suffix, considering only 16-char stream IDs
  # (the virtual-GWID length) so e.g. a base58 pubkey that happens to end in
  # the same 8 characters can't be miscredited to a relay.
  defp relay_suffix_hits(gateways) do
    suffixes =
      gateways
      |> Enum.map(&relay_suffix/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    if suffixes == [] do
      %{}
    else
      from(uh in UplinkHeard,
        where:
          fragment("char_length(?)", uh.gateway_id) == 16 and
            fragment("right(lower(?), 8)", uh.gateway_id) in ^suffixes,
        group_by: fragment("right(lower(?), 8)", uh.gateway_id),
        select: {fragment("right(lower(?), 8)", uh.gateway_id), max(uh.timestamp)}
      )
      |> Repo.all()
      |> Map.new()
    end
  end

  defp normalize_name(nil), do: nil

  defp normalize_name(name) do
    name
    |> String.downcase()
    |> String.replace(~r/[-_\s]+/, " ")
    |> String.trim()
  end
end
