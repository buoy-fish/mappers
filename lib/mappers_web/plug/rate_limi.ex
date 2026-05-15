defmodule MappersWeb.Plug.RateLimit do
  @moduledoc """
  Token-bucket rate limiter keyed on caller IP.

  Honors `conn.assigns[:trusted_ingest]` set by
  `MappersWeb.Plug.IngestAuth` — requests carrying a valid Bearer secret
  skip the limit entirely. Without that flag, the limit is applied per
  caller IP (Cloudflare's `cf-connecting-ip` first, then
  `x-forwarded-for`, then the connecting socket address as a fallback
  for direct/localhost calls).

  The IP fallback matters: before it was added, every direct call to
  `localhost` collapsed onto a single `"<action>:"` bucket (nil IP), so
  app.buoy.fish's live forwarder, the backfill task, and any browser
  loopback all competed for one bucket of `limit` requests/minute.
  """

  import Plug.Conn

  def init(default), do: default

  # Authenticated trusted-forwarder requests bypass the limit.
  def call(%Plug.Conn{assigns: %{trusted_ingest: true}} = conn, _opts), do: conn

  def call(conn, [action, limit]) do
    cf_ip = conn |> get_req_header("cf-connecting-ip") |> List.first()
    xff = conn |> get_req_header("x-forwarded-for") |> List.first()
    socket_ip = conn.remote_ip |> :inet.ntoa() |> to_string()

    ip_address = cf_ip || xff || socket_ip

    case Hammer.check_rate("#{action}:#{ip_address}", 60_000, limit) do
      {:allow, _count} ->
        conn

      {:deny, _limit} ->
        conn
        |> send_resp(:too_many_requests, "Too many requests")
        |> halt()
    end
  end
end
