{ pkgs ? import <nixpkgs> {} }:

let
  buildIpa = pkgs.writeShellApplication {
    name = "build-ipa";
    runtimeInputs = with pkgs; [
      coreutils
      findutils
      gawk
      gnugrep
      gnused
      zip
    ];
    text = ''
      set -euo pipefail

      if [ ! -f package.json ]; then
        echo "Run this from the repository root."
        exit 1
      fi

      export DEVELOPER_DIR="''${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
      export PATH="$HOME/.cargo/bin:$PATH"
      export CC=/usr/bin/clang
      export CXX=/usr/bin/clang++
      export AR=/usr/bin/ar
      export CC_aarch64_apple_ios=/usr/bin/clang
      export CARGO_TARGET_AARCH64_APPLE_IOS_LINKER=/usr/bin/clang
      export CARGO_TARGET_AARCH64_APPLE_IOS_RUSTFLAGS="-C link-arg=-isysroot -C link-arg=$DEVELOPER_DIR/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk"
      export SDKROOT="$DEVELOPER_DIR/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk"

      if [ ! -d "$DEVELOPER_DIR" ]; then
        echo "Xcode developer directory not found at $DEVELOPER_DIR"
        exit 1
      fi

      echo "Preparing iOS project..."
      rm -rf src-tauri/gen/apple
      pnpm exec tauri ios init --ci

      echo "Building frontend assets..."
      pnpm run build

      if [ ! -d dist ]; then
        echo "Frontend dist directory not found at ./dist"
        exit 1
      fi

      mkdir -p src-tauri/gen/apple/assets
      rm -rf src-tauri/gen/apple/assets/*
      cp -R dist/* src-tauri/gen/apple/assets/

      echo "Building Rust iOS static library..."
      cargo rustc --manifest-path src-tauri/Cargo.toml --target aarch64-apple-ios --release --lib -- \
        -C linker=/usr/bin/clang \
        -C link-arg=-isysroot \
        -C link-arg="$DEVELOPER_DIR/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk"

      LIB_PATH="src-tauri/target/aarch64-apple-ios/release/libopen_grind_lib.a"
      if [ ! -f "$LIB_PATH" ]; then
        echo "iOS static library not found at $LIB_PATH"
        exit 1
      fi

      mkdir -p src-tauri/gen/apple/Externals/arm64/release
      cp "$LIB_PATH" src-tauri/gen/apple/Externals/arm64/release/libapp.a
      mkdir -p src-tauri/gen/apple/Externals/x86_64/release
      cp "$LIB_PATH" src-tauri/gen/apple/Externals/x86_64/release/libapp.a

      PBXPROJ_PATH="$(find src-tauri/gen/apple -maxdepth 3 -name project.pbxproj | head -n 1)"
      if [ -z "$PBXPROJ_PATH" ]; then
        echo "project.pbxproj not found under src-tauri/gen/apple"
        exit 1
      fi

      TMP_FILE="$(mktemp)"
      if ! awk '
        BEGIN { replaced = 0 }
        /tauri ios xcode-script/ {
          print "\t\t\tshellScript = \"set -e\";"
          replaced = 1
          next
        }
        { print }
        END {
          if (replaced == 0) {
            exit 2
          }
        }
      ' "$PBXPROJ_PATH" > "$TMP_FILE"; then
        rm -f "$TMP_FILE"
        echo "Failed to patch Build Rust Code script"
        exit 1
      fi

      mv "$TMP_FILE" "$PBXPROJ_PATH"
      plutil -lint "$PBXPROJ_PATH" >/dev/null

      IOS_PROJECT_DIR="src-tauri/gen/apple"
      WORKSPACE_PATH="$(find "$IOS_PROJECT_DIR" -maxdepth 2 -name '*.xcworkspace' | head -n 1)"
      XCODEPROJ_PATH="$(find "$IOS_PROJECT_DIR" -maxdepth 2 -name '*.xcodeproj' | head -n 1)"

      if [ -n "$WORKSPACE_PATH" ]; then
        PROJECT_ARGS=( -workspace "$WORKSPACE_PATH" )
      elif [ -n "$XCODEPROJ_PATH" ]; then
        PROJECT_ARGS=( -project "$XCODEPROJ_PATH" )
      else
        echo "No Xcode workspace/project found under $IOS_PROJECT_DIR"
        exit 1
      fi

      SCHEME="$(xcodebuild "''${PROJECT_ARGS[@]}" -list | awk '/Schemes:/ {flag=1; next} flag && NF {print $1; exit}')"
      if [ -z "$SCHEME" ]; then
        echo "Failed to resolve iOS scheme"
        exit 1
      fi

      DERIVED_DATA_PATH="$(pwd)/.build/ios-derived"
      mkdir -p "$DERIVED_DATA_PATH"

      echo "Building iOS app bundle without signing..."
      xcodebuild "''${PROJECT_ARGS[@]}" \
        -scheme "$SCHEME" \
        -configuration release \
        -destination 'generic/platform=iOS' \
        -derivedDataPath "$DERIVED_DATA_PATH" \
        CODE_SIGNING_ALLOWED=NO \
        CODE_SIGNING_REQUIRED=NO \
        CODE_SIGN_IDENTITY="" \
        build

      APP_PATH="$(find "$DERIVED_DATA_PATH/Build/Products" -maxdepth 2 -type d -name '*.app' | grep -E '/(release|Release)-iphoneos/' | head -n 1)"
      if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
        echo "No release .app artifact found in $DERIVED_DATA_PATH/Build/Products"
        exit 1
      fi

      OUT_DIR="$(pwd)/dist/ios"
      PAYLOAD_DIR="$OUT_DIR/Payload"
      IPA_PATH="$OUT_DIR/free-grind-unsigned.ipa"

      rm -rf "$PAYLOAD_DIR"
      mkdir -p "$PAYLOAD_DIR"
      cp -R "$APP_PATH" "$PAYLOAD_DIR/"

      (
        cd "$OUT_DIR"
        rm -f "$IPA_PATH"
        zip -qry "$IPA_PATH" Payload
      )

      echo "IPA built at: $IPA_PATH"
    '';
  };
in
pkgs.mkShell {
  packages = with pkgs; [
    buildIpa
    git
    nodejs_22
    pnpm
    pkg-config
    rustup
    openssl
    zlib
  ];

  shellHook = ''
    export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
    export PATH="$HOME/.cargo/bin:$PATH"
    export CC=/usr/bin/clang
    export CXX=/usr/bin/clang++
    export AR=/usr/bin/ar
    export CC_aarch64_apple_ios=/usr/bin/clang
    export CARGO_TARGET_AARCH64_APPLE_IOS_LINKER=/usr/bin/clang
    export CARGO_TARGET_AARCH64_APPLE_IOS_RUSTFLAGS="-C link-arg=-isysroot -C link-arg=$DEVELOPER_DIR/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk"
    echo "iOS IPA shell ready. Run: build-ipa"
  '';
}
