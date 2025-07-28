#!/usr/bin/env swift

// Simple integration test for WhisperKit + FluidAudio
import Foundation
import TranscriperCore

@available(macOS 14.0, *)
func testIntegration() async {
    print("🧪 Starting WhisperKit + FluidAudio Integration Test")
    
    do {
        // Test 1: Initialize SwiftAudioBridge
        print("\n1️⃣ Testing SwiftAudioBridge initialization...")
        let bridge = SwiftAudioBridge()
        
        let initSuccess = bridge.initialize()
        if initSuccess {
            print("✅ SwiftAudioBridge initialized successfully")
        } else {
            print("❌ SwiftAudioBridge initialization failed")
            return
        }
        
        // Test 2: Get system info
        print("\n2️⃣ Testing system info retrieval...")
        let systemInfo = bridge.getSystemInfo()
        print("System Info: \(systemInfo)")
        
        // Test 3: Get available models
        print("\n3️⃣ Testing available models...")
        let modelsInfo = bridge.getAvailableModels()
        print("Available Models: \(modelsInfo)")
        
        // Test 4: Test basic components individually
        print("\n4️⃣ Testing individual components...")
        
        // Test WhisperKit Manager
        print("   Testing WhisperKitManager...")
        let whisperManager = WhisperKitManager(modelType: .tiny) // Use tiny for fast testing
        try await whisperManager.initialize()
        print("   ✅ WhisperKitManager initialized")
        
        // Test FluidAudio Manager
        print("   Testing FluidAudioManager...")
        let fluidManager = FluidAudioManager()
        try await fluidManager.initialize()
        print("   ✅ FluidAudioManager initialized")
        
        // Test Unified Processor
        print("   Testing UnifiedAudioProcessor...")
        let config = UnifiedAudioProcessor.ProcessingConfig(
            enableRealTime: false,
            enableSpeakerDiarization: true,
            whisperModel: .tiny,
            outputFormat: .speakerSegmented
        )
        let processor = UnifiedAudioProcessor(configuration: config)
        try await processor.initialize()
        print("   ✅ UnifiedAudioProcessor initialized")
        
        print("\n✅ All integration tests passed!")
        
    } catch {
        print("❌ Integration test failed: \(error)")
    }
}

// Run the test
if #available(macOS 14.0, *) {
    Task {
        await testIntegration()
        exit(0)
    }
    RunLoop.main.run()
} else {
    print("❌ This test requires macOS 14.0 or later")
    exit(1)
}