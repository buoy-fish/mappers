defmodule Mappers.Repo.Migrations.RenameGatewayEuiToGatewayId do
  use Ecto.Migration

  @moduledoc """
  Rename `uplinks_heard.gateway_eui` and `relay_gateway_eui` columns to
  `gateway_id` and `relay_gateway_id`.

  The columns store the LoRa stream identifier the gateway emits in
  `rxInfo.gatewayId` (slot1 concentrator GWID for our forwarders, the
  HPR-derived 8-byte ID for Helium gateways), not the hardware MAC EUI.
  The misnamed column has caused repeated misreads; aligning the
  identifier name with what the value actually is.

  The hardware EUI lives only in the upstream `app.buoy.fish` gateway
  inventory and continues to be called `gateway_eui` there, where it is
  semantically correct.
  """

  def up do
    rename table(:uplinks_heard), :gateway_eui, to: :gateway_id
    rename table(:uplinks_heard), :relay_gateway_eui, to: :relay_gateway_id
    execute "ALTER INDEX uplinks_heard_gateway_eui_timestamp_index RENAME TO uplinks_heard_gateway_id_timestamp_index"
  end

  def down do
    execute "ALTER INDEX uplinks_heard_gateway_id_timestamp_index RENAME TO uplinks_heard_gateway_eui_timestamp_index"
    rename table(:uplinks_heard), :relay_gateway_id, to: :relay_gateway_eui
    rename table(:uplinks_heard), :gateway_id, to: :gateway_eui
  end
end
