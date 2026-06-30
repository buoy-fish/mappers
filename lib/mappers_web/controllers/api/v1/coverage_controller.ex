defmodule MappersWeb.API.V1.CoverageController do
  use MappersWeb, :controller

  alias Mappers.Coverage

  def get_coverage_from_geo(conn, %{"coords" => coords}) do
    resp = Coverage.get_coverage_from_geo(coords)

    case resp do
      %{error: _error} -> Plug.Conn.put_status(conn, 400)
      _ -> Plug.Conn.put_status(conn, 200)
    end
    |> json(resp)
  end

  # Running total of device pings near a point — backs the project info card's
  # "Pings collected" stat. Counts geographically since uplinks aren't tagged
  # with a project. See Coverage.count_pings_near/2.
  def count_pings_near(conn, %{"coords" => coords}) do
    resp = Coverage.count_pings_near(coords)

    case resp do
      %{error: _error} -> Plug.Conn.put_status(conn, 400)
      _ -> Plug.Conn.put_status(conn, 200)
    end
    |> json(resp)
  end
end
