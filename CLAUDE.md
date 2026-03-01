# Buoy.Fish Coverage Mapper (map.buoy.fish)

## Git Branch Policy

- Commits directly to `master` are allowed
- For larger changes, feature branches are preferred (e.g., `feature/buoy-fish-branding`)
- Always confirm the current branch before committing: `git branch --show-current`
- Do not force-push to `master`

## Project Overview

Forked from [helium/mappers](https://github.com/helium/mappers). Provides H3 hex-based coverage mapping for the Buoy.Fish IoT ecosystem at `map.buoy.fish`. Devices (buoys, vessel trackers, temp trackers) report uplinks which are visualized as RSSI-colored hexagons on a map.

**Upstream**: `https://github.com/helium/mappers` (remote: `upstream`)
**Fork**: `https://github.com/buoy-fish/mappers` (remote: `origin`)

## Tech Stack

- **Backend**: Elixir/Phoenix 1.7+ (~Elixir 1.14+, OTP 28 compatible)
- **Frontend**: React 17 + MapLibre GL JS 4.x + H3 hexagons (h3-js)
- **Database**: PostgreSQL with PostGIS
- **Tile Server**: Martin (vector tiles from h3_res9 table)
- **Real-time**: Phoenix Channels (WebSocket, `h3:new` topic)
- **Bundler**: esbuild (replaced webpack 4 — zero npm vulnerabilities)
- **Map**: MapLibre GL (open source) with CARTO Dark Matter basemap — no API key needed

## Architecture

```
Device POST /api/v1/ingest/uplink
  --> Ingest module (normalize, validate, H3 indexing)
  --> PostgreSQL (uplinks, uplinks_heard, h3_res9 tables)
  --> Martin reads h3_res9 --> serves vector tiles at /tiles/
  --> React frontend renders tiles via MapLibre GL
  --> Phoenix Channel broadcasts new hexes in real-time
```

## Key Directories

| Path | Purpose |
|------|---------|
| `assets/js/components/` | React components (Map, Layers, InfoPane, WelcomeModal) |
| `assets/css/app.css` | All styles including legend colors |
| `assets/build.mjs` | esbuild config (dev, watch, deploy modes) |
| `lib/mappers/` | Elixir business logic (ingest, H3, uplinks) |
| `lib/mappers_web/` | Phoenix controllers, channels, router, templates |
| `config/` | Elixir config (dev, prod, prod.secret) |
| `deploy/` | Deployment scripts, nginx config, systemd units |
| `priv/repo/migrations/` | Ecto database migrations |

## Color System (Buoy.Fish Orange)

Coverage hex colors are defined in two places:

**`assets/js/components/Layers.js`** — MapLibre GL paint properties:
- RSSI gradient: `rgba(255,152,0, 0.15/0.5/0.85)` (orange, -120 to -80 dBm)
- Outline selected: `rgba(255,152,0, 0.5)`
- Unselected hex: `#b67ffe` (purple)
- Device-to-hotspot lines: `#d8d51d` (yellow)

**`assets/css/app.css`** — Legend CSS:
- `.legend-dBm-low`: `#E65100` (dark orange)
- `.legend-dBm-medium`: `#F57C00` (medium orange)
- `.legend-dBm-high`: `#FF9800` (bright orange)

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/ingest/uplink` | Ingest device uplink (ChirpStack format) |
| `GET` | `/api/v1/uplinks/hex/:h3_index` | Get hotspots that heard a hex |
| `GET` | `/api/v1/coverage/geo/:coords` | Coverage query by coordinates |

The ingest endpoint is open for any service to publish mapping data. The mapper maintains its own database and abstracts locations to H3 hex tiles for public visualization.

## Infrastructure

- **Server**: Dedicated AWS EC2 (t3.medium, us-east-1)
- **Reverse Proxy**: nginx with SSL via certbot (Let's Encrypt)
- **Tile Server**: Martin on port 3000, proxied at `/tiles/`
- **App**: Phoenix on port 4001 (prod), 4002 (dev)
- **Monitoring**: Prometheus node_exporter + blackbox probes from `monitoring.buoy.fish`
- **DNS**: Cloudflare (`map.buoy.fish` A record)

## Deploy Scripts

All in `deploy/`:
- `setup-mapper-infra.sh` — Full server provisioning (PostgreSQL, Martin, nginx, certbot, systemd)
- `nginx-map-buoy-fish.conf` — nginx reverse proxy config
- `buoy_mapper.service` — Systemd unit for Phoenix app
- `martin.service` — Systemd unit for Martin tile server

## Development

### Quick Start
```bash
./scripts/build.sh            # Fetch deps, compile, npm install
./scripts/dev.sh              # Create DB, migrate, start server at :4002
```

### Port Configuration
- Dev default: **4002** (set in `.env.development`, avoids conflict with app.buoy.fish on 4000)
- Prod default: **4001** (set in `.env.production.example`)
- Configurable via `PORT` env var in `.env.development`

### Scripts (in `scripts/`)
- `build.sh` — Fetch Elixir deps, compile, install Node packages (idempotent)
  - `--production` — Also build minified assets via esbuild
  - `--check` — Check if build is needed (exit 0 if ready)
  - `--force` — Force rebuild even if deps appear current
- `dev.sh` — Load .env.development, setup database, start Phoenix server
  - `--clean` — Clean build artifacts before starting
  - `--restart` — Kill running server and restart
  - `--kill` — Kill all running dev services
- `clean.sh` — Remove build artifacts (_build, deps, node_modules)
  - `--rebuild` — Clean then rebuild dependencies
  - `--start` — Clean, rebuild, and start server
  - `--deep-clean` — Full reset including database drop

### Frontend Build (esbuild)
```bash
node assets/build.mjs          # Development build (~200ms)
node assets/build.mjs --watch  # Watch mode (used by Phoenix watcher)
node assets/build.mjs --deploy # Minified production build (~75ms)
```

### Manual Commands
```bash
mix deps.get                  # Fetch Elixir dependencies
mix compile                   # Compile Elixir code
cd assets && npm install      # Install Node.js dependencies
mix ecto.setup                # Create DB + migrate + seed
mix phx.server                # Start dev server (port from PORT env)
```

Requires PostgreSQL with PostGIS running locally. DB config is in `config/dev.exs` (postgres/postgres@localhost/mappers_dev). `.env.development` is committed with sensible defaults. No API key needed — uses open-source MapLibre GL with CARTO basemap.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP port | 4002 (dev), 4001 (prod) |
| `DATABASE_URL` | PostgreSQL connection string | (prod only) |
| `SECRET_KEY_BASE` | Phoenix secret (`mix phx.gen.secret`) | (prod only) |
| `HOST` | Hostname | `map.buoy.fish` (prod) |

## Future: Multi-Hop Relay Visualization

When relay and border gateways are deployed, the mapper will show full hop paths:
End Node --> Relay GW --> Relay GW --> Border GW

This requires:
1. Extracting hop metadata from ChirpStack uplink `rxInfo`
2. New `relay_hops` database table
3. Extended API response with hop chain data
4. New MapLibre layers for multi-hop line rendering (dashed for relay, solid for border)

Status: Awaiting investigation of ChirpStack relay metadata format.
