defmodule MappersWeb.Plug.IngestAuth do
  @moduledoc """
  Trusted-forwarder authentication for the public ingest endpoint.

  Reads a Bearer token from the `authorization` header. If it matches
  `Application.get_env(:mappers, :ingest_secret)`, marks the connection
  as trusted by assigning `:trusted_ingest, true`. Downstream plugs (most
  importantly `MappersWeb.Plug.RateLimit`) honor that flag to skip rate
  limiting for known senders such as our own `forwarder.ex` and the
  `mix mappers.backfill_buoy` task.

  Unlike `MappersWeb.Plug.AdminAuth`, this plug **never halts**. The
  ingest endpoint is documented as open to any service (see
  `CLAUDE.md` -> "The ingest endpoint is open for any service to publish
  mapping data."). Unauthenticated callers still get through; they just
  share the public-traffic rate-limit bucket.

  If `:ingest_secret` is unset on the server, no request will ever match
  and every caller is treated as untrusted. This is the safe default.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    expected = Application.get_env(:mappers, :ingest_secret)
    provided = bearer_token(conn)

    cond do
      is_nil(expected) or expected == "" -> conn
      is_nil(provided) -> conn
      provided == expected -> assign(conn, :trusted_ingest, true)
      true -> conn
    end
  end

  defp bearer_token(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token | _] -> String.trim(token)
      ["bearer " <> token | _] -> String.trim(token)
      _ -> nil
    end
  end
end
