defmodule MappersWeb.API.V1.TimelineController do
  use MappersWeb, :controller

  alias Mappers.Repo
  alias Mappers.H3.Res9

  import Ecto.Query

  @doc """
  Serves the full all-time hex set as a COMPACT JSON array (not GeoJSON).

  Each element is `%{"h" => id, "t" => first_seen_epoch_ms, "r" => best_rssi}`.
  The client filters by time range locally; the server just dumps every row.
  Same per-row cost as `/api/v1/hexes` — a flat select of three columns, no
  geom loaded.
  """
  def index(conn, _params) do
    # Exclude first_seen IS NULL: a hex with no known first-seen can't take part
    # in a time reveal, and DateTime.to_unix(nil, _) would crash. After the
    # Slice-2 backfill runs no rows are NULL in practice; this only hides hexes
    # in the brief window between migrate and backfill.
    rows =
      Repo.all(
        from r in Res9,
          where: not is_nil(r.first_seen),
          select: %{id: r.id, first_seen: r.first_seen, best_rssi: r.best_rssi}
      )
      |> Enum.map(fn row ->
        %{
          h: row.id,
          t: DateTime.to_unix(row.first_seen, :millisecond),
          r: row.best_rssi
        }
      end)

    json(conn, rows)
  end
end
