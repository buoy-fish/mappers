defmodule Mappers.Coverage.Scope do
  @moduledoc """
  Classifies coverage by whether it was heard by a PERMANENT gateway.

  A gateway is permanent when its inventory `location_phase` is `"permanent"`
  or missing (older app.buoy.fish versions don't send the field — fail-open so
  the map never blanks). Identity matching reuses the `Mappers.Gateways`
  helpers, so the four dimensions here are exactly the ones `attach_last_heard/1`
  uses: stream IDs (`gateway_id`/`relay_gateway_id`), normalized hotspot name,
  and the 8-hex mesh-relay suffix of 16-char stream IDs.

  Device-GPS-only coverage — the `"device_only"` placeholder
  `Mappers.Ingest.Validate` synthesizes when an uplink has no usable rxInfo —
  counts as PERMANENT: no gateway heard it, but it is real device coverage
  (`validate.ex` calls it the primary coverage signal), and the non-permanent
  scope exists to hide bench/mobile GATEWAY hexes, not device coverage.

  Serve-time classification (no junction table): `permanent_hex_ids/1` runs one
  DISTINCT join of `uplinks_heard` × `h3_links` per memo window
  (`config :mappers, :scope_cache_ms`, 60s). Fail-open ladder: fresh memo →
  stale memo (inventory outage) → unscoped (`:unavailable`, callers serve all
  rows and log).
  """
  use GenServer
  require Logger

  import Ecto.Query

  alias Mappers.Gateways
  alias Mappers.Gateways.Inventory
  alias Mappers.H3.Links.Link
  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name, __MODULE__))
  end

  @doc """
  The set of h3_res9 ids with at least one permanent-gateway contributor:
  `{:ok, MapSet}` (possibly stale) or `:unavailable`.
  """
  def permanent_hex_ids(server \\ __MODULE__) do
    case snapshot(server) do
      {:ok, %{hex_ids: hex_ids}} -> {:ok, hex_ids}
      :unavailable -> :unavailable
    end
  end

  @doc """
  Whether any of an ingesting uplink's hotspots (normalized string-keyed maps,
  see `Mappers.Ingest`) matches a permanent gateway identity. `:unknown` when
  no inventory has ever loaded — callers decide the fail-open direction.
  """
  def classify_hotspots(hotspots, server \\ __MODULE__) do
    case snapshot(server) do
      {:ok, sets} -> Enum.any?(hotspots, &hotspot_matches?(&1, sets))
      :unavailable -> :unknown
    end
  end

  @doc """
  Parse an endpoint `scope` query param. Unknown values (including nil) scope
  to permanent — the default coverage view.
  """
  def parse_scope("other"), do: :other
  def parse_scope("all"), do: :all
  def parse_scope(_), do: :permanent

  @doc """
  Filter endpoint rows by scope, `id_fun` extracting each row's h3_res9 id.
  Fail-open: when the permanent set is unavailable every scope serves all rows
  (already logged by the snapshot path).
  """
  def filter_rows(rows, scope, id_fun, server \\ __MODULE__)

  def filter_rows(rows, :all, _id_fun, _server), do: rows

  def filter_rows(rows, scope, id_fun, server) when scope in [:permanent, :other] do
    case permanent_hex_ids(server) do
      {:ok, ids} ->
        case scope do
          :permanent -> Enum.filter(rows, &MapSet.member?(ids, id_fun.(&1)))
          :other -> Enum.reject(rows, &MapSet.member?(ids, id_fun.(&1)))
        end

      :unavailable ->
        rows
    end
  end

  @doc "Drop the memo so the next call recomputes. Test support only."
  def reset(server \\ __MODULE__), do: GenServer.call(server, :reset)

  @impl true
  def init(opts) do
    state = %{
      cache: nil,
      inventory: Keyword.get(opts, :inventory, Inventory),
      cache_ms: Keyword.get(opts, :cache_ms, Application.get_env(:mappers, :scope_cache_ms, 60_000))
    }

    {:ok, state}
  end

  # Bottom rung of the fail-open ladder: a call timeout (recompute slower than
  # 5s — B0's row-count assumption violated) or an unreachable server must
  # degrade to unscoped/:unknown, never 500 the request or crash ingest.
  defp snapshot(server) do
    GenServer.call(server, :snapshot)
  catch
    :exit, reason ->
      Logger.warning("[Coverage.Scope] snapshot call failed, serving unscoped: #{inspect(reason)}")

      :unavailable
  end

  @impl true
  def handle_call(:snapshot, _from, state) do
    cond do
      fresh?(state) ->
        {:reply, {:ok, state.cache}, state}

      true ->
        case compute(state.inventory) do
          {:ok, cache} ->
            {:reply, {:ok, cache}, %{state | cache: cache}}

          :error when state.cache != nil ->
            Logger.warning(
              "[Coverage.Scope] gateway inventory unavailable, serving stale permanent set"
            )

            {:reply, {:ok, state.cache}, state}

          :error ->
            Logger.warning(
              "[Coverage.Scope] gateway inventory unavailable and no stale set, serving unscoped"
            )

            {:reply, :unavailable, state}
        end
    end
  end

  def handle_call(:reset, _from, state) do
    {:reply, :ok, %{state | cache: nil}}
  end

  defp fresh?(%{cache: nil}), do: false

  defp fresh?(%{cache: cache, cache_ms: cache_ms}) do
    System.monotonic_time(:millisecond) - cache.computed_at < cache_ms
  end

  defp compute(inventory) do
    case Inventory.get(inventory) do
      {:ok, gateways} ->
        permanent =
          Enum.filter(gateways, &(Map.get(&1, :location_phase) in [nil, "permanent"]))

        ids = permanent |> Enum.flat_map(&Gateways.identifiers/1) |> MapSet.new()
        names = permanent |> Enum.flat_map(&Gateways.name_candidates/1) |> MapSet.new()

        suffixes =
          permanent |> Enum.map(&Gateways.relay_suffix/1) |> Enum.reject(&is_nil/1) |> MapSet.new()

        cache = %{
          ids: ids,
          names: names,
          suffixes: suffixes,
          hex_ids: query_hex_ids(ids, names, suffixes),
          computed_at: System.monotonic_time(:millisecond)
        }

        {:ok, cache}

      :unavailable ->
        :error
    end
  end

  defp query_hex_ids(ids, names, suffixes) do
    id_list = MapSet.to_list(ids)
    suffix_list = MapSet.to_list(suffixes)

    # Two-phase name match: normalization (separators/case) happens in Elixir
    # over the DISTINCT hotspot_name values (small cardinality), then the raw
    # spellings that normalized into the permanent set drive an exact SQL IN.
    raw_names =
      from(uh in UplinkHeard,
        where: not is_nil(uh.hotspot_name) and uh.hotspot_name != "",
        distinct: true,
        select: uh.hotspot_name
      )
      |> Repo.all()
      |> Enum.filter(&MapSet.member?(names, Gateways.normalize_name(&1)))

    from(uh in UplinkHeard,
      join: l in Link,
      on: l.uplink_id == uh.uplink_id,
      where:
        uh.hotspot_address == "device_only" or
          fragment("lower(?)", uh.gateway_id) in ^id_list or
          fragment("lower(?)", uh.relay_gateway_id) in ^id_list or
          uh.hotspot_name in ^raw_names or
          (fragment("char_length(?)", uh.gateway_id) == 16 and
             fragment("right(lower(?), 8)", uh.gateway_id) in ^suffix_list),
      distinct: true,
      select: l.h3_res9_id
    )
    |> Repo.all()
    |> MapSet.new()
  end

  # The device-only placeholder (see moduledoc) has no gateway identity to
  # match; it is permanent by definition.
  defp hotspot_matches?(%{"id" => "device_only"}, _sets), do: true

  defp hotspot_matches?(hotspot, %{ids: ids, names: names, suffixes: suffixes}) do
    gateway_id = downcase(hotspot["gateway_id"])
    relay_gateway_id = downcase(hotspot["relay_gateway_id"])

    MapSet.member?(ids, gateway_id) or
      MapSet.member?(ids, relay_gateway_id) or
      MapSet.member?(names, Gateways.normalize_name(hotspot["name"])) or
      (is_binary(gateway_id) and byte_size(gateway_id) == 16 and
         MapSet.member?(suffixes, binary_part(gateway_id, 8, 8)))
  end

  defp downcase(nil), do: nil
  defp downcase(value) when is_binary(value), do: String.downcase(value)
end
