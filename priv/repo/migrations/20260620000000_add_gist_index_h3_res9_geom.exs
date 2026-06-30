defmodule Mappers.Repo.Migrations.AddGistIndexH3Res9Geom do
  use Ecto.Migration

  # Spatial index backing Coverage.count_pings_near/2 (ST_DWithin on
  # h3_res9.geom). Idempotent so it's a no-op if a prior tile/Martin setup
  # already created a GIST index on this column.
  def up do
    execute("CREATE INDEX IF NOT EXISTS h3_res9_geom_gist ON h3_res9 USING GIST (geom)")
  end

  def down do
    execute("DROP INDEX IF EXISTS h3_res9_geom_gist")
  end
end
