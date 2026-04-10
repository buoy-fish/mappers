defmodule MappersWeb.API.V1.IngestUplinkController do
  use MappersWeb, :controller
  require Logger

  alias Mappers.Ingest

  def create(conn, params) do
    dev_eui = get_in(params, ["deviceInfo", "devEui"]) || params["dev_eui"] || "unknown"

    resp = Ingest.ingest_uplink(params)
    case resp do
      %{error: reason} ->
        Logger.warning("Ingest rejected dev_eui=#{dev_eui}: #{inspect(reason)}")
        Plug.Conn.put_status(conn, 400)
      _ ->
        Logger.info("Ingest success dev_eui=#{dev_eui}")
        Plug.Conn.put_status(conn, 200)
    end
    |> json(resp)
  end
end
