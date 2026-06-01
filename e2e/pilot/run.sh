#!/usr/bin/env bash
# e2e/pilot/run.sh — Run all tauri-pilot E2E tests
# Usage: ./e2e/pilot/run.sh
#
# Prerequisites:
#   1. cargo install tauri-pilot-cli
#   2. Run the app in dev mode with pilot feature:
#      cargo tauri dev --features pilot
#   3. Wait for "tauri-pilot ping" to respond "pong"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Wait for app to be ready
echo "⏳ Waiting for tauri-pilot connection..."
for i in $(seq 1 30); do
  if tauri-pilot ping 2>/dev/null | grep -q "pong"; then
    echo "✅ Connected to Kept"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ Timeout waiting for app. Is it running with --features pilot?"
    exit 1
  fi
  sleep 1
done

# Run each .toml scenario
for scenario in "$SCRIPT_DIR"/scenarios/*.toml; do
  name=$(basename "$scenario" .toml)
  echo -n "  ▶ $name... "
  if tauri-pilot run "$scenario" 2>/dev/null; then
    echo -e "${GREEN}PASS${NC}"
    ((PASS++))
  else
    echo -e "${RED}FAIL${NC}"
    ((FAIL++))
    # Show details on failure
    tauri-pilot run "$scenario" 2>&1 | sed 's/^/    /'
  fi
done

# Run shell-based tests
for test_script in "$SCRIPT_DIR"/tests/*.sh; do
  [ -f "$test_script" ] || continue
  name=$(basename "$test_script" .sh)
  echo -n "  ▶ $name... "
  if bash "$test_script" 2>/dev/null; then
    echo -e "${GREEN}PASS${NC}"
    ((PASS++))
  else
    echo -e "${RED}FAIL${NC}"
    ((FAIL++))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
