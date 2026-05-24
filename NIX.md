# Nix Guide

This project includes Nix shells for development and mobile packaging.

## Prerequisites

- Nix installed.
- macOS + Xcode for iOS builds.
- Android SDK license acceptance is handled in `nix/android-apk.nix`.

## General Dev Shell

From repo root:

```bash
nix-shell
```

This uses `shell.nix` and provides common tooling (`node`, `pnpm`, `rustup`, etc.).

## Build Android APK (Nix)

From repo root:

```bash
nix-shell nix/android-apk.nix --run 'build-apk'
```

Expected output:

```text
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

## Build iOS Device IPA (Nix)

From repo root:

```bash
nix-shell nix/ios-ipa.nix --run 'build-ipa'
```

Expected output:

```text
dist/ios/free-grind-unsigned.ipa
```

Notes:

- This IPA is unsigned.
- It is for physical iOS devices (iphoneos), not Simulator.

## Build iOS Simulator Artifact

The device IPA above will not run in iOS Simulator.

If you need a simulator package, build/install a simulator app (`iphonesimulator`) and package that separately.
In this repo, a simulator IPA example is:

```text
dist/ios/free-grind-simulator.ipa
```

That simulator IPA is for VM/Simulator only, not physical iPhones.

## Helpful Checks

Verify files:

```bash
ls -lh dist/ios/
```

Checksum:

```bash
shasum -a 256 dist/ios/free-grind-unsigned.ipa
```

## iOS Troubleshooting

If iOS build tools are not initialized:

```bash
xcodebuild -runFirstLaunch
xcodebuild -downloadPlatform iOS
```

If a built app tries `http://localhost:1420` on device, make sure you are using the current configuration in this repo (release build path with bundled assets and `custom-protocol` enabled in `src-tauri/Cargo.toml`).