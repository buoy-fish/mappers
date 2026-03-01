#!/bin/bash
# Setup infrastructure for Buoy.Fish Coverage Mapper (map.buoy.fish)
#
# This script sets up a DEDICATED SERVER for the coverage mapper service.
# It is designed to run on a fresh EC2 instance separate from the main app.
#
# It sets up:
# 1. Local PostgreSQL with PostGIS for the mappers database
# 2. Martin vector tile server
# 3. Nginx config for map.buoy.fish
# 4. Systemd services for mapper app and Martin
# 5. SSL certificate via Certbot
#
# Run this ON THE MAPPER SERVER (not the main app server) as ubuntu user.
#
# Prerequisites:
#   - DNS A record for map.buoy.fish pointing to this server's IP
#   - The mappers code deployed to /home/ubuntu/map.buoy.fish
#   - Nix installed on the server
#
# Usage:
#   ./setup-mapper-infra.sh

set -e

echo "=========================================="
echo "  Buoy.Fish Coverage Mapper Setup"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAPPER_DIR="/home/ubuntu/map.buoy.fish"
DB_NAME="buoy_mappers"
DB_USER="ubuntu"

# ──────────────────────────────────────────────
# Step 1: Install PostgreSQL + PostGIS
# ──────────────────────────────────────────────
echo "Step 1: PostgreSQL + PostGIS"
echo "──────────────────────────────────────────"

if command -v psql &> /dev/null; then
    echo "  PostgreSQL already installed: $(psql --version)"
else
    echo "  Installing PostgreSQL and PostGIS..."
    sudo apt update
    # Detect installed PostgreSQL version and install matching PostGIS package
    PG_VERSION=$(apt-cache search 'postgresql-[0-9]+-postgis' | head -1 | grep -oP 'postgresql-\K[0-9]+' | head -1)
    PG_VERSION=${PG_VERSION:-16}
    echo "  Detected PostgreSQL version: ${PG_VERSION}"
    sudo apt install -y postgresql postgresql-contrib postgis "postgresql-${PG_VERSION}-postgis-3"
    echo "  ✓ PostgreSQL installed"
fi

# Ensure PostgreSQL is running
sudo systemctl enable postgresql
sudo systemctl start postgresql
echo "  ✓ PostgreSQL service running"

# Create database user (idempotent)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
    sudo -u postgres createuser -s "${DB_USER}"
echo "  ✓ Database user '${DB_USER}' exists"

# Create database (idempotent)
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo "  ✓ Database '${DB_NAME}' already exists"
else
    sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
    echo "  ✓ Database '${DB_NAME}' created"
fi

# Enable PostGIS extension
sudo -u postgres psql "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS postgis;" 2>/dev/null
echo "  ✓ PostGIS extension enabled"

echo ""

# ──────────────────────────────────────────────
# Step 2: Install Martin
# ──────────────────────────────────────────────
echo "Step 2: Martin Vector Tile Server"
echo "──────────────────────────────────────────"

if command -v martin &> /dev/null || [ -f /usr/local/bin/martin ]; then
    echo "  Martin already installed"
else
    echo "  Downloading Martin..."
    MARTIN_VERSION="v0.14.2"
    MARTIN_URL="https://github.com/maplibre/martin/releases/download/${MARTIN_VERSION}/martin-x86_64-unknown-linux-gnu.tar.gz"
    
    wget -q "${MARTIN_URL}" -O /tmp/martin.tar.gz
    tar xzf /tmp/martin.tar.gz -C /tmp/
    sudo mv /tmp/martin /usr/local/bin/martin
    sudo chmod +x /usr/local/bin/martin
    rm -f /tmp/martin.tar.gz
    echo "  ✓ Martin installed to /usr/local/bin/martin"
fi

echo ""

# ──────────────────────────────────────────────
# Step 3: Install systemd services
# ──────────────────────────────────────────────
echo "Step 3: Systemd Services"
echo "──────────────────────────────────────────"

# Martin service
sudo cp "${SCRIPT_DIR}/martin.service" /etc/systemd/system/martin.service
sudo systemctl daemon-reload
sudo systemctl enable martin
echo "  ✓ Martin service installed"

# Mapper service
sudo cp "${SCRIPT_DIR}/buoy_mapper.service" /etc/systemd/system/buoy_mapper.service
sudo systemctl daemon-reload
sudo systemctl enable buoy_mapper
echo "  ✓ Mapper service installed"

echo ""

# ──────────────────────────────────────────────
# Step 4: Nginx configuration
# ──────────────────────────────────────────────
echo "Step 4: Nginx Configuration"
echo "──────────────────────────────────────────"

NGINX_CONF="/etc/nginx/sites-available/map-buoy-fish"
if [ -f "${NGINX_CONF}" ]; then
    echo "  Nginx config already exists, backing up..."
    sudo cp "${NGINX_CONF}" "${NGINX_CONF}.bak"
fi

sudo cp "${SCRIPT_DIR}/nginx-map-buoy-fish.conf" "${NGINX_CONF}"
sudo ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/map-buoy-fish

# Test nginx config
if sudo nginx -t 2>/dev/null; then
    echo "  ✓ Nginx config is valid"
else
    echo "  ⚠ Nginx config test failed (SSL certs may not exist yet)"
    echo "    Run: sudo certbot --nginx -d map.buoy.fish"
fi

echo ""

# ──────────────────────────────────────────────
# Step 5: SSL Certificate
# ──────────────────────────────────────────────
echo "Step 5: SSL Certificate"
echo "──────────────────────────────────────────"

if [ -f "/etc/letsencrypt/live/map.buoy.fish/fullchain.pem" ]; then
    echo "  ✓ SSL certificate already exists for map.buoy.fish"
else
    echo "  Requesting SSL certificate..."
    echo "  Make sure DNS A record for map.buoy.fish points to this server."
    echo ""
    read -p "  Continue with Certbot? (yes/no): " CERT_CONFIRM
    if [ "$CERT_CONFIRM" = "yes" ]; then
        # Use webroot method to avoid chicken-and-egg with nginx SSL config.
        # The full SSL nginx config references the cert that doesn't exist yet,
        # so we temporarily swap in an HTTP-only config for the ACME challenge.
        echo "  Setting up temporary HTTP-only config for ACME challenge..."
        sudo rm -f /etc/nginx/sites-enabled/map-buoy-fish
        sudo tee /etc/nginx/sites-enabled/map-buoy-fish-temp > /dev/null << 'TMPCONF'
server {
    listen 80;
    listen [::]:80;
    server_name map.buoy.fish;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 503 "Setting up..."; }
}
TMPCONF
        sudo mkdir -p /var/www/certbot
        sudo nginx -t && sudo systemctl reload nginx

        # Obtain the certificate via webroot
        sudo certbot certonly --webroot -w /var/www/certbot -d map.buoy.fish

        # Swap back to the real SSL config
        sudo rm -f /etc/nginx/sites-enabled/map-buoy-fish-temp
        sudo ln -sf /etc/nginx/sites-available/map-buoy-fish /etc/nginx/sites-enabled/map-buoy-fish
        sudo nginx -t && sudo systemctl reload nginx

        echo "  ✓ SSL certificate obtained and nginx config restored"
    else
        echo "  ⚠ Skipping SSL - run manually:"
        echo "    sudo certbot certonly --webroot -w /var/www/certbot -d map.buoy.fish"
    fi
fi

echo ""

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo "=========================================="
echo "  Setup Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Deploy mapper code to ${MAPPER_DIR}"
echo "  2. Create ${MAPPER_DIR}/.env with:"
echo "     DATABASE_URL=postgresql://${DB_USER}@localhost/${DB_NAME}"
echo "     HOST=map.buoy.fish"
echo "     PORT=4001"
echo "     SECRET_KEY_BASE=<generate with mix phx.gen.secret>"
echo "     # No API key needed — MapLibre GL with CARTO basemap"
echo "  3. Run migrations: cd ${MAPPER_DIR} && mix ecto.setup"
echo "  4. Start services:"
echo "     sudo systemctl start martin"
echo "     sudo systemctl start buoy_mapper"
echo "     sudo systemctl reload nginx"
echo "  5. Verify at https://map.buoy.fish"
echo ""
