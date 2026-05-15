defmodule MappersWeb.Router do
  use MappersWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_flash
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug MappersWeb.Plug.RateLimit, ["browser_actions", 60]
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug MappersWeb.Plug.RateLimit, ["api_actions", 300]
  end

  # Public ingest pipeline. Same per-IP rate limit envelope as :api for
  # unauthenticated callers, but `IngestAuth` lets known forwarders
  # (app.buoy.fish, mix mappers.backfill_buoy) flag themselves as trusted
  # by sending `Authorization: Bearer <MAP_INGEST_SECRET>` — `RateLimit`
  # then bypasses entirely. This keeps the endpoint open to community
  # mappers per CLAUDE.md while letting our own services post at line
  # rate without 429s.
  pipeline :ingest_api do
    plug :accepts, ["json"]
    plug MappersWeb.Plug.IngestAuth
    plug MappersWeb.Plug.RateLimit, ["ingest_actions", 600]
  end

  pipeline :admin_api do
    plug :accepts, ["json"]
    plug MappersWeb.Plug.RateLimit, ["admin_actions", 60]
    plug MappersWeb.Plug.AdminAuth
  end

  pipeline :allow_cors do
    plug Corsica, origins: "*"
  end

  scope "/", MappersWeb do
    pipe_through :browser

    get "/", PageController, :index
    get "/uplinks/*path", PageController, :index
    get "/metrics", PrometheusController, :scrape
  end

  # Ingest endpoint: separate pipeline so trusted forwarders can bypass
  # the per-IP rate limiter that protects browser-facing reads.
  scope "/api/v1", MappersWeb do
    pipe_through :ingest_api

    post "/ingest/uplink", API.V1.IngestUplinkController, :create
  end

  scope "/api/v1", MappersWeb do
    pipe_through :api

    get "/uplinks/hex/:h3_index", API.V1.UplinkController, :get_uplinks
    get "/hexes", API.V1.HexController, :index
    get "/gateways", API.V1.GatewayController, :index
  end

  scope "/api/v1", MappersWeb do
    pipe_through :api
    pipe_through :allow_cors

    get "/coverage/geo/:coords", API.V1.CoverageController, :get_coverage_from_geo
  end

  scope "/api/v1/admin", MappersWeb do
    pipe_through :admin_api

    delete "/gateways/:gateway_id/coverage",
           API.V1.Admin.GatewayCoverageController,
           :delete
  end

  # Enables LiveDashboard only for development
  #
  # If you want to use the LiveDashboard in production, you should put
  # it behind authentication and allow only admins to access it.
  # If your application does not have an admins-only section yet,
  # you can use Plug.BasicAuth to set up some basic authentication
  # as long as you are also using SSL (which you should anyway).
  if Mix.env() in [:dev, :test] do
    import Phoenix.LiveDashboard.Router

    scope "/" do
      pipe_through :browser
      live_dashboard "/dashboard", metrics: MappersWeb.Telemetry
    end
  end
end
