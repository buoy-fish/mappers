defmodule MappersWeb.Plug.ReservedPaths do
  @moduledoc """
  404s any request whose first path segment belongs to a non-SPA prefix
  (`MappersWeb.DeepLink.reserved_segments/0`).

  Piped ONLY in front of the project deep-link catch-all at the bottom of the
  router, which has the shape `/:project/*flags` and would otherwise answer a
  typo'd `/api/...` — or any `/metrics/<anything>` — with the HTML shell and a
  200.

  Why a plug rather than a check inside `PageController`: it has to run BEFORE
  the `:browser` pipeline's `accepts ["html"]`. A JSON client hitting an
  unmatched API path was getting `406 Not Acceptable` from content negotiation
  before the controller was ever reached; a 404 is the answer that actually
  tells them what's wrong.

  Answers in the caller's dialect — JSON when they asked for JSON, plain text
  otherwise — deliberately without rendering a view, since the point is to
  respond before format negotiation has happened.
  """

  import Plug.Conn

  @behaviour Plug

  @impl true
  def init(opts), do: opts

  @impl true
  def call(%Plug.Conn{path_info: path_info} = conn, _opts) do
    if MappersWeb.DeepLink.reserved_path?(path_info) do
      conn |> not_found() |> halt()
    else
      conn
    end
  end

  defp not_found(conn) do
    if wants_json?(conn) do
      conn
      |> put_resp_content_type("application/json")
      |> send_resp(404, ~s({"error":"not_found"}))
    else
      conn
      |> put_resp_content_type("text/plain")
      |> send_resp(404, "Not Found")
    end
  end

  defp wants_json?(conn) do
    conn
    |> get_req_header("accept")
    |> Enum.any?(&String.contains?(&1, "json"))
  end
end
