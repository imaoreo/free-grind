{ pkgs ? import <nixpkgs> {
    config = {
      allowUnfree = true;
      android_sdk.accept_license = true;
    };
  }
}:

let
  androidComposition = pkgs.androidenv.composeAndroidPackages {
    platformVersions = [ "36" ];
    buildToolsVersions = [ "36.0.0" ];
    abiVersions = [ "armeabi-v7a" "arm64-v8a" "x86" "x86_64" ];
    includeNDK = true;
    ndkVersions = [ "27.0.12077973" ];
    cmakeVersions = [ "3.22.1" ];
    includeEmulator = false;
    includeSystemImages = false;
    useGoogleAPIs = false;
    useGoogleTVAddOns = false;
  };

  androidSdk = androidComposition.androidsdk;

  buildApk = pkgs.writeShellApplication {
    name = "build-apk";
    runtimeInputs = with pkgs; [
      coreutils
      findutils
      gnused
    ];
    text = ''
      set -euo pipefail

      if [ ! -f package.json ]; then
        echo "Run this from the repository root."
        exit 1
      fi

      export PATH="$HOME/.cargo/bin:$PATH"

      echo "Preparing Android project..."
      if [ ! -d src-tauri/gen/android ]; then
        pnpm exec tauri android init --ci --skip-targets-install
      fi

      mkdir -p src-tauri/gen/android/app/src/main/res/xml
      cat > src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
EOF

      if [ -f src-tauri/sounds/free_grind_message.mp3 ]; then
        mkdir -p src-tauri/gen/android/app/src/main/res/raw
        cp src-tauri/sounds/free_grind_message.mp3 src-tauri/gen/android/app/src/main/res/raw/free_grind_message.mp3
      fi

      echo "Building Android APK..."
      pnpm exec tauri android build --apk -v

      APK_PATH="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
      if [ ! -f "$APK_PATH" ]; then
        echo "APK not found at $APK_PATH"
        exit 1
      fi

      echo "APK built at: $(pwd)/$APK_PATH"
    '';
  };
in
pkgs.mkShell {
  packages = with pkgs; [
    androidSdk
    buildApk
    git
    jdk17
    nodejs_22
    pnpm
    pkg-config
    rustup
    openssl
    zlib
  ];

  shellHook = ''
    export ANDROID_HOME="${androidSdk}/libexec/android-sdk"
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
    export ANDROID_NDK_HOME="$ANDROID_HOME/ndk-bundle"
    export JAVA_HOME="${pkgs.jdk17}/lib/openjdk"
    export PATH="$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/build-tools/36.0.0:$PATH"
    echo "Android APK shell ready. Run: build-apk"
  '';
}
