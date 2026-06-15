#!/usr/bin/env sh
set -eu

sh scripts/tauri.sh ios init --ci
bun run build

PROJECT_SPEC="src-tauri/gen/apple/project.yml"
TEMP_SPEC="src-tauri/gen/apple/project.unsigned.yml"
DERIVED_DATA_PATH="src-tauri/gen/apple/.deriveddata_unsigned"
APP_PATH="$DERIVED_DATA_PATH/Build/Products/release-iphoneos/Free Grind.app"

# this shi strips phases that enforce the signing or trigger tauri xcode script
awk '
	/^[[:space:]]*DEVELOPMENT_TEAM:[[:space:]]*/ { next }
	/^[[:space:]]*-[[:space:]]*path:[[:space:]]*Externals[[:space:]]*$/ { next }
	/^[[:space:]]*preBuildScripts:[[:space:]]*$/ { skip = 1; next }
	skip {
		if (/^[[:space:]]{4}[A-Za-z_][A-Za-z0-9_]*:[[:space:]]*$/) {
			skip = 0
			print
			next
		}
		next
	}
	{ print }
' "$PROJECT_SPEC" > "$TEMP_SPEC"

xcodegen generate --spec "$TEMP_SPEC"

# tauri ios init/xcodegen doesnt merge src-taur/info.plist for ios, and xcodegen
# overwrites free-grind_iOS/Info.plist as part of generate, so we merge ours in after,
/usr/libexec/PlistBuddy -c "Merge src-tauri/Info.plist" src-tauri/gen/apple/free-grind_iOS/Info.plist

# i downgraded the mium version of xcode cuz i wanted
sed -i '' 's/objectVersion = 77;/objectVersion = 60;/' src-tauri/gen/apple/free-grind.xcodeproj/project.pbxproj

# built the rust core for device with custom protocol enabled, since the
# prebuildscripts phase that normally does this was stripped above lol fuck me. Without
# custom protocol, basicaly the binary o0r whatever is compiled in dev mode and tries to load the
# frontend from the vite dev server instead of the bundled assets. yea
(cd src-tauri && cargo build --target aarch64-apple-ios --release --features custom-protocol)
mkdir -p src-tauri/gen/apple/Externals/arm64/release
cp src-tauri/target/aarch64-apple-ios/release/libopen_grind_lib.a src-tauri/gen/apple/Externals/arm64/release/libapp.a

xcodebuild \
	-scheme free-grind_iOS \
	-workspace src-tauri/gen/apple/free-grind.xcodeproj/project.xcworkspace \
	-sdk iphoneos \
	-configuration release \
	-derivedDataPath "$DERIVED_DATA_PATH" \
	CODE_SIGNING_ALLOWED=NO \
	CODE_SIGNING_REQUIRED=NO \
	CODE_SIGN_IDENTITY="" \
	build

rm -rf dist/ios/Payload
mkdir -p dist/ios/Payload
cp -R "$APP_PATH" dist/ios/Payload/

cd dist/ios
zip -qry free-grind-unsigned.ipa Payload
cd - >/dev/null

echo "unsigned IPA created at dist/ios/free-grind-unsigned.ipa enjoy i guess"
