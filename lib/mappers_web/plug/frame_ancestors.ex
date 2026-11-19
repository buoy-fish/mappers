defmodule MappersWeb.Plug.FrameAncestors do
  @moduledoc """
  Lets app.buoy.fish frame the map picker (`?embed=picker`), and nobody else.

  The app embeds `/?embed=picker` as its projects' "Default map view" picker:
  the real public map, so an admin frames a project exactly as a visitor will
  see it (see `assets/js/utils/embedPicker.js`). Phoenix's
  `put_secure_browser_headers` default is `frame-ancestors 'self'`, which
  blocks that; for picker requests only, this replaces it after that plug,
  keeping `base-uri 'self'`. Every other page keeps the default, so the rest
  of the map can't be framed (clickjacking).

  The allowed origins are `config :mappers, :frame_ancestors` (prod: the app;
  dev adds localhost so a local app can embed a local map). Changing it needs
  a restart.
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    conn = fetch_query_params(conn)

    if conn.query_params["embed"] == "picker" do
      ancestors =
        Enum.join(["'self'" | Application.get_env(:mappers, :frame_ancestors, [])], " ")

      put_resp_header(
        conn,
        "content-security-policy",
        "base-uri 'self'; frame-ancestors #{ancestors};"
      )
    else
      conn
    end
  end
end
