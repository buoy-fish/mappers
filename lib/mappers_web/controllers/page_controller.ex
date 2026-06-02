defmodule MappersWeb.PageController do
  use MappersWeb, :controller

  def index(conn, params) do
    meta =
      MappersWeb.OgMeta.build(params,
        base_url: MappersWeb.Endpoint.url(),
        page_url: Phoenix.Controller.current_url(conn),
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
