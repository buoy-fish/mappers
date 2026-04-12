defmodule Mappers.Repo.Migrations.AddRelayGatewayEuiToUplinksHeard do
  use Ecto.Migration

  def change do
    alter table(:uplinks_heard) do
      add :relay_gateway_eui, :string
    end
  end
end
