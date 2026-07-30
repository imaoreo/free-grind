// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "tauri-plugin-ios-app-disguise",
    platforms: [
        .macOS(.v10_13),
        .iOS(.v13),
    ],
    products: [
        .library(
            name: "tauri-plugin-ios-app-disguise",
            type: .static,
            targets: ["tauri-plugin-ios-app-disguise"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-ios-app-disguise",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
