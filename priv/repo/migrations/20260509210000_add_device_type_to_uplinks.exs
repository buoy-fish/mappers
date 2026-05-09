defmodule Mappers.Repo.Migrations.AddDeviceTypeToUplinks do
  use Ecto.Migration

  @moduledoc """
  Add `device_type` to `uplinks` so the mapper can render the operator's
  classification of the device (e.g. "Buoy → El Tavo Mtn") rather than
  the generic "Device →" label in the InfoPane.

  Nullable: ChirpStack doesn't carry this concept and historical uplinks
  pre-date the field. The forwarder on app.buoy.fish injects `device_type`
  per-uplink from its own device inventory; absent values fall back to
  "Device" in the UI.
  """

  def change do
    alter table(:uplinks) do
      add :device_type, :string
    end
  end
end
