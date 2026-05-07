#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
XCODEPROJ_DIR="$ROOT_DIR/src-tauri/gen/apple/free-grind.xcodeproj"
SCHEME_DIR="$XCODEPROJ_DIR/xcshareddata/xcschemes"
OPEN_SCHEME="$SCHEME_DIR/open-grind_iOS.xcscheme"
FREE_SCHEME="$SCHEME_DIR/free-grind_iOS.xcscheme"
PBXPROJ="$XCODEPROJ_DIR/project.pbxproj"
SOURCES_DIR="$ROOT_DIR/src-tauri/gen/apple/Sources/free-grind"
INFO_PLIST="$ROOT_DIR/src-tauri/gen/apple/free-grind_iOS/Info.plist"

# Boot the preferred simulator if it's not running
SIMULATOR_UDID="5BD78D00-F0F5-466E-B23F-F4C7A65DED82"
if ! xcrun simctl list | grep -q "$SIMULATOR_UDID.*Booted"; then
  echo "Booting iPhone 17 Pro simulator..."
  xcrun simctl boot "$SIMULATOR_UDID" 2>/dev/null || true
  sleep 3
fi

if [ -f "$OPEN_SCHEME" ] && [ ! -f "$FREE_SCHEME" ]; then
  cp "$OPEN_SCHEME" "$FREE_SCHEME"
  echo "Created iOS scheme alias: free-grind_iOS"
fi

if [ -f "$PBXPROJ" ]; then
  tmp_file="$(mktemp)"
  awk '
    BEGIN {
      in_files = 0;
      seen_main = 0;
      removed = 0;
    }

    /files = \(/ { in_files = 1; print; next }
    in_files && /\);/ { in_files = 0; print; next }

    in_files && /main\.mm in Sources/ {
      if (seen_main == 0) {
        seen_main = 1;
        print;
      } else {
        removed = 1;
      }
      next;
    }

    { print }

    END {
      if (removed == 1) {
        print "Deduplicated duplicate main.mm compile entries in project.pbxproj" > "/dev/stderr";
      }
    }
  ' "$PBXPROJ" > "$tmp_file"
  mv "$tmp_file" "$PBXPROJ"
fi

# Ensure iOS privacy strings exist to avoid launch abort when requesting location.
if [ -f "$INFO_PLIST" ]; then
  /usr/libexec/PlistBuddy -c "Set :NSLocationWhenInUseUsageDescription Free Grind uses your location to show nearby profiles and distance." "$INFO_PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :NSLocationWhenInUseUsageDescription string Free Grind uses your location to show nearby profiles and distance." "$INFO_PLIST"
fi

# Create/restore stub Logger.swift that disables stdout redirection (crashes on iOS simulator)
# This MUST be done before and after the build to ensure auto-generated version doesn't override it
mkdir -p "$SOURCES_DIR"
# Make writable if it exists (we made it immutable before)
chmod 644 "$SOURCES_DIR/Logger.swift" 2>/dev/null || true
cat > "$SOURCES_DIR/Logger.swift" << 'LOGGER_EOF'
// Stub Logger that completely disables stdout redirection which crashes on iOS simulator
import Foundation

class Logger {
    static func log(_ message: String, category: String = "app", type: OSLogType = .default) {
        NSLog("[%@] %@", category, message)
    }
    static func info(_ message: String, category: String = "app") {
        log(message, category: category, type: .info)
    }
    static func debug(_ message: String, category: String = "app") {
        log(message, category: category, type: .debug)
    }
    static func error(_ message: String, category: String = "app") {
        log(message, category: category, type: .error)
    }
}

// Completely disable stdout redirection - it crashes on iOS simulator
class StdoutRedirector {
  static func redirect() { }
    
  // Return a DispatchSourceRead that does nothing
    static func createReader(readPipe: Pipe, writeToOriginal: FileHandle, label: String) -> DispatchSourceRead {
    // Create a minimal dispatch source and immediately return without setting any handlers
    // The type is DispatchSourceRead to satisfy the call signature, but we never use it
    let queue = DispatchQueue(label: "void-\(label)", qos: .utility)
    let source = DispatchSource.makeReadSource(fileDescriptor: -1, queue: queue)
    // Don't set any event handler - just return the source
    // When it tries to read from fd -1, it will fail gracefully
        return source
    }
}
LOGGER_EOF

echo "Ensured stub Logger.swift is present to prevent stdout redirection crashes"

# Make Logger.swift immutable to prevent overwrites (try, may fail on some systems)
chmod 444 "$SOURCES_DIR/Logger.swift" 2>/dev/null || true
