defmodule MappersWeb.PageController do
  use MappersWeb, :controller

  # Non-SPA prefixes are 404'd upstream by `MappersWeb.Plug.ReservedPaths`,
  # piped in front of the deep-link catch-all — early enough to beat the
  # `accepts ["html"]` that was turning a JSON client's 404 into a 406.
  def index(conn, params) do
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
end
