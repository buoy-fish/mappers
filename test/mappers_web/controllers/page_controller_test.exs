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

  test "GET a project deep-link mounts the shell with tailored metadata", %{conn: conn} do
    html = conn |> get("/gulf-of-nicoya") |> html_response(200)
    assert html =~ ~s(<div id="react-app">)
    assert html =~ ~s(property="og:title" content="Gulf Of Nicoya coverage · Buoy.Fish")
  end

  test "GET a project deep-link with display flags mounts the shell", %{conn: conn} do
    html =
      conn
      |> get("/gulf-of-nicoya/show-gateways/hide-coverage/show-mobile-hexes")
      |> html_response(200)

    assert html =~ ~s(<div id="react-app">)
    assert html =~ ~s(property="og:title" content="Gulf Of Nicoya coverage · Buoy.Fish")
  end

  test "GET a flags-only path mounts the shell with the default card", %{conn: conn} do
    html = conn |> get("/show-gateways") |> html_response(200)
    assert html =~ ~s(<div id="react-app">)
    assert html =~ ~s(property="og:title" content="Buoy.Fish Coverage Map")
  end

  test "GET an existing hex deep-link still mounts the shell", %{conn: conn} do
    assert conn |> get("/uplinks/hex/8928308280fffff") |> html_response(200) =~
             ~s(<div id="react-app">)
  end

  test "the SPA catch-all does not swallow unmatched API paths", %{conn: conn} do
    # A JSON client hitting a typo'd endpoint must still get a 404, not the
    # HTML shell with a 200.
    for path <- ["/api/v1/bogus", "/tiles/1/2/3.pbf"] do
      resp = get(conn, path)
      assert resp.status == 404
      refute resp.resp_body =~ ~s(<div id="react-app">)
    end
  end

  test "a JSON client gets a 404 on an unmatched API path, not a 406", %{conn: conn} do
    # The guard has to run BEFORE the browser pipeline's `accepts ["html"]`,
    # or content negotiation rejects the request first and a JSON client sees
    # 406 Not Acceptable where it used to see a plain 404.
    resp =
      conn
      |> put_req_header("accept", "application/json")
      |> get("/api/v1/bogus")

    assert resp.status == 404
    assert resp.resp_body =~ "not_found"
  end

  test "a sub-path of a non-SPA route 404s instead of mounting the shell", %{conn: conn} do
    # `get "/metrics"` matches only the exact path, so /metrics/anything used to
    # fall through the catch-all and answer with the SPA shell and a 200.
    # (/uplinks/* and, in dev/test, /dashboard/* are matched by their own
    # earlier routes, so they never reach the catch-all either way.)
    resp = get(conn, "/metrics/anything")
    assert resp.status == 404
    refute resp.resp_body =~ ~s(<div id="react-app">)
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
