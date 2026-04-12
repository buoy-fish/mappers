defmodule Mappers.Repo.Migrations.AddGatewayEuiToUplinksHeard do
  use Ecto.Migration

  def change do
    alter table(:uplinks_heard) do
      add :gateway_eui, :string
    end

    create index(:uplinks_heard, [:gateway_eui, :timestamp])
  end
end
