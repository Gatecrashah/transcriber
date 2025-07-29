import Foundation
import WhisperKit
import AVFoundation

@available(macOS 14.0, *)
public class WhisperKitManager: ObservableObject {
    private var whisperKit: WhisperKit?
    private let config: WhisperKitConfig
    private var isInitialized = false

    // Supported models for different use cases
    public enum ModelType: String, CaseIterable {
        case tiny = "openai_whisper-tiny"
        case base = "openai_whisper-base"
        case small = "openai_whisper-small"
        case medium = "openai_whisper-medium"
        case large = "openai_whisper-large-v3"

        var displayName: String {
            switch self {
            case .tiny: return "Tiny (Fast)"
            case .base: return "Base (Balanced)"
            case .small: return "Small (Good)"
            case .medium: return "Medium (Better)"
            case .large: return "Large-v3 (Best)"
            }
        }

        var memoryRequirement: String {
            switch self {
            case .tiny: return "~40MB"
            case .base: return "~75MB"
            case .small: return "~245MB"
            case .medium: return "~770MB"
            case .large: return "~1.5GB"
            }
        }
    }

    public init(modelType: ModelType = .base) {
        print("🎤 Initializing WhisperKitManager with model: \(modelType.displayName)")

        self.config = WhisperKitConfig(
            model: modelType.rawValue,
            computeOptions: ModelComputeOptions(), // Use default compute options
            verbose: true,
            logLevel: .info,
            prewarm: true,
            load: false, // We'll load manually for better control
            download: true // Auto-download if needed
        )
    }

    // MARK: - Initialization

    public func initialize() async throws {
        guard !isInitialized else {
            print("✅ WhisperKit already initialized")
            return
        }

        print("🔄 Loading WhisperKit model: \(config.model ?? "default")")

        do {
            // Initialize WhisperKit with configuration
            whisperKit = try await WhisperKit(config)
            isInitialized = true

            print("✅ WhisperKit initialized successfully!")
            print("   Model: \(config.model ?? "default")")
            print("   Compute Options: configured")

            // Test basic functionality
            try await validateInitialization()

        } catch {
            print("❌ Failed to initialize WhisperKit: \(error)")
            throw WhisperKitError.initializationFailed(error.localizedDescription)
        }
    }

    private func validateInitialization() async throws {
        guard let whisperKit = whisperKit else {
            throw WhisperKitError.notInitialized
        }

        // Check if model is loaded
        print("🔍 Validating WhisperKit model...")

        // The model should be available now
        if whisperKit.modelState == .loaded {
            print("✅ WhisperKit model validation successful")
        } else {
            print("⚠️ WhisperKit model state: \(whisperKit.modelState)")
        }
    }

    // MARK: - Transcription Methods

    public func transcribeAudio(audioPath: String) async throws -> WhisperKitTranscriptionResult {
        guard isInitialized, let whisperKit = whisperKit else {
            throw WhisperKitError.notInitialized
        }

        print("🎵 Starting transcription for: \(URL(fileURLWithPath: audioPath).lastPathComponent)")

        do {
            let audioURL = URL(fileURLWithPath: audioPath)

            // Perform transcription
            let results = try await whisperKit.transcribe(audioPath: audioURL.path)

            guard let transcriptionResult = results.first else {
                throw WhisperKitError.transcriptionFailed("No transcription result returned")
            }

            // Convert to our result format
            let ourResult = WhisperKitTranscriptionResult(
                text: transcriptionResult.text,
                language: transcriptionResult.language,
                segments: transcriptionResult.segments.map { segment in
                    WhisperKitSegment(
                        text: segment.text,
                        startTime: Double(segment.start),
                        endTime: Double(segment.end),
                        confidence: Double(segment.avgLogprob)
                    )
                },
                processingTime: 0.0, // WhisperKit doesn't provide this directly
                success: true
            )

            print("✅ Transcription completed: \(transcriptionResult.text.count) characters")
            return ourResult

        } catch {
            print("❌ Transcription failed: \(error)")
            throw WhisperKitError.transcriptionFailed(error.localizedDescription)
        }
    }

    public func transcribeAudioBuffer(_ buffer: AVAudioPCMBuffer) async throws -> WhisperKitTranscriptionResult {
        guard isInitialized, let whisperKit = whisperKit else {
            throw WhisperKitError.notInitialized
        }

        print("🎵 Starting buffer transcription...")

        do {
            // Convert buffer to the format WhisperKit expects
            let audioArray = bufferToFloatArray(buffer)

            // Perform transcription on audio samples
            let results = try await whisperKit.transcribe(audioArray: audioArray)

            guard let transcriptionResult = results.first else {
                throw WhisperKitError.transcriptionFailed("No transcription result returned")
            }

            // Convert to our result format
            let ourResult = WhisperKitTranscriptionResult(
                text: transcriptionResult.text,
                language: transcriptionResult.language,
                segments: transcriptionResult.segments.map { segment in
                    WhisperKitSegment(
                        text: segment.text,
                        startTime: Double(segment.start),
                        endTime: Double(segment.end),
                        confidence: Double(segment.avgLogprob)
                    )
                },
                processingTime: 0.0,
                success: true
            )

            print("✅ Buffer transcription completed: \(transcriptionResult.text.count) characters")
            return ourResult

        } catch {
            print("❌ Buffer transcription failed: \(error)")
            throw WhisperKitError.transcriptionFailed(error.localizedDescription)
        }
    }

    // MARK: - Real-time Streaming (Future Enhancement)

    public func startStreamingTranscription() async throws {
        // TODO: Implement real-time streaming transcription
        // This will be implemented in Phase 3 for real-time processing
        print("🚧 Streaming transcription not yet implemented")
        throw WhisperKitError.notImplemented("Streaming transcription")
    }

    // MARK: - Utility Methods

    private func bufferToFloatArray(_ buffer: AVAudioPCMBuffer) -> [Float] {
        guard let floatChannelData = buffer.floatChannelData else {
            return []
        }

        let channelData = floatChannelData[0]
        let frameLength = Int(buffer.frameLength)

        return Array(UnsafeBufferPointer(start: channelData, count: frameLength))
    }

    public func getModelInfo() -> ModelInfo {
        return ModelInfo(
            name: config.model ?? "default",
            isLoaded: whisperKit?.modelState == .loaded,
            memoryUsage: getEstimatedMemoryUsage()
        )
    }

    private func getEstimatedMemoryUsage() -> String {
        guard let modelName = config.model,
              let modelType = ModelType(rawValue: modelName) else {
            return "Unknown"
        }
        return modelType.memoryRequirement
    }

    // MARK: - Cleanup

    deinit {
        print("♻️ WhisperKitManager deallocated")
    }
}

// MARK: - Data Structures

public struct WhisperKitTranscriptionResult {
    public let text: String
    public let language: String?
    public let segments: [WhisperKitSegment]
    public let processingTime: Double
    public let success: Bool
    public let error: String?

    public init(text: String, language: String?, segments: [WhisperKitSegment], processingTime: Double, success: Bool, error: String? = nil) {
        self.text = text
        self.language = language
        self.segments = segments
        self.processingTime = processingTime
        self.success = success
        self.error = error
    }
}

public struct WhisperKitSegment {
    public let text: String
    public let startTime: Double
    public let endTime: Double
    public let confidence: Double

    public init(text: String, startTime: Double, endTime: Double, confidence: Double) {
        self.text = text
        self.startTime = startTime
        self.endTime = endTime
        self.confidence = confidence
    }
}

public struct ModelInfo {
    public let name: String
    public let isLoaded: Bool
    public let memoryUsage: String
}

// MARK: - Error Types

public enum WhisperKitError: Error, LocalizedError {
    case notInitialized
    case initializationFailed(String)
    case transcriptionFailed(String)
    case notImplemented(String)
    case invalidAudioFormat

    public var errorDescription: String? {
        switch self {
        case .notInitialized:
            return "WhisperKit is not initialized"
        case .initializationFailed(let message):
            return "WhisperKit initialization failed: \(message)"
        case .transcriptionFailed(let message):
            return "Transcription failed: \(message)"
        case .notImplemented(let feature):
            return "Feature not implemented: \(feature)"
        case .invalidAudioFormat:
            return "Invalid audio format provided"
        }
    }
}
