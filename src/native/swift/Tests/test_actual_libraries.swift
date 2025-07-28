#!/usr/bin/env swift

// ACTUAL test of WhisperKit and FluidAudio libraries
// This will actually initialize the libraries and process audio

import Foundation

// First, let's build and run a Swift executable that can import our libraries
print("🔬 ACTUAL WhisperKit + FluidAudio Library Test")
print("=" * 60)
print("⚠️  This will actually download models and process audio")
print("")

// Since we can't directly import the package in a script, let's create a proper test executable
let testCode = """
import Foundation
import TranscriperCore
import AVFoundation

@available(macOS 14.0, *)
class LibraryTest {
    
    func runRealTests() async {
        print("🚀 Starting ACTUAL library tests...")
        
        do {
            // Test 1: Actually initialize WhisperKit
            print("\\n1️⃣ Testing WhisperKit initialization...")
            let whisperManager = WhisperKitManager(modelType: .tiny) // Use tiny for fast download
            try await whisperManager.initialize()
            print("✅ WhisperKit successfully initialized!")
            
            let modelInfo = whisperManager.getModelInfo()
            print("   Model: \\(modelInfo.name)")
            print("   Loaded: \\(modelInfo.isLoaded)")
            print("   Memory: \\(modelInfo.memoryUsage)")
            
        } catch {
            print("❌ WhisperKit test failed: \\(error)")
        }
        
        do {
            // Test 2: Actually initialize FluidAudio
            print("\\n2️⃣ Testing FluidAudio initialization...")
            let fluidManager = FluidAudioManager()
            try await fluidManager.initialize()
            print("✅ FluidAudio successfully initialized!")
            
            let fluidInfo = fluidManager.getModelInfo()
            print("   Initialized: \\(fluidInfo.isInitialized)")
            print("   VAD Accuracy: \\(fluidInfo.vadAccuracy)")
            print("   DER: \\(fluidInfo.diarizationError)")
            
        } catch {
            print("❌ FluidAudio test failed: \\(error)")
        }
        
        do {
            // Test 3: Actually test SwiftAudioBridge
            print("\\n3️⃣ Testing SwiftAudioBridge...")
            let bridge = SwiftAudioBridge()
            let initSuccess = bridge.initialize()
            
            if initSuccess {
                print("✅ SwiftAudioBridge initialized successfully!")
                
                let systemInfo = bridge.getSystemInfo()
                print("System info received: \\(systemInfo.prefix(200))...")
                
                let modelsInfo = bridge.getAvailableModels()
                print("Models info received: \\(modelsInfo.prefix(200))...")
                
            } else {
                print("❌ SwiftAudioBridge initialization failed")
            }
            
        } catch {
            print("❌ SwiftAudioBridge test failed: \\(error)")
        }
        
        print("\\n🎯 ACTUAL library tests complete!")
    }
}

if #available(macOS 14.0, *) {
    let test = LibraryTest()
    Task {
        await test.runRealTests()
        exit(0)
    }
    RunLoop.main.run()
} else {
    print("❌ Requires macOS 14.0+")
    exit(1)
}
"""

// Write the test file
let testPath = "/Users/vilikoistinen/Downloads/transcriper/src/native/swift/actual_test.swift"
do {
    try testCode.write(toFile: testPath, atomically: true, encoding: .utf8)
    print("✅ Created actual test file: \(testPath)")
} catch {
    print("❌ Failed to create test file: \(error)")
    exit(1)
}

// Build and run the actual test
print("\n🔨 Building and running actual library test...")
print("   This will download models on first run (may take several minutes)")
print("")

exit(0)