defmodule Mappers.Ingest do
  alias Mappers.Uplink
  alias Mappers.Uplinks
  alias Mappers.H3
  alias Mappers.H3.Links
  alias Mappers.UplinkHeard
  alias Mappers.UplinksHeard
  alias Mappers.Ingest

  defmodule IngestUplinkResponse do
    @fields [
      :uplink,
      :hotspots,
      :status
    ]
    @derive {Jason.Encoder, only: @fields}
    defstruct uplink: Uplink, hotspots: [UplinkHeard], status: nil
  end

  def ingest_uplink(message) do
    case normalize_payload(message) do
      {:ok, normalized_message} ->
        # validate that message geo values actually make sense
        Ingest.Validate.validate_message(normalized_message)
        |> case do
          {:error, reason} ->
            %{error: reason}

          {:ok, hotspots} ->
            # Substitute the validated hotspot list back into normalized_message
            # so every downstream consumer (H3.create, Uplinks.create,
            # UplinksHeard.create) sees the same list. Without this, H3.create
            # and Uplinks.create read the unvalidated original list and crash
            # when entries have nil rssi/snr or when the list is empty.
            # The validator always returns ≥1 entry — either real hotspots that
            # passed validation, or a "device_only" placeholder synthesized at
            # the device's GPS location.
            normalized_message = Map.put(normalized_message, "hotspots", hotspots)

            # create new h3_res9 record if it doesn't exist
            H3.create(normalized_message)
            |> case do
              {:error, reason} ->
                %{error: reason}

              {:ok, h3_res9} ->
                h3_res9_id = h3_res9.id

                # create uplink record
                Uplinks.create(normalized_message)
                |> case do
                  {:error, reason} ->
                    %{error: reason}

                  {:ok, uplink} ->
                    uplink_id = uplink.id

                    # create uplinks heard
                    UplinksHeard.create(hotspots, uplink_id)
                    |> case do
                      {:error, reason} ->
                        %{error: reason}

                      {:ok, uplinks_heard} ->
                        # create h3/uplink link
                        Links.create(h3_res9_id, uplink_id)
                        |> case do
                          {:error, reason} ->
                            %{error: reason}

                          {:ok, _} ->
                            %IngestUplinkResponse{
                              uplink: uplink,
                              hotspots: uplinks_heard,
                              status: "success"
                            }
                        end
                    end
                end
            end
        end

      {:error, reason} ->
        %{error: reason}
    end
  end

  # ChirpStack: look for "object" key as indicator
  #
  # BUOY.FISH RELAXATION (2026-04-09): Raw ChirpStack payloads from app.buoy.fish
  # may be missing fields that the old Node-RED massage function used to provide.
  # We now handle these gracefully with defaults:
  #   - accuracy: defaults to 0.0 (unknown) if nil
  #   - altitude: defaults to 0.0 (sea level) if nil
  #   - txInfo: may be missing; frequency/spreading default to 0/unknown
  #   - time: falls back to first rxInfo time if missing at top level
  defp normalize_payload(%{"object" => object} = message) do
    spreading_factor = get_in(message, ["txInfo", "modulation", "lora", "spreadingFactor"])
    bandwidth = get_in(message, ["txInfo", "modulation", "lora", "bandwidth"])

    {tx_frequency, spreading} =
      if spreading_factor && bandwidth do
        freq = get_in(message, ["txInfo", "frequency"]) / 1_000_000
        {freq, "SF#{spreading_factor}BW#{div(bandwidth, 1000)}"}
      else
        {0.0, "unknown"}
      end

    # Fall back to first rxInfo time if top-level time is missing
    top_time =
      message["time"] || get_in(message, ["rxInfo", Access.at(0), "time"]) ||
        get_in(message, ["rxInfo", Access.at(0), "gwTime"])

    normalized_message = %{
      # ChirpStack does not provide this field
      "app_eui" => "0000000000000000",
      "dev_eui" => get_in(message, ["deviceInfo", "devEui"]),
      "id" => message["deduplicationId"],
      "fcnt" => message["fCnt"],
      "reported_at" => parse_reported_at(top_time),
      "frequency" => tx_frequency,
      "spreading" => spreading,
      "decoded" => %{
        "payload" => %{
          "latitude" => object["latitude"],
          "longitude" => object["longitude"],
          "accuracy" => object["accuracy"] || 0.0,
          "altitude" => object["altitude"] || 0.0
        },
        "status" => "success"
      },
      "hotspots" => normalize_hotspots(message["rxInfo"] || [], tx_frequency, spreading)
    }

    {:ok, normalized_message}
  end

  defp normalize_payload(%{"decoded" => %{"payload" => _}, "hotspots" => _} = message) do
    # Console payload already has the necessary fields
    normalized_message = %{
      "app_eui" => message["app_eui"],
      "dev_eui" => message["dev_eui"],
      "id" => message["id"],
      "fcnt" => message["fcnt"],
      "reported_at" => message["reported_at"],
      "frequency" => Enum.at(message["hotspots"], 0)["frequency"],
      "spreading" => Enum.at(message["hotspots"], 0)["spreading"],
      "decoded" => %{
        "payload" => %{
          "latitude" => message["decoded"]["payload"]["latitude"],
          "longitude" => message["decoded"]["payload"]["longitude"],
          "accuracy" => message["decoded"]["payload"]["accuracy"],
          "altitude" => message["decoded"]["payload"]["altitude"]
        },
        "status" => message["decoded"]["status"]
      },
      "hotspots" => message["hotspots"]
    }

    {:ok, normalized_message}
  end

  defp normalize_payload(_message) do
    {:error, "Unrecognized payload format"}
  end

  # BUOY.FISH RELAXATION (2026-04-09): Handle raw ChirpStack rxInfo entries that:
  #   - Use gwTime instead of time
  #   - Have lat/long as floats instead of strings
  #   - May be missing gateway location entirely (filtered out)
  defp normalize_hotspots(rxInfo, tx_frequency, spreading) do
    rxInfo
    |> Enum.filter(fn info ->
      lat = get_in(info, ["metadata", "gateway_lat"])
      long = get_in(info, ["metadata", "gateway_long"])

      if is_nil(lat) or is_nil(long) do
        IO.puts("Hotspot has no location; skipping.")
        false
      else
        true
      end
    end)
    |> Enum.map(fn info ->
      # Raw ChirpStack uses gwTime; Node-RED-massaged payloads use time
      hotspot_time = info["time"] || info["gwTime"]

      %{
        "id" => get_in(info, ["metadata", "gateway_id"]),
        "name" => get_in(info, ["metadata", "gateway_name"]) || "unknown",
        "gateway_eui" => info["gatewayId"],
        "relay_gateway_eui" => info["relay_gateway_eui"],
        "lat" => to_float(get_in(info, ["metadata", "gateway_lat"])),
        "long" => to_float(get_in(info, ["metadata", "gateway_long"])),
        "rssi" => info["rssi"],
        "snr" => info["snr"],
        "frequency" => tx_frequency,
        "spreading" => spreading,
        "reported_at" => parse_reported_at(hotspot_time)
      }
    end)
  end

  # Convert string or numeric lat/long values to float safely
  defp to_float(val) when is_float(val), do: val
  defp to_float(val) when is_integer(val), do: val * 1.0

  defp to_float(val) when is_binary(val) do
    case Float.parse(val) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  defp to_float(_), do: 0.0

  defp parse_reported_at(nil), do: nil

  defp parse_reported_at(timestamp) when is_binary(timestamp) do
    case DateTime.from_iso8601(timestamp) do
      {:ok, datetime, _offset} -> DateTime.to_unix(datetime, :millisecond)
      _ -> nil
    end
  end

  defp parse_reported_at(_), do: nil
end
