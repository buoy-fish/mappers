defmodule Mappers.Coverage.ScopeTest do
  # Non-async: drives Inventory instances through the stub client's global
  # :inventory_stub_response application env.
  use Mappers.DataCase

  import Mappers.Test.CoverageFixtures, only: [insert_hex!: 1, hear_in_hex!: 2]

  alias Mappers.Coverage.Scope
  alias Mappers.Gateways.Inventory

  setup do
    on_exit(fn -> Application.delete_env(:mappers, :inventory_stub_response) end)
    :ok
  end

  defp start_pair!(opts \\ []) do
    suffix = System.unique_integer([:positive])
    inv = :"scope_test_inventory_#{suffix}"
    scope = :"scope_test_scope_#{suffix}"

    start_supervised!({Inventory, name: inv})
    start_supervised!({Scope, Keyword.merge([name: scope, inventory: inv], opts)})

    {inv, scope}
  end

  defp stub_inventory!(inv, gateways) do
    Application.put_env(:mappers, :inventory_stub_response, {:ok, gateways})
    Inventory.refresh(inv)
  end

  defp feed do
    [
      # Explicitly permanent; heard under its slot GWID.
      %{
        "gateway_eui" => "AC1F09FFFE000001",
        "slot1_gwid" => "0016C001F1399E45",
        "name" => "Harbor Master",
        "location_phase" => "permanent"
      },
      # Missing location_phase = fail-open permanent; heard as a relay.
      %{"gateway_eui" => "BBBB0000000000B1", "name" => "Relay Ridge"},
      # Only associable by operator name (no stream IDs in the inventory).
      %{"gateway_eui" => "CCCC0000000000C1", "name" => "bahia-tortuga-town"},
      # Mesh relay, canonicalized by 8-hex suffix of 16-char stream IDs.
      %{"gateway_eui" => "DDDD0000000000D1", "name" => "Mesh Point", "mesh_relay_id" => "0a1b2c3d"},
      # Bench gateway: must NOT contribute to the permanent set.
      %{
        "gateway_eui" => "ECECECECECECECEC",
        "name" => "Costa Rica Indoor 1",
        "location_phase" => "bench_test"
      }
    ]
  end

  defp seed_hexes! do
    insert_hex!("8948469b0b1ffff")
    insert_hex!("8948469b0b3ffff")
    insert_hex!("8948469b0b5ffff")
    insert_hex!("8948469b0b7ffff")
    insert_hex!("8948469b0b9ffff")
    insert_hex!("8948469b0bbffff")

    # (1) gateway_id match, case-insensitive, via the slot GWID.
    hear_in_hex!("8948469b0b1ffff", %{gateway_id: "0016c001f1399e45"})
    # (2) relay_gateway_id match against the (nil-phase) gateway's EUI.
    hear_in_hex!("8948469b0b3ffff", %{gateway_id: "SOMEOTHERSTREAM1", relay_gateway_id: "bbbb0000000000b1"})
    # (3) two-phase normalized hotspot_name match.
    hear_in_hex!("8948469b0b5ffff", %{gateway_id: "646cb99320d8e64b", hotspot_name: "Bahia Tortuga Town"})
    # (4) 16-char mesh-suffix match.
    hear_in_hex!("8948469b0b7ffff", %{gateway_id: "AB12CD340A1B2C3D"})
    # Bench-only hex: heard exclusively by the bench gateway.
    hear_in_hex!("8948469b0b9ffff", %{gateway_id: "ecececececececec"})
    # Suffix decoy: not 16 chars, must not match the mesh relay.
    hear_in_hex!("8948469b0bbffff", %{gateway_id: "notsixteenchars0a1b2c3d"})

    # Device-GPS-only hex: its only contributor is the "device_only"
    # placeholder Ingest.Validate synthesizes when an uplink has no usable
    # rxInfo. No gateway heard it, but it is real device coverage — it stays
    # in the permanent (default) scope.
    insert_hex!("8948469b0c1ffff")
    hear_in_hex!("8948469b0c1ffff", %{hotspot_address: "device_only", hotspot_name: "device_only"})
  end

  test "permanent_hex_ids/1 covers all four identity-match dimensions and excludes bench-only hexes" do
    {inv, scope} = start_pair!()
    seed_hexes!()
    stub_inventory!(inv, feed())

    assert {:ok, ids} = Scope.permanent_hex_ids(scope)

    assert ids ==
             MapSet.new([
               "8948469b0b1ffff",
               "8948469b0b3ffff",
               "8948469b0b5ffff",
               "8948469b0b7ffff",
               "8948469b0c1ffff"
             ])
  end

  test "permanent_hex_ids/1 memoizes for scope_cache_ms" do
    {inv, scope} = start_pair!(cache_ms: 60_000)
    seed_hexes!()
    stub_inventory!(inv, feed())

    assert {:ok, ids} = Scope.permanent_hex_ids(scope)

    # A hex heard by a permanent gateway AFTER the compute is not visible until
    # the memo expires (or is reset).
    insert_hex!("8948469b0bdffff")
    hear_in_hex!("8948469b0bdffff", %{gateway_id: "0016c001f1399e45"})

    assert {:ok, ^ids} = Scope.permanent_hex_ids(scope)

    Scope.reset(scope)
    assert {:ok, new_ids} = Scope.permanent_hex_ids(scope)
    assert MapSet.member?(new_ids, "8948469b0bdffff")
  end

  test "an expired memo falls back to the stale set when the inventory goes away" do
    {inv, scope} = start_pair!(cache_ms: 0)
    seed_hexes!()
    stub_inventory!(inv, feed())

    assert {:ok, ids} = Scope.permanent_hex_ids(scope)

    # Inventory becomes unavailable and the (0ms) memo is already expired:
    # the stale set keeps serving.
    Inventory.reset(inv)
    assert {:ok, ^ids} = Scope.permanent_hex_ids(scope)
  end

  test "permanent_hex_ids/1 is :unavailable when the inventory never loaded" do
    {_inv, scope} = start_pair!()

    assert Scope.permanent_hex_ids(scope) == :unavailable
  end

  test "callers fail open (unscoped) when the Scope process is unreachable" do
    dead = :scope_test_never_started

    assert Scope.permanent_hex_ids(dead) == :unavailable
    assert Scope.classify_hotspots([%{"gateway_id" => "0016c001f1399e45"}], dead) == :unknown

    rows = [%{id: "8948469b0b1ffff"}]
    assert Scope.filter_rows(rows, :permanent, & &1.id, dead) == rows
    assert Scope.filter_rows(rows, :other, & &1.id, dead) == rows
  end

  describe "classify_hotspots/2" do
    test "true when any hotspot matches a permanent gateway identity" do
      {inv, scope} = start_pair!()
      stub_inventory!(inv, feed())

      assert Scope.classify_hotspots(
               [%{"name" => "unknown", "gateway_id" => "0016C001F1399E45"}],
               scope
             ) == true

      assert Scope.classify_hotspots(
               [%{"name" => "unknown", "gateway_id" => "x", "relay_gateway_id" => "BBBB0000000000B1"}],
               scope
             ) == true

      assert Scope.classify_hotspots(
               [%{"name" => "Bahia Tortuga Town", "gateway_id" => "646cb99320d8e64b"}],
               scope
             ) == true

      assert Scope.classify_hotspots(
               [%{"name" => "unknown", "gateway_id" => "ab12cd340a1b2c3d"}],
               scope
             ) == true
    end

    test "true for the device_only placeholder (device-GPS-only coverage is permanent)" do
      {inv, scope} = start_pair!()
      stub_inventory!(inv, feed())

      assert Scope.classify_hotspots(
               [%{"id" => "device_only", "name" => "device_only"}],
               scope
             ) == true
    end

    test "false when no hotspot matches (bench gateways included)" do
      {inv, scope} = start_pair!()
      stub_inventory!(inv, feed())

      assert Scope.classify_hotspots(
               [%{"name" => "Costa Rica Indoor 1", "gateway_id" => "ecececececececec"}],
               scope
             ) == false

      assert Scope.classify_hotspots([], scope) == false
    end

    test ":unknown when the inventory never loaded" do
      {_inv, scope} = start_pair!()

      assert Scope.classify_hotspots([%{"gateway_id" => "0016c001f1399e45"}], scope) == :unknown
    end
  end
end
