defmodule Mappers.Timeline.BackfillTest do
  use Mappers.DataCase

  alias Mappers.Timeline.Backfill
  alias Mappers.H3.Res9
  alias Mappers.H3.Links.Link
  alias Mappers.Uplinks.Uplink

  # Insert a hex row directly. first_seen is nil by default (the column added in
  # Slice 1 is NULL for all pre-existing rows until this backfill runs).
  defp insert_hex(id, first_seen \\ nil) do
    Repo.insert!(%Res9{
      id: id,
      h3_index_int: :erlang.phash2(id),
      state: "live",
      best_rssi: -90.0,
      snr: 5.0,
      first_seen: first_seen
    })
  end

  defp insert_uplink(first_timestamp) do
    {:ok, uplink} =
      %Uplink{}
      |> Uplink.changeset(%{
        dev_eui: "0000000000000001",
        app_eui: "0000000000000002",
        device_id: "dev-1",
        fcnt: 1,
        frequency: 904.5,
        spreading_factor: "SF7BW125",
        altitude: 0,
        gps_accuracy: 1.0,
        first_timestamp: first_timestamp
      })
      |> Repo.insert()

    uplink
  end

  defp link(uplink, hex_id) do
    {:ok, _} =
      %Link{}
      |> Link.changeset(%{uplink_id: uplink.id, h3_res9_id: hex_id})
      |> Repo.insert()

    :ok
  end

  defp ts(iso), do: DateTime.from_iso8601(iso) |> elem(1)

  test "hex with several linked uplinks gets first_seen = MIN(first_timestamp)" do
    hex = insert_hex("hex-min")

    earliest = ts("2026-01-01T00:00:00.000000Z")
    u1 = insert_uplink(ts("2026-03-01T12:00:00.000000Z"))
    u2 = insert_uplink(earliest)
    u3 = insert_uplink(ts("2026-02-15T08:30:00.000000Z"))

    link(u1, hex.id)
    link(u2, hex.id)
    link(u3, hex.id)

    assert {:ok, count} = Backfill.run()
    assert count >= 1

    fetched = Repo.get(Res9, hex.id)
    assert DateTime.compare(fetched.first_seen, earliest) == :eq
  end

  test "hex with NULL first_seen and one linked uplink gets it set" do
    hex = insert_hex("hex-null")
    assert is_nil(Repo.get(Res9, hex.id).first_seen)

    ts0 = ts("2026-04-10T06:00:00.000000Z")
    u = insert_uplink(ts0)
    link(u, hex.id)

    assert {:ok, _} = Backfill.run()

    fetched = Repo.get(Res9, hex.id)
    assert DateTime.compare(fetched.first_seen, ts0) == :eq
  end

  test "re-running the backfill is idempotent and never raises an already-lower value" do
    hex = insert_hex("hex-idem")

    earliest = ts("2026-01-01T00:00:00.000000Z")
    u1 = insert_uplink(earliest)
    u2 = insert_uplink(ts("2026-05-01T00:00:00.000000Z"))
    link(u1, hex.id)
    link(u2, hex.id)

    assert {:ok, _} = Backfill.run()
    first = Repo.get(Res9, hex.id).first_seen
    assert DateTime.compare(first, earliest) == :eq

    # Second run must not change (and must not raise) the already-correct value.
    assert {:ok, _} = Backfill.run()
    second = Repo.get(Res9, hex.id).first_seen
    assert DateTime.compare(second, earliest) == :eq
  end

  test "a value already lower than the computed MIN is preserved (LEAST semantics)" do
    # Simulates live ingest having set an earlier first_seen during the backfill.
    preset = ts("2025-12-01T00:00:00.000000Z")
    hex = insert_hex("hex-preset", preset)

    u = insert_uplink(ts("2026-06-01T00:00:00.000000Z"))
    link(u, hex.id)

    assert {:ok, _} = Backfill.run()

    fetched = Repo.get(Res9, hex.id)
    assert DateTime.compare(fetched.first_seen, preset) == :eq
  end

  test "hex with no linked uplinks stays NULL" do
    hex = insert_hex("hex-orphan")

    assert {:ok, _} = Backfill.run()

    fetched = Repo.get(Res9, hex.id)
    assert is_nil(fetched.first_seen)
  end
end
