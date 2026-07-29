defmodule MappersWeb.PageController do
  use MappersWeb, :controller

  # First path segments owned by something other than the SPA. The project
  # deep-link routes at the bottom of the router are a catch-all shape
  # (`/:project/*flags`), so an unmatched path under one of these prefixes — a
  # typo'd API endpoint, say — would otherwise be answered with the HTML shell
  # and a 200. Those get a 404 instead, exactly as they did before the
  # catch-all existed. Mirrors `RESERVED` in assets/js/utils/projectLink.js.
  @reserved_segments ~w(api tiles socket live css js images fonts)

  def index(conn, params) do
    case conn.path_info do
      [first | _] when first in @reserved_segments -> not_found(conn)
      _ -> shell(conn, params)
    end
  end

  defp shell(conn, params) do
    meta =
      MappersWeb.OgMeta.build(params,
        base_url: MappersWeb.Endpoint.url(),
        page_url: Phoenix.Controller.current_url(conn),
        path_info: conn.path_info,
        mapbox_token: System.get_env("MAPBOX_ACCESS_TOKEN")
      )

    conn
    |> assign(:og_title, meta.title)
    |> assign(:og_description, meta.description)
    |> assign(:og_image, meta.image)
    |> assign(:og_url, meta.url)
    |> render("index.html")
  end

  defp not_found(conn) do
    conn
    |> put_status(:not_found)
    |> put_view(MappersWeb.ErrorView)
    |> render("404.html")
  end
end
