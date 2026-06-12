# Handoff: user-entered gateway install date (app.buoy.fish → map.buoy.fish)

**Date:** 2026-06-11 · **Author:** prior Claude session (context full)
**Focus:** Add a real, operator-entered install date to gateways in app.buoy.fish (wizard + edit modal), expose it on the public API, and have the map.buoy.fish gateway tooltip read it instead of today's `inserted_at` proxy.

## Why

The coverage-map gateway tooltip (map.buoy.fish) shows an **INSTALLED** row. Today it's sourced from `installed_at` on `GET https://app.buoy.fish/api/gateways/public`, which app.buoy.fish serializes as `g.inserted_at` — the time the gateway record was **added to the software platform** (see comment in `lib/cargo_elixir_web/controllers/gateway_controller.ex`, `public_index/2`). Jameson's call: that's misleading — several gateways were physically installed ~a year before they were registered in the platform. He wants a **user-entered install date**, captured during the add-gateway wizard flow (and editable later), consumed by the map.

## What already shipped (don't redo)

This sprint's merged PRs — read them for the established patterns:

- mappers#11 — mobile fixes + gateway tooltip (hover/click desktop, long-press mobile)
- mappers#12 — gateway identity lookup: slot GWIDs + normalized-name matching
- app.buoy.fish#161 — public API exposes `helium_pubkey`, `helium_animal_name`, `mesh_relay_id`
- mappers#13 — mapper matches pubkey / animal name / mesh-relay 8-hex suffix
- mappers#14 — floating light/dark satellite toggle + mobile legend contrast
- app.buoy.fish#162 — public API exposes `installed_at` (= `inserted_at` proxy)
- mappers#15 — tooltip shows INSTALLED, dropped EUI/concentrator rows

Both repos auto-deploy to prod on push to `main` (mappers: `.github/workflows/deploy.yml`; app.buoy.fish: `deploy` job in `.github/workflows/ci.yml`). All of the above is live.

## The work

### 1. app.buoy.fish — new column + wizard/edit UI

- **Repo:** `/Users/jt/buoy/app.buoy.fish` (Phoenix, module prefix `CargoElixir`). ⚠️ The main checkout sits on someone's active `billing/*` branch — do NOT touch it. Create a git worktree off `origin/main` under `.claude/worktrees/` (pattern used twice this sprint).
- **Migration:** add `installed_on :date` (nullable) to `gateways`. A calendar date, not a timestamp — operators remember "April 2025", not an instant. Schema: `lib/cargo_elixir/gateways/gateway.ex` (add to fields + changeset cast; no `validate_required`).
- **Wizard + edit modal:** the schema comments name the UI surfaces: **AddGatewayWizard** and the **Edit Gateway modal** (search `assets/js` — React + Tailwind + lucide-react, i18n via `t()`). Add an optional date input ("When was this gateway physically installed?"). Existing gateways get backfilled by operators via the edit modal.
- **Public API:** `public_index/2` in `lib/cargo_elixir_web/controllers/gateway_controller.ex` currently has `installed_at: g.inserted_at`. **Decision for the next session (recommendation):** serialize `installed_at: g.installed_on || g.inserted_at` — real date when entered, registration-time proxy otherwise — so the map needs zero changes and the row never disappears. If Jameson prefers honesty over coverage, drop the fallback and only show when entered; confirm with him.
- **Tests:** extend `test/cargo_elixir_web/controllers/gateway_public_index_test.exs` (added this sprint; fixture helper `create_gateway!/1` is in it). Changeset-level test for the new field too.

### 2. map.buoy.fish — likely zero/tiny change

- The tooltip (`assets/js/components/GatewayTooltip.js`, `installedLabel/1`) already renders `installed_at` from feature properties, nil-tolerant; `Mappers.Gateways.from_inventory/1` already passes it through. If the API keeps the key name `installed_at`, nothing changes. If a date-only string flows through (`"2025-04-02"`), `parseISO` handles it.
- Mapper repo worktree (still on disk, reusable): `/Users/jt/buoy/map.buoy.fish/.claude/worktrees/mobile-fixes-gateway-tooltip`. Branch new work off `origin/main`.

## Environment gotchas (hard-won this sprint)

- **app.buoy.fish toolchain:** Homebrew Elixir 1.18.4/OTP 28 FAILS to compile this repo (regex refs in module attributes + the Module.ParallelChecker bug noted in `.tool-versions`). Neither asdf nor mise is installed. **Use `nix develop --command mix <task>`** (nix at `/nix/var/nix/profiles/default/bin/nix`; flake gives Elixir 1.18.4 on OTP 27, which works). If beam-chunk errors appear after a mixed-toolchain attempt, `rm -rf _build` in the worktree.
- **map.buoy.fish CSS trap:** the page only links `css/app.css`; GL-library CSS imported in JS lands in `js/app.css` which is never served — any maplibre/mapbox UI element needs self-contained rules in `assets/css/app.css` (see `.gateway-popup` block). Recorded in project memory.
- **Local mapper verification recipe:** dev DB `mappers_dev` is a prod snapshot (June 2); run a stand-in inventory server on `:4000` serving `/api/gateways/public` JSON (the gateway controller's `APP_BUOY_URL` defaults to `http://localhost:4000`), Phoenix on `PORT=4003`, browser via playwright-core + `channel: 'chrome'` (no browser download). Scripts from this sprint are in `/tmp/pwtest/`.
- **Prod:** reachable as `ssh app.buoy.fish` but per standing preference draft prod commands for Jameson rather than running them — CI deploys cover the normal path anyway.
- Repo conventions: PR per slice, merge-commit (not squash), `git branch --show-current` before committing, TDD for backend slices (UI-only slices: note that TDD is impractical and verify in-browser instead).

## Suggested skills

- `tdd` — for the app.buoy.fish migration/schema/API slices (test infra: `CargoElixirWeb.ConnCase`, `CargoElixir.DataCase`).
- `frontend-design:frontend-design` — for the wizard/edit-modal date input, matching app.buoy.fish's existing form language.
- `verify` — runtime verification of the wizard flow and the end-to-end tooltip read.
- `handoff` — if context fills again mid-feature.

## Definition of done

1. Operator can enter/edit an install date in the AddGatewayWizard and Edit Gateway modal.
2. `GET /api/gateways/public` serves the operator-entered date (fallback behavior per Jameson's call).
3. map.buoy.fish tooltip's INSTALLED row reflects it (e.g. El Tavo Mtn should show its real ~2025 install date once backfilled, not "April 13, 2026").
4. Tests green in both repos; both deployed via merge to main; prod tooltip spot-checked (click a gateway marker with gateways layer on).
