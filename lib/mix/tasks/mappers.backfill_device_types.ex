defmodule Mix.Tasks.Mappers.BackfillDeviceTypes do
  @moduledoc """
  One-shot backfill of `uplinks.device_type` for historical rows.

  Fetches `dev_eui -> device_type` mappings from `${APP_BUOY_URL}/api/internal/devices/types`
  (defaults to `http://localhost:4000`) and runs a per-device bulk update
  against rows whose `device_type` is currently NULL.

  Idempotent: only touches rows where `device_type IS NULL`, so re-running
  is a no-op for any device whose uplinks have already been tagged.

  ## Auth

  The endpoint is gated by the shared `X-Mappers-Admin-Token` header. The
  token must be set in the `BUOY_MAPPERS_ADMIN_TOKEN` env var (same value
  on both the mapper and app sides — already wired into the prod systemd
  EnvironmentFiles for `gateway-receptions`).

  ## Usage

      mix mappers.backfill_device_types

  Or with a custom app host:

      APP_BUOY_URL=http://localhost:4000 mix mappers.backfill_device_types
  """

  use Mix.Task
  import Ecto.Query
  alias Mappers.Repo
  alias Mappers.Uplinks.Uplink

  @shortdoc "Backfill uplinks.device_type from app.buoy.fish"
  @default_app_url "http://localhost:4000"
  @endpoint_path "/api/internal/devices/types"

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")
    :ok = Application.ensure_started(:inets)
    :ok = Application.ensure_started(:ssl)

    base = System.get_env("APP_BUOY_URL") || @default_app_url

    token =
      case System.get_env("BUOY_MAPPERS_ADMIN_TOKEN") do
        nil ->
          Mix.raise("BUOY_MAPPERS_ADMIN_TOKEN is not set. Same value as the app side; check the prod systemd EnvironmentFile.")

        "" ->
          Mix.raise("BUOY_MAPPERS_ADMIN_TOKEN is empty.")

        t ->
          t
      end

    Mix.shell().info("Fetching device types from #{base}#{@endpoint_path} ...")

    case fetch_device_types(base, token) do
      {:ok, []} ->
        Mix.shell().info("No devices with non-null device_type returned. Nothing to backfill.")

      {:ok, mappings} ->
        Mix.shell().info("Got #{length(mappings)} device(s). Applying updates ...")
        apply_updates(mappings)

      {:error, reason} ->
        Mix.raise("Failed to fetch device types: #{inspect(reason)}")
    end
  end

  defp fetch_device_types(base, token) do
    url = String.to_charlist("#{base}#{@endpoint_path}")
    headers = [{~c"x-mappers-admin-token", String.to_charlist(token)}]
    request_opts = [timeout: 30_000, connect_timeout: 5_000]
    http_opts = [body_format: :binary]

    case :httpc.request(:get, {url, headers}, request_opts, http_opts) do
      {:ok, {{_, 200, _}, _headers, body}} ->
        parse_body(body)

      {:ok, {{_, status, _}, _headers, body}} ->
        {:error, {:http_status, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp parse_body(body) do
    case Jason.decode(body) do
      {:ok, %{"data" => devices}} when is_list(devices) ->
        mappings =
          devices
          |> Enum.map(fn d -> {d["dev_eui"], d["device_type"]} end)
          |> Enum.filter(fn {eui, type} ->
            is_binary(eui) and eui != "" and is_binary(type) and type != ""
          end)

        {:ok, mappings}

      {:ok, other} ->
        {:error, {:unexpected_shape, other}}

      {:error, reason} ->
        {:error, {:json_decode, reason}}
    end
  end

  defp apply_updates(mappings) do
    {total_devices, total_rows} =
      Enum.reduce(mappings, {0, 0}, fn {dev_eui, device_type}, {dev_count, row_count} ->
        {updated, _} =
          from(u in Uplink,
            where: u.dev_eui == ^dev_eui and is_nil(u.device_type)
          )
          |> Repo.update_all(set: [device_type: device_type])

        if updated > 0 do
          Mix.shell().info(
            "  #{dev_eui}  type=#{device_type}  rows_updated=#{updated}"
          )
        end

        {dev_count + 1, row_count + updated}
      end)

    Mix.shell().info(
      "Done. Touched #{total_devices} device(s); updated #{total_rows} uplink row(s)."
    )
  end
end
