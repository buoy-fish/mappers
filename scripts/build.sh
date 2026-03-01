#!/bin/bash
# BUOY-FISH Coverage Mapper — Build Script
#
# Ensures all dependencies are fetched and the project is compiled.
# This script is idempotent — safe to run multiple times without cleaning.
#
# Usage:
#   ./scripts/build.sh              # Build for development (default)
#   ./scripts/build.sh --production # Build with production assets
#   ./scripts/build.sh --check      # Check if build is needed (exit 0 if ready)
#   ./scripts/build.sh --help       # Show help
#
# This script:
#   1. Fetches Elixir dependencies (mix deps.get)
#   2. Compiles Elixir code (mix compile)
#   3. Installs Node.js dependencies (npm install)
#   4. Optionally builds production assets (--production)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT" || exit 1

# Parse arguments
PRODUCTION_BUILD=false
CHECK_ONLY=false
FORCE_BUILD=false
QUIET=false

for arg in "$@"; do
    case $arg in
        --production|--prod)
            PRODUCTION_BUILD=true
            ;;
        --check)
            CHECK_ONLY=true
            ;;
        --force)
            FORCE_BUILD=true
            ;;
        --quiet|-q)
            QUIET=true
            ;;
        --help)
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (none)           Build for development (fetch deps, compile, npm install)"
            echo "  --production     Also build production assets (npm run deploy)"
            echo "  --check          Check if build is needed without building"
            echo "                   Exit 0 if ready, exit 1 if build needed"
            echo "  --force          Force rebuild even if deps appear up to date"
            echo "  --quiet, -q      Minimal output"
            echo "  --help           Show this help message"
            echo ""
            echo "What this script does:"
            echo "  1. Fetches Elixir dependencies (mix deps.get)"
            echo "  2. Compiles Elixir code (mix compile)"
            echo "  3. Installs Node.js dependencies (npm install)"
            echo "  4. With --production: builds minified assets"
            echo ""
            echo "This script is idempotent and non-destructive."
            echo "Use ./scripts/clean.sh first if you need a clean slate."
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

# Helper function for output
log() {
    if [ "$QUIET" = false ]; then
        echo "$1"
    fi
}

# ==============================================================================
# CHECK MODE: Verify if build is needed
# ==============================================================================
check_build_needed() {
    local needs_build=false

    # Check for deps directory
    if [ ! -d "deps" ] || [ -z "$(ls -A deps 2>/dev/null)" ]; then
        log "   Elixir deps not fetched (deps/ missing or empty)"
        needs_build=true
    fi

    # Check for _build directory
    if [ ! -d "_build" ]; then
        log "   Elixir not compiled (_build/ missing)"
        needs_build=true
    fi

    # Check for node_modules
    if [ ! -d "assets/node_modules" ]; then
        log "   Node modules not installed (assets/node_modules/ missing)"
        needs_build=true
    fi

    # Check for phoenix dep symlink (npm depends on mix deps.get)
    if [ -d "assets/node_modules" ] && [ ! -d "deps/phoenix" ]; then
        log "   Phoenix dep missing — npm packages may be broken"
        needs_build=true
    fi

    if [ "$needs_build" = true ]; then
        return 1
    else
        return 0
    fi
}

if [ "$CHECK_ONLY" = true ]; then
    log "Checking build status..."
    if check_build_needed; then
        log "   Project is ready to run"
        exit 0
    else
        log "   Build needed"
        exit 1
    fi
fi

# ==============================================================================
# BUILD: Fetch and compile everything
# ==============================================================================

log "BUOY-FISH Coverage Mapper — Build"
log "==========================================="

# Check if we can skip (unless --force)
if [ "$FORCE_BUILD" = false ]; then
    if check_build_needed 2>/dev/null; then
        log ""
        log "All dependencies appear up to date."
        log "   Use --force to rebuild anyway."

        if [ "$PRODUCTION_BUILD" = true ]; then
            log ""
            log "Building production assets..."
            node "$PROJECT_ROOT/assets/build.mjs" --deploy
            log "   Production assets built."
        fi

        log ""
        log "Build complete!"
        exit 0
    fi
fi

# ------------------------------------------------------------------------------
# Step 1: Elixir Dependencies
# ------------------------------------------------------------------------------
log ""
log "Fetching Elixir dependencies..."

if [ "$FORCE_BUILD" = true ] || [ ! -d "deps" ] || [ -z "$(ls -A deps 2>/dev/null)" ]; then
    mix deps.get
    log "   Elixir dependencies fetched."
else
    log "   Elixir dependencies already present."
fi

# ------------------------------------------------------------------------------
# Step 2: Compile Elixir
# ------------------------------------------------------------------------------
log ""
log "Compiling Elixir..."

mix compile
log "   Elixir compiled."

# ------------------------------------------------------------------------------
# Step 3: Node.js Dependencies
# ------------------------------------------------------------------------------
log ""
log "Installing Node.js dependencies..."

cd "$PROJECT_ROOT/assets" || exit 1

if [ "$FORCE_BUILD" = true ] || [ ! -d "node_modules" ]; then
    npm install
    log "   Node.js dependencies installed."
else
    # Verify the phoenix symlink works (it depends on deps/)
    if [ ! -d "../deps/phoenix" ]; then
        log "   Phoenix dep missing, reinstalling npm packages..."
        rm -rf node_modules
        npm install
        log "   Node.js dependencies reinstalled."
    else
        log "   Node.js dependencies already present."
    fi
fi

# ------------------------------------------------------------------------------
# Step 4: Production Assets (optional)
# ------------------------------------------------------------------------------
if [ "$PRODUCTION_BUILD" = true ]; then
    log ""
    log "Building production assets..."
    node "$PROJECT_ROOT/assets/build.mjs" --deploy
    log "   Production assets built."
fi

cd "$PROJECT_ROOT" || exit 1

# ==============================================================================
# DONE
# ==============================================================================
log ""
log "Build complete!"
log ""
if [ "$PRODUCTION_BUILD" = true ]; then
    log "   Your project is ready for production deployment."
else
    log "   Your project is ready to run:"
    log "       ./scripts/dev.sh"
fi
log ""
