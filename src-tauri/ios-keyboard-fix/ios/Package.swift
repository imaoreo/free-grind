// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "tauri-plugin-ios-keyboard-fix",
    platforms: [
        .macOS(.v10_13),
        .iOS(.v13),
    ],
    products: [
        .library(
            name: "tauri-plugin-ios-keyboard-fix",
            type: .static,
            targets: ["tauri-plugin-ios-keyboard-fix"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-ios-keyboard-fix",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
