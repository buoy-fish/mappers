#!/bin/bash
# BUOY-FISH Coverage Mapper — Cleanup Script
#
# Removes build artifacts and prepares for a fresh build.
# Run this when the Elixir server gets corrupted after dependency or
# architectural changes.
#
# Usage:
#   ./scripts/clean.sh              # Clean only — remove build artifacts (default)
#   ./scripts/clean.sh --rebuild    # Clean and rebuild dependencies
#   ./scripts/clean.sh --start      # Clean, rebuild, and start server
#   ./scripts/clean.sh --deep-clean # Full reset: kill processes, reset database
#   ./scripts/clean.sh --help       # Show help

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
REBUILD=false
START_SERVER=false
DEEP_CLEAN=false

for arg in "$@"; do
    case $arg in
        --rebuild)
            REBUILD=true
            ;;
        --start)
            REBUILD=true
            START_SERVER=true
            ;;
        --deep-clean|--full)
            DEEP_CLEAN=true
            REBUILD=true
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (none)         Clean only — remove build artifacts (default)"
            echo "  --rebuild      Clean and rebuild dependencies"
            echo "  --start        Clean, rebuild, and start Phoenix server"
            echo "  --deep-clean   Full reset: kill processes, clear caches, reset database"
            echo "  --full         Alias for --deep-clean"
            echo "  --help         Show this help message"
            echo ""
            echo "Deep Clean does:"
            echo "  - Kill all running services (Phoenix)"
            echo "  - Reset database (drop and recreate)"
            echo "  - Remove _build, deps, node_modules"
            echo "  - Rebuild everything from scratch"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: $0 [--rebuild] [--start] [--deep-clean] [--help]"
            exit 1
            ;;
    esac
done

echo "Starting cleanup process..."
echo "Project root: $PROJECT_ROOT"

cd "$PROJECT_ROOT" || exit 1

# ==============================================================================
# DEEP CLEAN: Kill processes and clear caches
# ==============================================================================
if [ "$DEEP_CLEAN" = true ]; then
    echo ""
    echo "DEEP CLEAN MODE — Full system reset"
    echo ""

    echo "Killing all running services..."
    pkill -9 -f "mix phx.server" 2>/dev/null && echo "   Phoenix server killed" || echo "   No Phoenix server running"
    pkill -9 -f "beam.*phx" 2>/dev/null && echo "   BEAM processes killed" || true
    lsof -ti:4000 | xargs kill -9 2>/dev/null && echo "   Port 4000 freed" || true

    echo "   Waiting 2 seconds for cleanup..."
    sleep 2
fi

# ==============================================================================
# ELIXIR / MIX CLEANUP
# ==============================================================================
echo ""
echo "Cleaning Elixir build artifacts..."

if [ -d "_build" ]; then
    echo "   Removing _build/"
    rm -rf _build
fi

if [ -d "deps" ]; then
    echo "   Removing deps/"
    rm -rf deps
fi

if [ -d "priv/static" ]; then
    echo "   Cleaning priv/static/"
    rm -rf priv/static/*
fi

# Clean mix artifacts
echo "   Running mix clean..."
mix clean --deps 2>/dev/null || true

# ==============================================================================
# NODE / JAVASCRIPT CLEANUP
# ==============================================================================
echo ""
echo "Cleaning Node.js build artifacts..."

cd "$PROJECT_ROOT/assets" || exit 1

if [ -d "node_modules" ]; then
    echo "   Removing assets/node_modules/"
    rm -rf node_modules
fi

if [ -f "package-lock.json" ]; then
    echo "   Removing package-lock.json"
    rm -f package-lock.json
fi

if [ -d ".cache" ]; then
    echo "   Removing .cache/"
    rm -rf .cache
fi

# ==============================================================================
# ADDITIONAL CLEANUP
# ==============================================================================
echo ""
echo "Additional cleanup..."

cd "$PROJECT_ROOT" || exit 1

# Remove crash dumps
if ls erl_crash.dump &> /dev/null 2>&1; then
    echo "   Removing erl_crash.dump"
    rm -f erl_crash.dump
fi

echo ""
echo "Cleanup complete!"

# ==============================================================================
# REBUILD DEPENDENCIES
# ==============================================================================
if [ "$REBUILD" = true ]; then
    echo ""
    echo "Rebuilding dependencies..."

    echo ""
    echo "Fetching Elixir dependencies..."
    mix deps.get

    echo ""
    echo "Compiling Elixir project..."
    mix compile

    echo ""
    echo "Installing Node.js dependencies..."
    cd "$PROJECT_ROOT/assets" || exit 1
    npm install

    cd "$PROJECT_ROOT" || exit 1

    echo ""
    echo "Rebuild complete!"

    # Reset database AFTER rebuild (so deps are available)
    if [ "$DEEP_CLEAN" = true ]; then
        echo ""
        echo "Resetting database..."
        mix ecto.reset || echo "   Database reset failed (database might not be running)"
        echo "   Database reset complete."
    fi
else
    echo ""
    echo "Clean complete. To rebuild dependencies, run:"
    echo "      ./scripts/dev.sh"
    echo ""
    echo "   Or manually:"
    echo "      mix deps.get"
    echo "      mix compile"
    echo "      cd assets && npm install"
fi

# ==============================================================================
# OPTIONAL: START SERVER
# ==============================================================================
if [ "$START_SERVER" = true ]; then
    echo ""
    echo "Starting Phoenix server..."
    export NODE_OPTIONS=--openssl-legacy-provider
    mix phx.server
else
    echo ""
    echo "All done! Next steps:"
    if [ "$REBUILD" = false ]; then
        echo "  Run dev.sh to fetch dependencies and start the server:"
        echo "      ./scripts/dev.sh"
        echo ""
        echo "  Or use --rebuild to fetch dependencies without starting:"
        echo "      ./scripts/clean.sh --rebuild"
    else
        if [ "$DEEP_CLEAN" = true ]; then
            echo "  Deep clean complete! System is fully reset."
            echo "  Your project is ready to run:"
            echo "      ./scripts/dev.sh"
        else
            echo "  Your project is ready to run:"
            echo "      ./scripts/dev.sh"
            echo ""
            echo "  Or start server directly:"
            echo "      mix phx.server"
        fi
    fi
    echo ""
fi
