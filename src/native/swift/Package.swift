// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TranscriperNative",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "audio-capture", targets: ["AudioCaptureApp"]),
        .library(name: "TranscriperCore", targets: ["TranscriperCore"])
    ],
    dependencies: [
        .package(url: "https://github.com/argmaxinc/WhisperKit.git", from: "0.8.0"),
        .package(url: "https://github.com/FluidInference/FluidAudio.git", from: "0.0.3")
    ],
    targets: [
        // Main executable target (existing audio capture app)
        .executableTarget(
            name: "AudioCaptureApp",
            dependencies: ["TranscriperCore"],
            path: ".",
            sources: ["main.swift"]
        ),
        
        // Core library target with all native functionality
        .target(
            name: "TranscriperCore",
            dependencies: [
                .product(name: "WhisperKit", package: "WhisperKit"),
                .product(name: "FluidAudio", package: "FluidAudio")
            ],
            path: "Core",
            sources: [
                "AudioCapture.swift",
                "WhisperKitManager.swift", 
                "FluidAudioManager.swift",
                "UnifiedAudioProcessor.swift",
                "SwiftAudioBridge.swift"
            ]
        )
    ]
)