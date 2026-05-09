defmodule MappersWeb.API.V1.Admin.GatewayCoverageController do
  @moduledoc """
  Admin endpoint for surgically purging coverage contributions from a specific
  gateway. Used by app.buoy.fish to clean up bench-test data after a gateway
  moves to its permanent location.
  """
  use MappersWeb, :controller
  require Logger

  alias Mappers.UplinksHeard

  def delete(conn, %{"gateway_id" => gateway_id}) do
    {:ok, count} = UplinksHeard.delete_by_gateway(gateway_id)
    Logger.info("Purged #{count} uplinks_heard rows for gateway_id=#{gateway_id}")
    json(conn, %{ok: true, gateway_id: gateway_id, deleted_count: count})
  rescue
    e ->
      Logger.error("Purge failed for gateway_id=#{Map.get(conn.params, "gateway_id")}: #{Exception.message(e)}")

      conn
      |> put_status(:internal_server_error)
      |> json(%{ok: false, error: "purge_failed", reason: Exception.message(e)})
  end
end
