#!/bin/bash
# BUOY-FISH Coverage Mapper — Development Startup Script
#
# This script:
#   1. Loads .env.development for environment variables
#   2. Ensures dependencies are installed
#   3. Sets up the database (create, migrate)
#   4. Starts the Phoenix server
#
# Usage:
#   ./scripts/dev.sh              # Start development server
#   ./scripts/dev.sh --clean      # Clean build artifacts before starting
#   ./scripts/dev.sh --restart    # Kill running server and restart
#   ./scripts/dev.sh --kill       # Kill running dev services
#   ./scripts/dev.sh --help       # Show help
#
# Requires: Elixir, Node.js, PostgreSQL with PostGIS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT" || exit 1

# Load environment variables early (needed for PORT)
if [ -f ".env.development" ]; then
    set -a
    source .env.development
    set +a
fi

DEV_PORT="${PORT:-4002}"
DEV_DB_HOST="${DB_HOST:-localhost}"
DEV_DB_PORT="${DB_PORT:-5432}"

echo "Starting Buoy.Fish Coverage Mapper (Development)"
echo "==========================================="

# Parse arguments
CLEAN_BUILD=false
RESTART_MODE=false

for arg in "$@"; do
    case $arg in
        --clean)
            CLEAN_BUILD=true
            ;;
        --restart)
            RESTART_MODE=true
            ;;
        --kill)
            echo "Killing development services..."
            pkill -f "mix phx.server" && echo "   Phoenix server killed" || echo "   No Phoenix server running"
            pkill -f "beam.*phx" && echo "   BEAM processes killed" || true
            lsof -ti:"$DEV_PORT" | xargs kill -9 2>/dev/null && echo "   Port $DEV_PORT freed" || true
            echo "   Done"
            exit 0
            ;;
        --help|-h)
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (none)       Start the development server"
            echo "  --clean      Clean build artifacts before starting"
            echo "  --restart    Kill running server, recompile, and restart"
            echo "  --kill       Kill all running dev services"
            echo "  --help, -h   Show this help message"
            echo ""
            echo "What this script does:"
            echo "  1. Loads .env.development (PORT=$DEV_PORT)"
            echo "  2. Installs Elixir + Node deps if missing"
            echo "  3. Creates and migrates database (PostgreSQL + PostGIS)"
            echo "  4. Starts Phoenix server on port $DEV_PORT"
            echo ""
            echo "Environment:"
            echo "  .env.development is included in the repo with sensible defaults."
            echo "  PostgreSQL must be running locally with PostGIS installed."
            echo "  DB config via env vars: DB_HOST=$DEV_DB_HOST DB_PORT=$DEV_DB_PORT (see .env.development)"
            echo "  No API key needed — uses open-source MapLibre GL + CARTO basemap."
            echo ""
            echo "Available at: http://localhost:$DEV_PORT"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "   Use --help for usage information"
            exit 1
            ;;
    esac
done

# Handle restart mode — kill running processes first
if [ "$RESTART_MODE" = true ]; then
    echo ""
    echo "Restart mode: Killing running processes..."
    pkill -f "mix phx.server" && echo "   Phoenix server killed" || echo "   No Phoenix server running"
    pkill -f "beam.*phx" && echo "   BEAM processes killed" || true
    lsof -ti:"$DEV_PORT" | xargs kill -9 2>/dev/null && echo "   Port $DEV_PORT freed" || true
    echo "   Waiting 2 seconds for cleanup..."
    sleep 2
    echo ""
fi

echo ""
echo "   .env.development loaded (PORT=$DEV_PORT, DB=$DEV_DB_HOST:$DEV_DB_PORT)"

# Clean build if requested
if [ "$CLEAN_BUILD" = true ]; then
    echo ""
    echo "Cleaning build artifacts..."
    ./scripts/clean.sh --rebuild
fi

# Install Elixir dependencies if needed
if [ ! -d "deps" ] || [ -z "$(ls -A deps 2>/dev/null)" ]; then
    echo ""
    echo "Fetching Elixir dependencies..."
    mix deps.get
    echo "   Elixir dependencies installed."
fi

# Install frontend dependencies if needed
if [ ! -d "assets/node_modules" ]; then
    echo ""
    echo "Installing frontend dependencies..."
    (cd assets && npm install)
    echo "   Frontend dependencies installed."
fi

# Recompile if in restart mode
if [ "$RESTART_MODE" = true ]; then
    echo ""
    echo "Recompiling application..."
    mix compile --force
    echo "   Recompilation complete."
fi

# Ensure PostgreSQL is running
echo ""
echo "Checking PostgreSQL..."
if pg_isready -h "$DEV_DB_HOST" -p "$DEV_DB_PORT" -q 2>/dev/null; then
    echo "   PostgreSQL is running on $DEV_DB_HOST:$DEV_DB_PORT"
else
    echo "   PostgreSQL is not running. Attempting to start..."

    # Detect installed Homebrew PostgreSQL (prefer newest)
    PG_SERVICE=""
    for ver in 17 16 15 14; do
        if brew list --formula "postgresql@${ver}" &>/dev/null; then
            PG_SERVICE="postgresql@${ver}"
            break
        fi
    done

    if [ -n "$PG_SERVICE" ]; then
        echo "   Found $PG_SERVICE — starting via brew services..."
        brew services start "$PG_SERVICE"

        # Wait for it to accept connections (up to 10 seconds)
        for i in $(seq 1 10); do
            if pg_isready -h "$DEV_DB_HOST" -p "$DEV_DB_PORT" -q 2>/dev/null; then
                echo "   PostgreSQL started successfully."
                break
            fi
            sleep 1
        done

        if ! pg_isready -h "$DEV_DB_HOST" -p "$DEV_DB_PORT" -q 2>/dev/null; then
            echo "   WARNING: PostgreSQL started but not accepting connections on port $DEV_DB_PORT."
            echo "   Check: brew services info $PG_SERVICE"
            echo "   Logs:  /opt/homebrew/var/log/${PG_SERVICE}.log"
            echo ""
            echo "   Starting without database — map will render but data endpoints won't work."
        fi
    else
        echo "   No Homebrew PostgreSQL found."
        echo "   Install with: brew install postgresql@17"
        echo "   Starting without database — map will render but data endpoints won't work."
    fi
fi

# Setup database
echo ""
echo "Setting up database..."
if pg_isready -h "$DEV_DB_HOST" -p "$DEV_DB_PORT" -q 2>/dev/null; then
    mix ecto.create 2>/dev/null || echo "   Database already exists."
    echo "   Running migrations..."
    mix ecto.migrate
    echo "   Database ready."
else
    echo "   Skipping database setup (PostgreSQL not available)."
fi

# Start the Phoenix server
echo ""
echo "Starting Phoenix server..."
echo "==========================================="
echo "   Coverage map: http://localhost:$DEV_PORT"
echo "   Ingest API:   POST http://localhost:$DEV_PORT/api/v1/ingest/uplink"
echo "==========================================="
echo ""

mix phx.server
