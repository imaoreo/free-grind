#!/usr/bin/env sh
set -eu

sh scripts/ensure-dev-port.sh
sh scripts/ensure-ios-scheme.sh

SIMULATOR="${IOS_SIMULATOR:-iPhone 17 Pro}"
exec sh scripts/tauri.sh ios dev "$SIMULATOR"
