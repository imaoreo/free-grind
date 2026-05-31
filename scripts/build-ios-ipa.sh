#!/usr/bin/env sh
set -eu

sh scripts/tauri.sh ios init --ci
bun run build

PROJECT_SPEC="src-tauri/gen/apple/project.yml"
TEMP_SPEC="src-tauri/gen/apple/project.unsigned.yml"
DERIVED_DATA_PATH="src-tauri/gen/apple/.deriveddata_unsigned"
APP_PATH="$DERIVED_DATA_PATH/Build/Products/release-iphoneos/Free Grind.app"

# Strip fields/phases that enforce signing or trigger tauri xcode-script.
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

echo "Unsigned IPA created at dist/ios/free-grind-unsigned.ipa"
