import Foundation
import AVFoundation

@available(macOS 14.0, *)
public class UnifiedAudioProcessor: ObservableObject {
    private let whisperKit: WhisperKitManager
    private let fluidAudio: FluidAudioManager
    private let audioCapture: AudioCapture

    // Processing configuration
    public struct ProcessingConfig {
        let enableRealTime: Bool
        let enableSpeakerDiarization: Bool
        let whisperModel: WhisperKitManager.ModelType
        let outputFormat: OutputFormat

        public init(enableRealTime: Bool = false,
                    enableSpeakerDiarization: Bool = true,
                    whisperModel: WhisperKitManager.ModelType = .base,
                    outputFormat: OutputFormat = .segmented) {
            self.enableRealTime = enableRealTime
            self.enableSpeakerDiarization = enableSpeakerDiarization
            self.whisperModel = whisperModel
            self.outputFormat = outputFormat
        }

        public static let `default` = ProcessingConfig()
    }

    public enum OutputFormat {
        case simple          // Just text
        case segmented      // Text with timestamps
        case speakerSegmented // Text with timestamps and speaker IDs
    }

    private let config: ProcessingConfig
    private var isInitialized = false
    private var isProcessing = false

    public init(configuration: ProcessingConfig = .default) {
        self.config = configuration

        // Initialize managers with appropriate configurations
        self.whisperKit = WhisperKitManager(modelType: configuration.whisperModel)
        self.fluidAudio = FluidAudioManager(configuration: .default)
        self.audioCapture = AudioCapture()

        print("🎯 UnifiedAudioProcessor initialized")
        print("   Real-time: \(configuration.enableRealTime)")
        print("   Speaker Diarization: \(configuration.enableSpeakerDiarization)")
        print("   Whisper Model: \(configuration.whisperModel.displayName)")
        print("   Output Format: \(configuration.outputFormat)")
    }

    // MARK: - Initialization

    public func initialize() async throws {
        guard !isInitialized else {
            print("✅ UnifiedAudioProcessor already initialized")
            return
        }

        print("🔄 Initializing UnifiedAudioProcessor components...")

        do {
            // Initialize WhisperKit
            print("1️⃣ Initializing WhisperKit...")
            try await whisperKit.initialize()

            // Initialize FluidAudio if speaker diarization is enabled
            if config.enableSpeakerDiarization {
                print("2️⃣ Initializing FluidAudio...")
                try await fluidAudio.initialize()
            } else {
                print("2️⃣ Skipping FluidAudio (speaker diarization disabled)")
            }

            // Verify audio capture is ready
            print("3️⃣ Verifying audio capture...")
            let hasPermissions = audioCapture.requestPermissions()
            guard hasPermissions else {
                throw UnifiedProcessorError.permissionsRequired
            }

            isInitialized = true
            print("✅ UnifiedAudioProcessor initialization complete!")

        } catch {
            print("❌ UnifiedAudioProcessor initialization failed: \(error)")
            throw UnifiedProcessorError.initializationFailed(error.localizedDescription)
        }
    }

    // MARK: - Audio Processing Methods

    public func processAudioFile(path: String) async throws -> UnifiedProcessingResult {
        guard isInitialized else {
            throw UnifiedProcessorError.notInitialized
        }

        guard !isProcessing else {
            throw UnifiedProcessorError.alreadyProcessing
        }

        isProcessing = true
        defer { isProcessing = false }

        let startTime = Date()
        print("🎵 Starting unified audio processing for: \(URL(fileURLWithPath: path).lastPathComponent)")

        do {
            // Step 1: Perform transcription
            print("1️⃣ Running transcription...")
            let transcriptionResult = try await whisperKit.transcribeAudio(audioPath: path)

            var speakerSegments: [UnifiedSpeakerSegment] = []

            // Step 2: Perform speaker diarization if enabled
            if config.enableSpeakerDiarization {
                print("2️⃣ Running speaker diarization...")
                let diarizationResult = try await fluidAudio.performDiarization(audioPath: path)

                // Step 3: Merge transcription and diarization results
                print("3️⃣ Merging results...")
                speakerSegments = try mergeTranscriptionAndDiarization(
                    transcription: transcriptionResult,
                    diarization: diarizationResult
                )
            } else {
                // Convert transcription segments to unified format without speaker info
                speakerSegments = transcriptionResult.segments.map { segment in
                    UnifiedSpeakerSegment(
                        text: segment.text,
                        startTime: segment.startTime,
                        endTime: segment.endTime,
                        speakerId: nil,
                        confidence: segment.confidence
                    )
                }
            }

            let processingTime = Date().timeIntervalSince(startTime)
            let result = UnifiedProcessingResult(
                text: transcriptionResult.text,
                language: transcriptionResult.language,
                segments: speakerSegments,
                totalSpeakers: config.enableSpeakerDiarization ?
                    Set(speakerSegments.compactMap { $0.speakerId }).count : 0,
                processingTime: processingTime,
                success: true
            )

            print("✅ Unified processing completed in \(String(format: "%.2f", processingTime))s")
            print("   Text: \(transcriptionResult.text.count) characters")
            print("   Segments: \(speakerSegments.count)")
            print("   Speakers: \(result.totalSpeakers)")

            return result

        } catch {
            print("❌ Unified processing failed: \(error)")
            throw UnifiedProcessorError.processingFailed(error.localizedDescription)
        }
    }

    public func processAudioBuffer(_ buffer: AVAudioPCMBuffer) async throws -> UnifiedProcessingResult {
        guard isInitialized else {
            throw UnifiedProcessorError.notInitialized
        }

        guard !isProcessing else {
            throw UnifiedProcessorError.alreadyProcessing
        }

        isProcessing = true
        defer { isProcessing = false }

        let startTime = Date()
        print("🎵 Starting optimized unified buffer processing...")

        do {
            // Convert buffer to float array for processing
            let audioSamples = bufferToFloatArray(buffer)
            
            if config.enableSpeakerDiarization {
                // Step 1: Use FluidAudio for VAD + Diarization
                print("1️⃣ Running VAD + Speaker Diarization...")
                let processedSegments = try await fluidAudio.processAudioForTranscription(audioSamples: audioSamples)
                
                // Early exit if no voice detected
                if processedSegments.isEmpty {
                    print("🔇 No voice activity detected, skipping transcription")
                    return UnifiedProcessingResult(
                        text: "",
                        language: "en",
                        segments: [],
                        totalSpeakers: 0,
                        processingTime: Date().timeIntervalSince(startTime),
                        success: true
                    )
                }
                
                print("2️⃣ Transcribing \(processedSegments.count) voice segments...")
                
                var speakerSegments: [UnifiedSpeakerSegment] = []
                
                // Step 2: Transcribe each segment with WhisperKit
                for (index, segment) in processedSegments.enumerated() {
                    print("   Transcribing segment \(index + 1)/\(processedSegments.count) (Speaker: \(segment.speakerId))")
                    
                    // Convert segment audio to buffer for WhisperKit
                    let segmentBuffer = floatArrayToBuffer(segment.audioSamples, sampleRate: 16000)
                    
                    // Transcribe this segment
                    let transcriptionResult = try await whisperKit.transcribeAudioBuffer(segmentBuffer)
                    
                    // Create unified segment with speaker and transcription
                    speakerSegments.append(UnifiedSpeakerSegment(
                        text: transcriptionResult.text,
                        startTime: segment.startTime,
                        endTime: segment.endTime,
                        speakerId: segment.speakerId,
                        confidence: 0.9 // FluidAudio doesn't return confidence per segment
                    ))
                }
                
                // Generate final result with speaker diarization
                let processingTime = Date().timeIntervalSince(startTime)
                let result = UnifiedProcessingResult(
                    text: speakerSegments.map { $0.text }.joined(separator: " "),
                    language: "en",
                    segments: speakerSegments,
                    totalSpeakers: Set(speakerSegments.map { $0.speakerId }).count,
                    processingTime: processingTime,
                    success: true
                )
                
                print("✅ Processing completed in \(String(format: "%.2f", processingTime))s")
                return result
                
            } else {
                // Diarization disabled - just check VAD and transcribe if voice present
                print("1️⃣ Checking for voice activity...")
                let hasVoice = try await fluidAudio.performVAD(audioSamples: audioSamples)
                
                if !hasVoice {
                    print("🔇 No voice detected")
                    return UnifiedProcessingResult(
                        text: "",
                        language: "en",
                        segments: [],
                        totalSpeakers: 0,
                        processingTime: Date().timeIntervalSince(startTime),
                        success: true
                    )
                }
                
                // Transcribe the entire buffer without speaker info
                print("2️⃣ Transcribing audio...")
                let transcriptionResult = try await whisperKit.transcribeAudioBuffer(buffer)
                
                // Convert to unified segments without speaker info
                let speakerSegments = transcriptionResult.segments.map { segment in
                    UnifiedSpeakerSegment(
                        text: segment.text,
                        startTime: segment.startTime,
                        endTime: segment.endTime,
                        speakerId: nil,
                        confidence: segment.confidence
                    )
                }
                
                // Generate final result without diarization
                let processingTime = Date().timeIntervalSince(startTime)
                let result = UnifiedProcessingResult(
                    text: transcriptionResult.text,
                    language: transcriptionResult.language,
                    segments: speakerSegments,
                    totalSpeakers: 0,
                    processingTime: processingTime,
                    success: true
                )
                
                print("✅ Processing completed in \(String(format: "%.2f", processingTime))s")
                return result
            }
            
        } catch {
            print("❌ Unified buffer processing failed: \(error)")
            throw UnifiedProcessorError.processingFailed(error.localizedDescription)
        }
    }

    // MARK: - Real-time Processing
    // Note: Real-time processing will be implemented in a future version

    // MARK: - Result Merging Logic

    private func mergeTranscriptionAndDiarization(
        transcription: WhisperKitTranscriptionResult,
        diarization: FluidAudioDiarizationResult
    ) throws -> [UnifiedSpeakerSegment] {

        print("🔗 Merging transcription (\(transcription.segments.count) segments) " +
              "with diarization (\(diarization.speakers.count) speakers)")

        var mergedSegments: [UnifiedSpeakerSegment] = []

        // Algorithm: For each transcription segment, find the overlapping speaker segment(s)
        for transcriptSegment in transcription.segments {
            let segmentMidpoint = (transcriptSegment.startTime + transcriptSegment.endTime) / 2

            // Find the speaker segment that contains the midpoint of this transcription segment
            let matchingSpeaker = diarization.speakers.first { speakerSegment in
                speakerSegment.startTime <= segmentMidpoint && segmentMidpoint <= speakerSegment.endTime
            }

            let unifiedSegment = UnifiedSpeakerSegment(
                text: transcriptSegment.text,
                startTime: transcriptSegment.startTime,
                endTime: transcriptSegment.endTime,
                speakerId: matchingSpeaker?.speakerId,
                confidence: min(transcriptSegment.confidence, matchingSpeaker?.confidence ?? 1.0)
            )

            mergedSegments.append(unifiedSegment)
        }

        // Handle case where we have speaker segments but no transcription
        if transcription.segments.isEmpty && !diarization.speakers.isEmpty {
            // Create segments based on speaker diarization only
            for speakerSegment in diarization.speakers {
                let unifiedSegment = UnifiedSpeakerSegment(
                    text: "", // No transcription available
                    startTime: speakerSegment.startTime,
                    endTime: speakerSegment.endTime,
                    speakerId: speakerSegment.speakerId,
                    confidence: speakerSegment.confidence
                )
                mergedSegments.append(unifiedSegment)
            }
        }

        // Sort by start time
        mergedSegments.sort { $0.startTime < $1.startTime }

        print("✅ Merged into \(mergedSegments.count) unified segments")
        return mergedSegments
    }

    // MARK: - Utility Methods

    public func getSystemInfo() -> UnifiedProcessorInfo {
        return UnifiedProcessorInfo(
            isInitialized: isInitialized,
            isProcessing: isProcessing,
            whisperModel: whisperKit.getModelInfo(),
            fluidAudioInfo: config.enableSpeakerDiarization ? fluidAudio.getModelInfo() : nil,
            configuration: config
        )
    }

    public func getCapabilities() -> ProcessingCapabilities {
        return ProcessingCapabilities(
            supportsRealTime: config.enableRealTime,
            supportsSpeakerDiarization: config.enableSpeakerDiarization,
            supportsMultipleLanguages: true, // WhisperKit supports multiple languages
            maxAudioLength: 3600, // 1 hour max (reasonable limit)
            supportedFormats: ["wav", "mp3", "m4a", "aiff"]
        )
    }
    
    // MARK: - Helper Methods
    
    private func bufferToFloatArray(_ buffer: AVAudioPCMBuffer) -> [Float] {
        guard let floatData = buffer.floatChannelData else { return [] }
        
        let channelCount = Int(buffer.format.channelCount)
        let frameLength = Int(buffer.frameLength)
        var floatArray = [Float]()
        
        // If mono, just copy the data
        if channelCount == 1 {
            floatArray = Array(UnsafeBufferPointer(start: floatData[0], count: frameLength))
        } else {
            // If stereo or more, mix down to mono
            for frame in 0..<frameLength {
                var mixedSample: Float = 0
                for channel in 0..<channelCount {
                    mixedSample += floatData[channel][frame]
                }
                floatArray.append(mixedSample / Float(channelCount))
            }
        }
        
        return floatArray
    }
    
    private func floatArrayToBuffer(_ floatArray: [Float], sampleRate: Double) -> AVAudioPCMBuffer {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(floatArray.count))!
        
        buffer.frameLength = AVAudioFrameCount(floatArray.count)
        
        if let channelData = buffer.floatChannelData {
            for (index, sample) in floatArray.enumerated() {
                channelData[0][index] = sample
            }
        }
        
        return buffer
    }

    // MARK: - Cleanup

    deinit {
        print("♻️ UnifiedAudioProcessor deallocated")
    }
}

// MARK: - Data Structures

public struct UnifiedProcessingResult {
    public let text: String
    public let language: String?
    public let segments: [UnifiedSpeakerSegment]
    public let totalSpeakers: Int
    public let processingTime: Double
    public let success: Bool
    public let error: String?

    public init(text: String, language: String?, segments: [UnifiedSpeakerSegment],
                totalSpeakers: Int, processingTime: Double, success: Bool, error: String? = nil) {
        self.text = text
        self.language = language
        self.segments = segments
        self.totalSpeakers = totalSpeakers
        self.processingTime = processingTime
        self.success = success
        self.error = error
    }
}

public struct UnifiedSpeakerSegment {
    public let text: String
    public let startTime: Double
    public let endTime: Double
    public let speakerId: String?
    public let confidence: Double

    public init(text: String, startTime: Double, endTime: Double, speakerId: String?, confidence: Double) {
        self.text = text
        self.startTime = startTime
        self.endTime = endTime
        self.speakerId = speakerId
        self.confidence = confidence
    }
}

public struct UnifiedProcessorInfo {
    public let isInitialized: Bool
    public let isProcessing: Bool
    public let whisperModel: ModelInfo
    public let fluidAudioInfo: FluidAudioModelInfo?
    public let configuration: UnifiedAudioProcessor.ProcessingConfig
}

public struct ProcessingCapabilities {
    public let supportsRealTime: Bool
    public let supportsSpeakerDiarization: Bool
    public let supportsMultipleLanguages: Bool
    public let maxAudioLength: Int // seconds
    public let supportedFormats: [String]
}

// MARK: - Error Types

public enum UnifiedProcessorError: Error, LocalizedError {
    case notInitialized
    case initializationFailed(String)
    case processingFailed(String)
    case alreadyProcessing
    case permissionsRequired
    case realTimeNotEnabled
    case notImplemented(String)
    case invalidConfiguration

    public var errorDescription: String? {
        switch self {
        case .notInitialized:
            return "UnifiedAudioProcessor is not initialized"
        case .initializationFailed(let message):
            return "Initialization failed: \(message)"
        case .processingFailed(let message):
            return "Audio processing failed: \(message)"
        case .alreadyProcessing:
            return "Another processing operation is already in progress"
        case .permissionsRequired:
            return "Audio permissions are required"
        case .realTimeNotEnabled:
            return "Real-time processing is not enabled in configuration"
        case .notImplemented(let feature):
            return "Feature not implemented: \(feature)"
        case .invalidConfiguration:
            return "Invalid processor configuration"
        }
    }
}
