# Mapper Deployment

The canonical infrastructure configs for `map.buoy.fish` live in the **app.buoy.fish** repo:

    https://github.com/buoy-fish/app.buoy.fish  (deploy/ directory)

Files managed there:
- `nginx-map-buoy-fish.conf` — nginx reverse proxy for map.buoy.fish
- `buoy_mapper.service` — systemd unit for the Phoenix mapper app
- `martin.service` — systemd unit for the Martin vector tile server
- `setup-mapper-infra.sh` — one-time server provisioning (PostgreSQL, Martin, SSL)
- `deploy-mapper-to-production.sh` — manual SSH-based deploy script

## Automated deployment

Pushing to `main` in this repo triggers `.github/workflows/deploy.yml`, which:
1. SSHs to the production server
2. Pulls the latest mapper code
3. Installs deps, builds assets, migrates, compiles
4. Syncs infra configs from `/home/ubuntu/app.buoy.fish/deploy/` (if available)
5. Restarts `buoy_mapper` and `martin` services

## First-time setup

See `setup-mapper-infra.sh` in the app.buoy.fish repo. Quick summary:

```bash
ssh ubuntu@app.buoy.fish
cd /home/ubuntu/app.buoy.fish
./deploy/setup-mapper-infra.sh --yes
```
