#!/usr/bin/env sh
set -eu

sh scripts/tauri.sh ios init --ci
bun run build
sh scripts/tauri.sh ios build --export-method development

echo "Expected iOS outputs are under src-tauri/gen/apple/build/arm64 and dist/ios if packaged."
