#!/usr/bin/env sh
set -eu

if [ -d "$HOME/.cargo/bin" ]; then
  PATH="$HOME/.cargo/bin:$PATH"
fi

if [ -d "/opt/homebrew/bin" ]; then
  PATH="/opt/homebrew/bin:$PATH"
fi

if [ -d "/usr/local/bin" ]; then
  PATH="/usr/local/bin:$PATH"
fi

export PATH

if ! command -v cargo >/dev/null 2>&1; then
  echo "Error: cargo not found in PATH. Install Rust from https://rustup.rs and reopen your shell."
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun not found in PATH. Install Bun from https://bun.sh and reopen your shell."
  exit 1
fi

exec bunx tauri "$@"
