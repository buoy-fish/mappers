defmodule Mappers.Repo.Migrations.AddFirstSeenToH3Res9 do
  use Ecto.Migration

  def change do
    alter table(:h3_res9) do
      add :first_seen, :utc_datetime_usec
    end
  end
end
