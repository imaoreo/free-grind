#!/usr/bin/env sh

set -eu

PKG="${PKG:-dev.estopia.free_grind}"
MODE="${1:-filtered}"
OUT_DIR="${2:-logs/android}"

mkdir -p "$OUT_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/push-$MODE-$TS.log"
RAW_FILE="$OUT_DIR/push-raw-$TS.log"

# Tags emitted by Firebase SDK and our own Kotlin code
FCM_FILTER='FCM|PUSH_SYNC|PUSH_EVENT|Tauri/Notification|gcm-push-tokens|sync_push_token|MessagingService|FirebaseMessaging|Firebase-Installations|SpoofedContext|SpoofedPackageManager|FreeGrindFirebase'

# Package name used for system-level context (WindowManager etc.)
PKG_FILTER="$PKG"

PID="$(adb shell pidof -s "$PKG" 2>/dev/null | tr -d '\r\n' || true)"

if [ "$MODE" = "raw" ]; then
  if [ -n "$PID" ]; then
    echo "Saving raw PID-scoped logs for $PKG (pid=$PID) to $OUT_FILE"
    adb logcat -d -v threadtime --pid="$PID" > "$OUT_FILE"
  else
    echo "PID not found, saving raw global logs to $OUT_FILE"
    adb logcat -d -v threadtime > "$OUT_FILE"
  fi
  echo "Saved raw log snapshot: $OUT_FILE"
  exit 0
fi

if [ -n "$PID" ]; then
  echo "Saving filtered PID-scoped logs for $PKG (pid=$PID) to $OUT_FILE"
  # Capture all output from the app's own process (includes Firebase SDK logs)
  adb logcat -d -v threadtime --pid="$PID" > "$OUT_FILE.pid.tmp" || true
  # Also grab Firebase/FCM lines from global log (they can run in a separate process)
  adb logcat -d -v threadtime | grep -E "$FCM_FILTER" > "$OUT_FILE.fcm.tmp" || true
  cat "$OUT_FILE.pid.tmp" "$OUT_FILE.fcm.tmp" | sort -t ' ' -k1,2 | uniq > "$OUT_FILE" || true
  rm -f "$OUT_FILE.pid.tmp" "$OUT_FILE.fcm.tmp"
else
  echo "PID not found, saving FCM-tagged global logs to $OUT_FILE"
  adb logcat -d -v threadtime | grep -E "$FCM_FILTER" > "$OUT_FILE" || true
fi

if [ ! -s "$OUT_FILE" ]; then
  echo "No filtered lines captured; saving raw global snapshot to $RAW_FILE"
  adb logcat -d -v threadtime > "$RAW_FILE"
  echo "Saved fallback raw log snapshot: $RAW_FILE"
else
  echo "Saved filtered log snapshot: $OUT_FILE ($(wc -l < "$OUT_FILE") lines)"
fi
