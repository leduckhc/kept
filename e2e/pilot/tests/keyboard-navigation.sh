#!/usr/bin/env bash
# e2e/pilot/tests/keyboard-navigation.sh
# Test keyboard shortcuts work correctly

set -euo pipefail

# j/k should move thread selection
tauri-pilot press j
sleep 0.3
tauri-pilot assert visible ".thread-item.selected"

# Opening a thread with Enter
tauri-pilot press Enter
sleep 0.5
tauri-pilot assert visible ".thread-reader"

# Going back with Escape
tauri-pilot press Escape
sleep 0.3
tauri-pilot assert visible ".thread-list"

# Compose with 'c'
tauri-pilot press c
sleep 0.3
tauri-pilot assert visible ".compose-panel"

# Close compose with Escape
tauri-pilot press Escape
sleep 0.3
