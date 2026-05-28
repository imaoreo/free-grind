#!/usr/bin/env sh
set -eu

sh scripts/tauri.sh android init --ci --skip-targets-install
sh scripts/tauri.sh android build --apk -v

echo "APK output: src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
