defmodule Mix.Tasks.Mappers.BackfillFirstSeen do
  @moduledoc """
  One-shot backfill of `h3_res9.first_seen` for historical rows.

  For each hex, computes the over-the-air first-seen instant as
  `MIN(uplinks.first_timestamp)` over all uplinks linked to that hex via
  `h3_links`, and writes it to `h3_res9.first_seen` (NULL until this runs).

  The work is done set-based in a single `UPDATE ... FROM (subquery)` — see
  `Mappers.Timeline.Backfill` — so it scales on the large prod table without
  per-row round-trips.

  Idempotent (keep-MIN): only lowers `first_seen`, never raises it
  (`WHERE first_seen IS NULL OR computed_min < first_seen`). Re-running is safe
  and preserves an earlier value written by live ingest during the run. Hexes
  with no linked uplinks are left as NULL.

  ## Performance note (large prod dataset)

  The grouping subquery scans `h3_links` joined to `uplinks` and aggregates
  `MIN(uplinks.first_timestamp)`. There is no permanent index on
  `uplinks.first_timestamp` (and this one-time task does not add one). On a
  large prod table a DBA may want a temporary index around the run, e.g.:

      CREATE INDEX CONCURRENTLY tmp_uplinks_first_timestamp ON uplinks (first_timestamp);
      -- run the backfill --
      DROP INDEX CONCURRENTLY tmp_uplinks_first_timestamp;

  ## Usage

      mix mappers.backfill_first_seen
  """

  use Mix.Task
  alias Mappers.Timeline.Backfill

  @shortdoc "Backfill h3_res9.first_seen = MIN(uplinks.first_timestamp) via h3_links"

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    Mix.shell().info("Backfilling h3_res9.first_seen (keep-MIN over linked uplinks) ...")
    Mix.shell().info("SQL:\n#{Backfill.update_sql()}")

    {:ok, count} = Backfill.run()

    Mix.shell().info("Done. Updated #{count} h3_res9 row(s).")
  end
end
