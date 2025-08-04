# 🎯 VAD Migration Plan: From Fallback to FluidAudio VadManager

## Problem Statement
Currently using energy-based VAD fallback that:
- Processes silence unnecessarily
- Creates [BLANK_AUDIO] segments
- Wastes 30-50% processing time
- Causes transcription hallucinations

## Solution: Implement Proper VadManager

### Step 1: Update FluidAudioManager.swift
```swift
// Location: src/native/swift/Core/FluidAudioManager.swift
// Line: ~117-140

public func performVAD(audioSamples: [Float]) async throws -> [VADSegment] {
    guard isInitialized else {
        throw FluidAudioError.notInitialized
    }
    
    print("🎙️ Performing Voice Activity Detection...")
    
    do {
        // REMOVE THIS:
        // print("⚠️ Using fallback energy-based VAD (VadManager integration pending)")
        // return performEnergyBasedVAD(audioSamples: audioSamples)
        
        // ADD THIS:
        let vadConfig = VadConfig.optimized // 98% accuracy from FluidAudio docs
        let vadManager = VadManager(config: vadConfig)
        try await vadManager.initialize()
        
        // Process audio through VadManager
        let vadResult = try await vadManager.detectVoiceActivity(audioSamples)
        
        // Convert to our segment format
        let segments = vadResult.voiceSegments.map { segment in
            VADSegment(
                startTime: segment.startTime,
                endTime: segment.endTime,
                confidence: segment.confidence
            )
        }
        
        print("✅ VadManager VAD: Detected \(segments.count) voice segments")
        return segments
        
    } catch {
        print("⚠️ VadManager failed, falling back to energy-based VAD: \(error)")
        // Keep fallback as safety net
        return performEnergyBasedVAD(audioSamples: audioSamples)
    }
}
```

### Step 2: Add VAD to UnifiedAudioProcessor Pipeline
```swift
// Location: src/native/swift/Core/UnifiedAudioProcessor.swift
// Line: ~180-200

public func processAudioBuffer(_ buffer: AVAudioPCMBuffer) async throws -> UnifiedProcessingResult {
    // ... existing code ...
    
    do {
        // NEW: Perform VAD first
        let audioSamples = bufferToFloatArray(buffer)
        let vadSegments = try await fluidAudio.performVAD(audioSamples)
        
        // Filter out silence
        if vadSegments.isEmpty {
            print("🔇 No voice detected, skipping transcription")
            return UnifiedProcessingResult(
                text: "",
                segments: [],
                success: true
            )
        }
        
        // Extract only voice segments for transcription
        let voiceOnlyBuffer = extractVoiceSegments(buffer, vadSegments)
        
        // Continue with transcription on voice-only audio
        let transcriptionResult = try await whisperKit.transcribeAudioBuffer(voiceOnlyBuffer)
        
        // ... rest of existing code ...
    }
}
```

### Step 3: Add Voice Extraction Helper
```swift
// Location: src/native/swift/Core/UnifiedAudioProcessor.swift
// Add new method

private func extractVoiceSegments(_ buffer: AVAudioPCMBuffer, _ vadSegments: [VADSegment]) -> AVAudioPCMBuffer {
    let format = buffer.format
    let sampleRate = format.sampleRate
    
    // Calculate total voice duration
    let totalVoiceDuration = vadSegments.reduce(0.0) { $0 + ($1.endTime - $1.startTime) }
    let frameCount = AVAudioFrameCount(totalVoiceDuration * sampleRate)
    
    guard let voiceBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
        return buffer // Fallback to original if allocation fails
    }
    
    // Copy only voice segments
    var writePosition: AVAudioFrameCount = 0
    for segment in vadSegments {
        let startFrame = AVAudioFrameCount(segment.startTime * sampleRate)
        let endFrame = AVAudioFrameCount(segment.endTime * sampleRate)
        let segmentLength = endFrame - startFrame
        
        // Copy segment to voice buffer
        for channel in 0..<Int(format.channelCount) {
            let sourcePtr = buffer.floatChannelData![channel].advanced(by: Int(startFrame))
            let destPtr = voiceBuffer.floatChannelData![channel].advanced(by: Int(writePosition))
            destPtr.assign(from: sourcePtr, count: Int(segmentLength))
        }
        
        writePosition += segmentLength
    }
    
    voiceBuffer.frameLength = writePosition
    return voiceBuffer
}
```

### Step 4: Update Package.swift Dependencies
```swift
// Location: src/native/swift/Package.swift
// Ensure FluidAudio VadManager is available

dependencies: [
    .package(url: "https://github.com/FluidAudio/FluidAudio.git", from: "1.0.0"),
    // Make sure version supports VadManager
]
```

### Step 5: Rebuild Native Library
```bash
# In src/native/swift/
swift build -c release
cp .build/release/libTranscriperNative.dylib ./
```

## Testing Plan

### 1. Unit Test VAD
```swift
func testVADFiltersSlience() async {
    let silentAudio = [Float](repeating: 0.0, count: 16000) // 1 second silence
    let segments = try await fluidAudio.performVAD(silentAudio)
    XCTAssertTrue(segments.isEmpty, "VAD should detect no voice in silence")
}

func testVADDetectsVoice() async {
    let voiceAudio = loadTestAudio("speech_sample.wav")
    let segments = try await fluidAudio.performVAD(voiceAudio)
    XCTAssertFalse(segments.isEmpty, "VAD should detect voice in speech")
}
```

### 2. Integration Test
1. Record 30 seconds with 50% silence
2. Verify no [BLANK_AUDIO] in output
3. Measure processing time reduction
4. Check transcription accuracy

### 3. Performance Benchmarks
```typescript
// Before VAD
Processing time: 2000ms for 30s audio
Segments: 15 (including 7 silence)

// After VAD
Processing time: 1200ms for 30s audio (40% faster)
Segments: 8 (only voice)
```

## Rollback Plan
If VadManager causes issues:
1. The code already has fallback to energy-based VAD
2. Can disable VAD temporarily via config flag
3. Previous version tagged in git

## Success Criteria
- [ ] No [BLANK_AUDIO] segments in output
- [ ] 30-50% reduction in processing time for typical meetings
- [ ] No regression in transcription accuracy
- [ ] Fallback works if VadManager fails

## Timeline
- Day 1: Implement VadManager integration
- Day 2: Add to processing pipeline
- Day 3: Testing and benchmarking
- Day 4: Deploy and monitor

## Notes
- VadConfig.optimized claims 98% accuracy in FluidAudio docs
- Consider adding VAD sensitivity to user settings later
- Monitor memory usage - VAD models can be large