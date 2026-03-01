#!/bin/bash
# BUOY-FISH Coverage Mapper — Seed Test Data
#
# Posts realistic uplink data through the ingest API to populate the map
# with test coverage hexes. Uses the same ChirpStack payload format
# that real devices will send.
#
# Usage:
#   ./scripts/seed-test-data.sh              # Seed to localhost:4002
#   ./scripts/seed-test-data.sh --port 4001  # Custom port
#   ./scripts/seed-test-data.sh --host map.buoy.fish --port 443 --https
#
# This creates ~60 coverage hexes around San Francisco Bay
# simulating buoy/vessel tracker uplinks heard by shore-based gateways,
# plus relay hop scenarios (end node → relay vessel → border gateway).

set -e

HOST="localhost"
PORT="4002"
SCHEME="http"

for arg in "$@"; do
    case $arg in
        --port)  shift; PORT="$1"; shift ;;
        --host)  shift; HOST="$1"; shift ;;
        --https) SCHEME="https"; shift ;;
        --help)
            echo "Usage: $0 [--host HOST] [--port PORT] [--https]"
            echo "  Seeds test coverage data via the ingest API."
            exit 0 ;;
    esac
done

BASE_URL="${SCHEME}://${HOST}:${PORT}"
API_URL="${BASE_URL}/api/v1/ingest/uplink"

echo "Seeding test data to ${API_URL}"
echo "==========================================="

# Gateway locations (shore-based LoRaWAN gateways around San Francisco Bay)
GW1_NAME="buoy-fish-fort-mason"
GW1_LAT="37.8060"
GW1_LNG="-122.4310"
GW1_ID="gw-fort-mason-001"

GW2_NAME="buoy-fish-sausalito"
GW2_LAT="37.8590"
GW2_LNG="-122.4850"
GW2_ID="gw-sausalito-001"

GW3_NAME="buoy-fish-treasure-island"
GW3_LAT="37.8230"
GW3_LNG="-122.3700"
GW3_ID="gw-treasure-island-001"

# Relay gateway (vessel-mounted relay, mid-bay between Golden Gate and Fort Mason)
RELAY1_NAME="relay-fishing-vessel-delta"
RELAY1_LAT="37.8200"
RELAY1_LNG="-122.4600"
RELAY1_ID="relay-vessel-delta-001"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SUCCESS=0
FAIL=0

send_uplink() {
    local lat=$1
    local lng=$2
    local rssi=$3
    local snr=$4
    local gw_name=$5
    local gw_lat=$6
    local gw_lng=$7
    local gw_id=$8
    local dev_eui=$9
    local fcnt=${10}

    local dedup_id=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")

    local payload=$(cat <<EOFPAYLOAD
{
  "deduplicationId": "${dedup_id}",
  "time": "${TIMESTAMP}",
  "deviceInfo": {
    "devEui": "${dev_eui}"
  },
  "fCnt": ${fcnt},
  "txInfo": {
    "frequency": 904300000,
    "modulation": {
      "lora": {
        "spreadingFactor": 10,
        "bandwidth": 125000
      }
    }
  },
  "object": {
    "latitude": ${lat},
    "longitude": ${lng},
    "altitude": 2,
    "accuracy": 5.0
  },
  "rxInfo": [
    {
      "rssi": ${rssi},
      "snr": ${snr},
      "time": "${TIMESTAMP}",
      "metadata": {
        "gateway_id": "${gw_id}",
        "gateway_name": "${gw_name}",
        "gateway_lat": "${gw_lat}",
        "gateway_long": "${gw_lng}"
      }
    }
  ]
}
EOFPAYLOAD
)

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${API_URL}" \
        -H "Content-Type: application/json" \
        -d "${payload}" 2>/dev/null)

    if [ "$http_code" = "200" ]; then
        SUCCESS=$((SUCCESS + 1))
        printf "."
    else
        FAIL=$((FAIL + 1))
        printf "x"
    fi
}

# Send a relayed uplink: end node → relay gateway → border gateway
# The payload has TWO entries in rxInfo, representing the two gateways
# that "heard" the uplink (relay first-hop, border second-hop).
send_uplink_relayed() {
    local lat=$1          # end node latitude
    local lng=$2          # end node longitude
    local relay_rssi=$3   # RSSI at relay (first hop, typically weaker)
    local relay_snr=$4    # SNR at relay
    local relay_name=$5   # relay gateway name
    local relay_lat=$6    # relay gateway latitude
    local relay_lng=$7    # relay gateway longitude
    local relay_id=$8     # relay gateway ID
    local border_rssi=$9  # RSSI at border gateway (second hop, typically stronger)
    local border_snr=${10}
    local border_name=${11}
    local border_lat=${12}
    local border_lng=${13}
    local border_id=${14}
    local dev_eui=${15}
    local fcnt=${16}

    local dedup_id=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")

    local payload=$(cat <<EOFPAYLOAD
{
  "deduplicationId": "${dedup_id}",
  "time": "${TIMESTAMP}",
  "deviceInfo": {
    "devEui": "${dev_eui}"
  },
  "fCnt": ${fcnt},
  "txInfo": {
    "frequency": 904300000,
    "modulation": {
      "lora": {
        "spreadingFactor": 10,
        "bandwidth": 125000
      }
    }
  },
  "object": {
    "latitude": ${lat},
    "longitude": ${lng},
    "altitude": 2,
    "accuracy": 5.0
  },
  "rxInfo": [
    {
      "rssi": ${relay_rssi},
      "snr": ${relay_snr},
      "time": "${TIMESTAMP}",
      "metadata": {
        "gateway_id": "${relay_id}",
        "gateway_name": "${relay_name}",
        "gateway_lat": "${relay_lat}",
        "gateway_long": "${relay_lng}"
      }
    },
    {
      "rssi": ${border_rssi},
      "snr": ${border_snr},
      "time": "${TIMESTAMP}",
      "metadata": {
        "gateway_id": "${border_id}",
        "gateway_name": "${border_name}",
        "gateway_lat": "${border_lat}",
        "gateway_long": "${border_lng}"
      }
    }
  ]
}
EOFPAYLOAD
)

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${API_URL}" \
        -H "Content-Type: application/json" \
        -d "${payload}" 2>/dev/null)

    if [ "$http_code" = "200" ]; then
        SUCCESS=$((SUCCESS + 1))
        printf "R"
    else
        FAIL=$((FAIL + 1))
        printf "x"
    fi
}

echo ""
echo "Sending uplinks (each . = success, R = relayed, x = failure)..."
echo ""

# San Francisco Bay — scattered buoy/vessel positions
# Marina / Fisherman's Wharf area (strong signal, near Fort Mason GW)
send_uplink 37.8080 -122.4250 -82  9.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-001" 1
send_uplink 37.8100 -122.4220 -80  10.0 "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-001" 2
send_uplink 37.8090 -122.4280 -84  9.0  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-001" 3
send_uplink 37.8070 -122.4350 -86  8.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-002" 1
send_uplink 37.8050 -122.4380 -88  8.0  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-002" 2
send_uplink 37.8110 -122.4180 -83  9.0  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "vessel-track-001" 1

# Mid-bay heading toward Alcatraz (moderate signal)
send_uplink 37.8200 -122.4300 -92  6.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "vessel-track-001" 2
send_uplink 37.8250 -122.4350 -95  5.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "vessel-track-001" 3
send_uplink 37.8270 -122.4220 -93  6.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "vessel-track-002" 1
send_uplink 37.8150 -122.4200 -90  7.0  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-003" 1
send_uplink 37.8180 -122.4150 -91  6.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-003" 2

# North toward Sausalito / Angel Island (heard by GW2)
send_uplink 37.8400 -122.4600 -97  4.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-004" 1
send_uplink 37.8450 -122.4650 -100 3.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-004" 2
send_uplink 37.8500 -122.4700 -103 3.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-004" 3
send_uplink 37.8550 -122.4750 -105 2.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "vessel-track-003" 1
send_uplink 37.8350 -122.4500 -95  5.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "vessel-track-003" 2
send_uplink 37.8380 -122.4550 -96  4.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "vessel-track-003" 3

# East toward Treasure Island / Bay Bridge (near GW3)
send_uplink 37.8200 -122.3800 -84  9.0  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-005" 1
send_uplink 37.8180 -122.3750 -86  8.0  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-005" 2
send_uplink 37.8250 -122.3850 -83  9.5  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-005" 3
send_uplink 37.8220 -122.3900 -87  7.5  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-006" 1
send_uplink 37.8160 -122.3650 -89  7.0  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-006" 2

# Ferry route (vessel tracker SF -> Sausalito)
send_uplink 37.8120 -122.4150 -87  7.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "vessel-track-004" 1
send_uplink 37.8180 -122.4250 -89  7.0  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "vessel-track-004" 2
send_uplink 37.8250 -122.4350 -91  6.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "vessel-track-004" 3
send_uplink 37.8320 -122.4450 -93  6.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "vessel-track-004" 4
send_uplink 37.8400 -122.4530 -90  6.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "vessel-track-004" 5
send_uplink 37.8500 -122.4650 -88  7.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "vessel-track-004" 6

# Out toward the Golden Gate (edge of coverage)
send_uplink 37.8300 -122.4800 -108 1.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-007" 1
send_uplink 37.8280 -122.4900 -112 0.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-007" 2
send_uplink 37.8130 -122.4400 -88  7.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-008" 1
send_uplink 37.8160 -122.4320 -86  8.0  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-008" 2

# South bay toward Oakland (long range from GW3)
send_uplink 37.8100 -122.3600 -99  3.5  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "vessel-track-005" 1
send_uplink 37.8050 -122.3550 -102 3.0  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "vessel-track-005" 2
send_uplink 37.8000 -122.3500 -105 2.5  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "vessel-track-005" 3
send_uplink 37.7950 -122.3450 -108 2.0  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "vessel-track-005" 4

# Near Angel Island
send_uplink 37.8600 -122.4350 -98  4.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-009" 1
send_uplink 37.8630 -122.4300 -100 3.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-009" 2
send_uplink 37.8580 -122.4400 -96  5.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-009" 3
send_uplink 37.8560 -122.4250 -99  4.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" "buoy-temp-010" 1

# Inner bay fill (Aquatic Park / Pier 39 area)
send_uplink 37.8075 -122.4200 -82  9.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-010" 2
send_uplink 37.8095 -122.4160 -84  9.0  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-010" 3
send_uplink 37.8060 -122.4130 -85  8.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-011" 1
send_uplink 37.8040 -122.4100 -87  8.0  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-011" 2

# Central bay
send_uplink 37.8300 -122.4100 -96  5.0  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-012" 1
send_uplink 37.8350 -122.4150 -98  4.5  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-012" 2
send_uplink 37.8280 -122.4050 -94  5.5  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-012" 3
send_uplink 37.8200 -122.4100 -91  6.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" "buoy-temp-013" 1
send_uplink 37.8230 -122.4050 -93  6.0  "$GW3_NAME" "$GW3_LAT" "$GW3_LNG" "$GW3_ID" "buoy-temp-013" 2

# =========================================================================
# RELAY HOP SCENARIO
# =========================================================================
# Buoys outside the Golden Gate, beyond direct range of shore gateways.
# A relay gateway on fishing vessel "Delta" (mid-bay, ~37.82, -122.46)
# picks up these signals and forwards them to the Fort Mason border gateway.
#
# Visualization: clicking a hex should show TWO hotspot lines —
#   1. End node → relay vessel (first hop, weaker RSSI)
#   2. End node → Fort Mason border GW (second hop, signal via relay)
# =========================================================================

echo ""
echo "Sending relayed uplinks..."
echo ""

# Buoy outside Golden Gate — drifting west of the bridge
# Relay vessel hears it at -108 dBm (weak, ~3km away), forwards to Fort Mason
send_uplink_relayed 37.8280 -122.5050 \
    -108 1.5  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -115 -0.5 "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "buoy-ocean-001" 1

send_uplink_relayed 37.8300 -122.5100 \
    -110 1.0  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -117 -1.0 "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "buoy-ocean-001" 2

send_uplink_relayed 37.8320 -122.5150 \
    -112 0.5  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -119 -1.5 "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "buoy-ocean-001" 3

# Buoy further out — barely reachable by relay
send_uplink_relayed 37.8350 -122.5250 \
    -115 -0.5 "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -122 -2.5 "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "buoy-ocean-002" 1

send_uplink_relayed 37.8330 -122.5200 \
    -113 0.0  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -120 -2.0 "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "buoy-ocean-002" 2

# Crab pot buoy south of the channel — relay picks up, also heard by Sausalito GW
send_uplink_relayed 37.8200 -122.5000 \
    -105 2.0  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -110 0.5  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" \
    "buoy-crab-001" 1

send_uplink_relayed 37.8180 -122.4950 \
    -103 2.5  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -108 1.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" \
    "buoy-crab-001" 2

send_uplink_relayed 37.8220 -122.5050 \
    -107 1.5  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -112 0.0  "$GW2_NAME" "$GW2_LAT" "$GW2_LNG" "$GW2_ID" \
    "buoy-crab-001" 3

# Vessel transiting outbound through the Golden Gate — relay + Fort Mason
send_uplink_relayed 37.8250 -122.4800 \
    -98  4.0  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -106 1.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "vessel-track-006" 1

send_uplink_relayed 37.8270 -122.4900 \
    -102 3.0  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -110 0.5  "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "vessel-track-006" 2

send_uplink_relayed 37.8290 -122.5000 \
    -106 2.0  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -114 -0.5 "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "vessel-track-006" 3

send_uplink_relayed 37.8310 -122.5100 \
    -110 1.0  "$RELAY1_NAME" "$RELAY1_LAT" "$RELAY1_LNG" "$RELAY1_ID" \
    -118 -1.5 "$GW1_NAME" "$GW1_LAT" "$GW1_LNG" "$GW1_ID" \
    "vessel-track-006" 4

echo ""
echo ""
echo "==========================================="
echo "Done! ${SUCCESS} uplinks sent (including relayed hops), ${FAIL} failures."
echo ""
echo "The map should now show ~${SUCCESS} coverage hexes"
echo "around San Francisco Bay and outside the Golden Gate."
echo ""
echo "View at: ${BASE_URL}"
echo "==========================================="
