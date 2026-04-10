defmodule Mappers.Ingest.Validate do
  require Logger

  # BUOY.FISH RELAXATION (2026-04-09)
  #
  # This validation was originally written for the public Helium mappers service,
  # which needed strict filtering to reject spoofed/garbage data from untrusted
  # sources. Buoy.Fish controls both ends (devices + this mapper), so we trust
  # our own payloads and relax constraints to avoid silent rejection.
  #
  # Changes from upstream:
  #   - altitude/accuracy: nil values default to 0.0 instead of rejecting
  #   - RSSI range: widened from [-141, 0] to [-150, 0] (Helium gateways
  #     occasionally report below -141; rejecting them drops valid coverage data)
  #   - Empty hotspots: allowed — device GPS alone creates the H3 hex, which is
  #     the primary coverage signal. Hotspot-less uplinks still show WHERE a device
  #     was heard, just not BY WHOM.
  #
  # POTENTIAL DOWNSTREAM IMPACT of empty hotspots:
  #   - H3.create/1 iterates message["hotspots"] to find best RSSI/SNR. An empty
  #     list will crash Enum.max_by/2 in h3.ex. We guard against this below by
  #     synthesizing a placeholder hotspot entry when the list is empty.
  #   - UplinksHeard.create/2 will simply insert nothing (no heard records).
  #   - The frontend info pane may show "0 hotspots heard" for these hexes.

  def validate_message(message) do
    if match?(%{"decoded" => %{"payload" => %{"latitude" => _}}}, message) == false do
      {:error, "Missing Field: latitude"}
    else
      if match?(%{"decoded" => %{"payload" => %{"longitude" => _}}}, message) == false do
        {:error, "Missing Field: longitude"}
      else
        device_lat = message["decoded"]["payload"]["latitude"]
        device_lng = message["decoded"]["payload"]["longitude"]
        # Default nil altitude/accuracy to 0.0 instead of rejecting
        device_alt = message["decoded"]["payload"]["altitude"] || 0.0
        device_acu = message["decoded"]["payload"]["accuracy"] || 0.0

        if device_lat == 0.0 or device_lat < -90 or device_lat > 90 or device_lng == 0.0 or
             device_lng < -180 or device_lng > 180 do
          {:error,
           "Invalid Device Latitude or Longitude Values for Lat: #{device_lat} Lng: #{device_lng}"}
        else
          if !is_number(device_alt) or device_alt < -500 do
            {:error, "Invalid Device Altitude Value for Alt: #{device_alt}"}
          else
            if !is_number(device_acu) or device_acu < 0 do
              {:error, "Invalid Device Accuracy Value for Accuracy: #{device_acu}"}
            else
              validate_hotspots(message["hotspots"] || [], device_lat, device_lng)
            end
          end
        end
      end
    end
  end

  # No hotspots is OK for Buoy.Fish — device GPS alone is valuable for coverage.
  # We synthesize a placeholder so downstream H3.create doesn't crash on empty list.
  defp validate_hotspots([], device_lat, device_lng) do
    Logger.info("Uplink has no hotspots; using device-only placeholder for H3 coverage")
    {:ok, [%{
      "id" => "device_only",
      "name" => "device_only",
      "lat" => device_lat,
      "long" => device_lng,
      "rssi" => -100.0,
      "snr" => 0.0,
      "frequency" => 0.0,
      "spreading" => "unknown",
      "reported_at" => nil
    }]}
  end

  defp validate_hotspots(hotspots, device_lat, device_lng) do
    Enum.map(hotspots, fn hotspot ->
      hotspot_name = hotspot["name"]
      hotspot_lat = hotspot["lat"]
      hotspot_lng = hotspot["long"]
      hotspot_rssi = hotspot["rssi"]
      hotspot_snr = hotspot["snr"]

      if hotspot_lat == 0.0 or hotspot_lat < -90 or
           hotspot_lat > 90 or hotspot_lng == 0.0 or
           hotspot_lng < -180 or hotspot_lng > 180 do
        {:error,
         "Invalid Latitude or Longitude Values for Hotspot: #{hotspot_name}"}
      else
        if Geocalc.distance_between([device_lat, device_lng], [
             hotspot_lat,
             hotspot_lng
           ]) >
             500_000 do
          {:error, "Invalid Distance Between Device and Hotspot: #{hotspot_name}"}
        else
          # Widened from [-141, 0] — Helium gateways can report below -141
          if hotspot_rssi < -150 or hotspot_rssi > 0 do
            {:error, "Invalid Uplink RSSI for Hotspot: #{hotspot_name}"}
          else
            if hotspot_snr < -40 or hotspot_snr > 40 do
              {:error, "Invalid Uplink SNR for Hotspot: #{hotspot_name}"}
            else
              {:ok, hotspot}
            end
          end
        end
      end
    end)
    |> Enum.split_with(fn
      {:error, _} -> true
      {:ok, _} -> false
    end)
    |> case do
      # All hotspots invalid — fall back to device-only placeholder
      {errors, []} ->
        Logger.warning("All #{length(errors)} hotspots failed validation; using device-only placeholder")
        validate_hotspots([], device_lat, device_lng)

      # At least some valid hotspots
      {_, hotspots} ->
        hotspots_s =
          hotspots
          |> Enum.map(&elem(&1, 1))

        {:ok, hotspots_s}
    end
  end
end
