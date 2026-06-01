defmodule Mappers.Timeline.Backfill do
  @moduledoc """
  One-time, idempotent backfill of `h3_res9.first_seen`.

  For each hex, `first_seen` is the over-the-air first-seen instant:

      MIN(uplinks.first_timestamp) over all uplinks linked to that hex via h3_links

  The update is set-based — a single `UPDATE ... FROM (subquery)` — so it scales
  on the large prod table without per-row round-trips.

  ## Idempotency / keep-MIN semantics

  We only lower `first_seen`, never raise it:

      SET first_seen = computed_min
      WHERE first_seen IS NULL OR computed_min < first_seen

  This makes re-runs safe and preserves an earlier value written by live ingest
  while the backfill is running. Hexes with no linked uplinks are left untouched
  (their `first_seen` stays NULL).

  Returns `{:ok, count_updated}`.
  """

  alias Mappers.Repo

  @update_sql """
  UPDATE h3_res9 AS h
  SET first_seen = mins.first_seen
  FROM (
    SELECT l.h3_res9_id AS id, MIN(u.first_timestamp) AS first_seen
    FROM h3_links AS l
    JOIN uplinks AS u ON u.id = l.uplink_id
    GROUP BY l.h3_res9_id
  ) AS mins
  WHERE h.id = mins.id
    AND (h.first_seen IS NULL OR mins.first_seen < h.first_seen)
  """

  @doc """
  Run the backfill. Returns `{:ok, count_updated}` where `count_updated` is the
  number of `h3_res9` rows whose `first_seen` was lowered/set.
  """
  @spec run() :: {:ok, non_neg_integer()}
  def run do
    %Postgrex.Result{num_rows: num_rows} = Repo.query!(@update_sql, [])
    {:ok, num_rows}
  end

  @doc "The exact SQL the backfill executes (for logging / inspection)."
  @spec update_sql() :: String.t()
  def update_sql, do: @update_sql
end
