import Foundation
import AVFoundation

@available(macOS 14.0, *)
@objc public class SwiftAudioBridge: NSObject {
    private let processor: UnifiedAudioProcessor
    private var isInitialized = false

    @objc public override init() {
        // Initialize with default configuration
        // Configuration can be customized through methods later
        let config = UnifiedAudioProcessor.ProcessingConfig(
            enableRealTime: false, // Start with batch processing
            enableSpeakerDiarization: true,
            whisperModel: .base, // Balanced performance
            outputFormat: .speakerSegmented
        )

        self.processor = UnifiedAudioProcessor(configuration: config)
        super.init()

        print("🌉 SwiftAudioBridge initialized")
    }

    // MARK: - Initialization Methods

    @objc public func initialize() -> Bool {
        guard !isInitialized else {
            print("✅ SwiftAudioBridge already initialized")
            return true
        }

        print("🔄 Initializing SwiftAudioBridge...")

        // Use a synchronous wrapper for the async initialization
        let semaphore = DispatchSemaphore(value: 0)
        var initSuccess = false

        Task {
            do {
                try await processor.initialize()
                initSuccess = true
                self.isInitialized = true
                print("✅ SwiftAudioBridge initialization successful")
            } catch {
                print("❌ SwiftAudioBridge initialization failed: \(error)")
                initSuccess = false
            }
            semaphore.signal()
        }

        // Wait for async initialization to complete
        semaphore.wait()
        return initSuccess
    }

    @objc public func isReady() -> Bool {
        return isInitialized
    }

    // MARK: - Audio Processing Methods

    @objc public func processAudioFile(_ filePath: String) -> String {
        guard isInitialized else {
            return createErrorResponse("SwiftAudioBridge not initialized")
        }

        guard FileManager.default.fileExists(atPath: filePath) else {
            return createErrorResponse("Audio file not found: \(filePath)")
        }

        print("🎵 Processing audio file via bridge: \(URL(fileURLWithPath: filePath).lastPathComponent)")

        // Use semaphore for synchronous processing
        let semaphore = DispatchSemaphore(value: 0)
        var result: UnifiedProcessingResult?
        var processingError: Error?

        Task {
            do {
                result = try await processor.processAudioFile(path: filePath)
            } catch {
                processingError = error
            }
            semaphore.signal()
        }

        semaphore.wait()

        if let error = processingError {
            print("❌ Processing failed: \(error)")
            return createErrorResponse(error.localizedDescription)
        }

        guard let processingResult = result else {
            return createErrorResponse("Unknown processing error")
        }

        // Convert result to JSON string for TypeScript consumption
        return convertResultToJSON(processingResult)
    }

    @objc public func processAudioBuffer(_ audioData: Data, sampleRate: Int, channels: Int) -> String {
        guard isInitialized else {
            return createErrorResponse("SwiftAudioBridge not initialized")
        }

        print("🎵 Processing audio buffer via bridge: \(audioData.count) bytes")

        do {
            // Convert Data to AVAudioPCMBuffer
            let buffer = try createAudioBuffer(from: audioData, sampleRate: sampleRate, channels: channels)

            // Use semaphore for synchronous processing
            let semaphore = DispatchSemaphore(value: 0)
            var result: UnifiedProcessingResult?
            var processingError: Error?

            Task {
                do {
                    result = try await processor.processAudioBuffer(buffer)
                } catch {
                    processingError = error
                }
                semaphore.signal()
            }

            semaphore.wait()

            if let error = processingError {
                print("❌ Buffer processing failed: \(error)")
                return createErrorResponse(error.localizedDescription)
            }

            guard let processingResult = result else {
                return createErrorResponse("Unknown buffer processing error")
            }

            return convertResultToJSON(processingResult)

        } catch {
            print("❌ Audio buffer creation failed: \(error)")
            return createErrorResponse("Audio buffer creation failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Configuration Methods

    @objc public func updateConfiguration(_ configJSON: String) -> Bool {
        print("🔧 Updating configuration: \(configJSON)")

        // TODO: Parse JSON configuration and create new processor if needed
        // For now, return success
        print("⚠️ Configuration updates not yet implemented")
        return true
    }

    @objc public func getSystemInfo() -> String {
        guard isInitialized else {
            return createErrorResponse("SwiftAudioBridge not initialized")
        }

        let info = processor.getSystemInfo()

        let systemInfo: [String: Any] = [
            "isInitialized": info.isInitialized,
            "isProcessing": info.isProcessing,
            "whisperModel": [
                "name": info.whisperModel.name,
                "isLoaded": info.whisperModel.isLoaded,
                "memoryUsage": info.whisperModel.memoryUsage
            ],
            "fluidAudio": info.fluidAudioInfo.map { fluidInfo in
                [
                    "isInitialized": fluidInfo.isInitialized,
                    "vadAccuracy": fluidInfo.vadAccuracy,
                    "diarizationError": fluidInfo.diarizationError,
                    "memoryUsage": fluidInfo.memoryUsage
                ] as [String: Any]
            } as Any,
            "capabilities": [
                "supportsRealTime": processor.getCapabilities().supportsRealTime,
                "supportsSpeakerDiarization": processor.getCapabilities().supportsSpeakerDiarization,
                "supportsMultipleLanguages": processor.getCapabilities().supportsMultipleLanguages,
                "maxAudioLength": processor.getCapabilities().maxAudioLength,
                "supportedFormats": processor.getCapabilities().supportedFormats
            ]
        ]

        return convertToJSON(systemInfo) ?? createErrorResponse("Failed to serialize system info")
    }

    @objc public func getAvailableModels() -> String {
        let models = WhisperKitManager.ModelType.allCases.map { model in
            return [
                "id": model.rawValue,
                "name": model.displayName,
                "memoryRequirement": model.memoryRequirement
            ]
        }

        let response: [String: Any] = [
            "success": true,
            "models": models
        ]

        return convertToJSON(response) ?? createErrorResponse("Failed to serialize models")
    }

    // MARK: - Real-time Methods (Future Implementation)

    @objc public func startRealtimeProcessing() -> Bool {
        guard isInitialized else {
            print("❌ Cannot start real-time processing: not initialized")
            return false
        }

        print("🚧 Real-time processing not yet implemented")
        return false
    }

    @objc public func stopRealtimeProcessing() -> Bool {
        print("🚧 Real-time processing not yet implemented")
        return false
    }

    @objc public func getRealtimeResults() -> String {
        print("🚧 Real-time processing not yet implemented")
        return createErrorResponse("Real-time processing not implemented")
    }

    // MARK: - Utility Methods

    private func createAudioBuffer(from data: Data, sampleRate: Int, channels: Int) throws -> AVAudioPCMBuffer {
        // Create audio format
        guard let format = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: AVAudioChannelCount(channels)) else {
            throw BridgeError.invalidAudioFormat
        }

        // Calculate frame count (assuming 32-bit float samples)
        let frameCount = data.count / (channels * MemoryLayout<Float>.size)

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount)) else {
            throw BridgeError.bufferCreationFailed
        }

        // Copy audio data into buffer
        data.withUnsafeBytes { rawBytes in
            let floatBytes = rawBytes.bindMemory(to: Float.self)
            for channel in 0..<channels {
                let channelData = buffer.floatChannelData![channel]
                for frame in 0..<frameCount {
                    channelData[frame] = floatBytes[frame * channels + channel]
                }
            }
        }

        buffer.frameLength = AVAudioFrameCount(frameCount)
        return buffer
    }

    private func convertResultToJSON(_ result: UnifiedProcessingResult) -> String {
        let segments = result.segments.map { segment in
            var segmentDict: [String: Any] = [
                "text": segment.text,
                "startTime": segment.startTime,
                "endTime": segment.endTime,
                "confidence": segment.confidence
            ]

            if let speakerId = segment.speakerId {
                segmentDict["speakerId"] = speakerId
            }

            return segmentDict
        }

        let responseDict: [String: Any] = [
            "success": result.success,
            "text": result.text,
            "language": result.language ?? "unknown",
            "segments": segments,
            "totalSpeakers": result.totalSpeakers,
            "processingTime": result.processingTime,
            "error": result.error as Any
        ]

        return convertToJSON(responseDict) ?? createErrorResponse("Failed to serialize result")
    }

    private func convertToJSON(_ object: [String: Any]) -> String? {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted])
            return String(data: jsonData, encoding: .utf8)
        } catch {
            print("❌ JSON serialization failed: \(error)")
            return nil
        }
    }

    private func createErrorResponse(_ message: String) -> String {
        let errorDict: [String: Any] = [
            "success": false,
            "error": message,
            "text": "",
            "segments": [],
            "totalSpeakers": 0,
            "processingTime": 0.0
        ]

        return convertToJSON(errorDict) ?? "{\"success\":false,\"error\":\"JSON serialization failed\"}"
    }

    // MARK: - Legacy Compatibility (for gradual migration)

    @objc public func checkPermissions() -> Bool {
        // Delegate to existing AudioCapture functionality
        let audioCapture = AudioCapture()
        return audioCapture.requestPermissions()
    }

    @objc public func startRecording() -> Bool {
        // For now, delegate to existing AudioCapture
        // TODO: Integrate with UnifiedAudioProcessor for real-time processing
        let audioCapture = AudioCapture()
        return audioCapture.startSystemAudioRecording()
    }

    @objc public func stopRecording() -> String? {
        // For now, delegate to existing AudioCapture
        // TODO: Integrate with UnifiedAudioProcessor
        let audioCapture = AudioCapture()
        return audioCapture.stopRecording()
    }

    // MARK: - Cleanup

    deinit {
        print("♻️ SwiftAudioBridge deallocated")
    }
}

// MARK: - Error Types

enum BridgeError: Error, LocalizedError {
    case invalidAudioFormat
    case bufferCreationFailed
    case processingFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidAudioFormat:
            return "Invalid audio format provided"
        case .bufferCreationFailed:
            return "Failed to create audio buffer"
        case .processingFailed(let message):
            return "Processing failed: \(message)"
        }
    }
}
