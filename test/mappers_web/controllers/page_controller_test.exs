defmodule MappersWeb.PageControllerTest do
  use MappersWeb.ConnCase

  test "GET / mounts the React app shell", %{conn: conn} do
    assert conn |> get("/") |> html_response(200) =~ ~s(<div id="react-app">)
  end

  test "GET / emits default branded link-preview metadata", %{conn: conn} do
    html = conn |> get("/") |> html_response(200)
    assert html =~ ~s(property="og:title" content="Buoy.Fish Coverage Map")
    assert html =~ ~s(property="og:image")
    assert html =~ "/images/og-cover.png"
    assert html =~ ~s(name="twitter:card" content="summary_large_image")
    assert html =~ ~s(name="theme-color")
  end

  test "GET a timeline deep-link emits tailored preview metadata", %{conn: conn} do
    html =
      conn
      |> get("/?play=punta-eugenia-baja&start=2026-05-01&end=2026-06-02")
      |> html_response(200)

    assert html =~ "Punta Eugenia Baja coverage timeline"
    assert html =~ "2026-05-01"
    assert html =~ "2026-06-02"
  end
end
