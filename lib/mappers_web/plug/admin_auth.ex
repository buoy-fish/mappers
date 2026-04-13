defmodule MappersWeb.Plug.AdminAuth do
  @moduledoc """
  Shared-secret auth for admin endpoints. Expects `x-mappers-admin-token`
  header to match `Application.get_env(:mappers, :admin_token)`.

  Refuses the request if the server-side token is unset (defense in depth —
  admin routes must never be accidentally unauthenticated).
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    expected = Application.get_env(:mappers, :admin_token)
    provided = conn |> get_req_header("x-mappers-admin-token") |> List.first()

    cond do
      is_nil(expected) or expected == "" ->
        conn
        |> send_resp(:internal_server_error, ~s({"error":"admin_token_not_configured"}))
        |> halt()

      provided == expected ->
        conn

      true ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(:unauthorized, ~s({"error":"invalid_admin_token"}))
        |> halt()
    end
  end
end
