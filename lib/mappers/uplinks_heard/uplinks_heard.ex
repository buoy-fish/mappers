defmodule Mappers.UplinksHeard do
  import Ecto.Query, only: [from: 2]
  require Logger
  alias Mappers.Repo
  alias Mappers.UplinksHeards.UplinkHeard

  @doc """
  Delete all `uplinks_heard` rows for a given gateway EUI. Returns the number
  of rows deleted. Used by admin coverage-purge endpoint.
  """
  def delete_by_gateway(gateway_eui) when is_binary(gateway_eui) do
    {count, _} =
      from(u in UplinkHeard, where: u.gateway_eui == ^gateway_eui)
      |> Repo.delete_all()

    {:ok, count}
  end

  def create(hotspots, uplink_id) do
    uplinks_heard =
      Enum.map(hotspots, fn hotspot ->
        %{}
        |> Map.put(:hotspot_address, hotspot["id"])
        |> Map.put(:hotspot_name, hotspot["name"])
        |> Map.put(:gateway_eui, hotspot["gateway_eui"])
        |> Map.put(:relay_gateway_eui, hotspot["relay_gateway_eui"])
        |> Map.put(:latitude, hotspot["lat"])
        |> Map.put(:longitude, hotspot["long"])
        |> Map.put(:rssi, hotspot["rssi"])
        |> Map.put(:snr, hotspot["snr"])
        |> Map.put(:timestamp, parse_hotspot_timestamp(hotspot["reported_at"]))
        |> Map.put(:uplink_id, uplink_id)
      end)

    task_results = insert_uplinks_heard(uplinks_heard)

    # Each task result is {:ok, {:ok, schema}} on insert success or
    # {:ok, {:error, changeset}} on changeset/insert failure. The original
    # code's `match?({:error, _}, changeset)` was checking the wrong thing
    # (the inner value is a bare schema or changeset, not a tagged tuple),
    # so failures slipped through into the response and crashed Jason on
    # the unencodable Ecto.Changeset.
    #
    # New behavior: split successes from failures, return only the inserted
    # schemas, and log any failures so we can debug recurring validation
    # issues. We do NOT fail the whole uplink on partial failure — losing
    # one hotspot's "heard" record is preferable to losing the entire H3
    # hex (which already painted, courtesy of H3.create having succeeded).
    {successes, failures} =
      Enum.split_with(task_results, fn
        {:ok, {:ok, _schema}} -> true
        _ -> false
      end)

    successful_schemas =
      Enum.map(successes, fn {:ok, {:ok, schema}} -> schema end)

    if failures != [] do
      details =
        failures
        |> Enum.map(fn
          {:ok, {:error, changeset}} -> inspect(changeset.errors)
          other -> inspect(other)
        end)
        |> Enum.join("; ")

      Logger.warning(
        "[UplinksHeard] #{length(failures)}/#{length(task_results)} inserts failed: #{details}"
      )
    end

    {:ok, successful_schemas}
  end

  def insert_uplinks_heard(uplinks_heard) do
    uplinks_heard
    |> Task.async_stream(fn uplink_heard -> insert_uplink_heard(uplink_heard) end)
  end

  def insert_uplink_heard(uplink_heard) do
    %UplinkHeard{}
    |> UplinkHeard.changeset(uplink_heard)
    |> Repo.insert()
  end

  # Per-hotspot reception time. Comes in as unix milliseconds (from
  # Ingest.normalize_payload's parse_reported_at/1) or nil. nil happens for:
  #   - device-only placeholder hotspots (no real reception event)
  #   - rxInfo entries from upstream that lacked both `time` and `gwTime`
  # Default to current UTC time so the row insert succeeds. Losing precise
  # per-gateway reception time is preferable to dropping the whole uplink
  # (and the H3 hex it would have painted).
  defp parse_hotspot_timestamp(nil), do: DateTime.utc_now()

  defp parse_hotspot_timestamp(ts) when is_number(ts) do
    round(ts / 1000) |> DateTime.from_unix!()
  end
end
