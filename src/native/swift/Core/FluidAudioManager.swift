import Foundation
import FluidAudio
import AVFoundation

@available(macOS 14.0, *)
public class FluidAudioManager: ObservableObject {
    private let diarizer = DiarizerManager()
    private var vadManager: VadManager?
    private var isInitialized = false
    private var currentModels: DiarizerModels?

    // Configuration options
    public struct Configuration {
        let sampleRate: Int
        let enableVAD: Bool
        let minSpeakerDuration: Double
        let maxSpeakers: Int

        public init(sampleRate: Int = 16000, enableVAD: Bool = true, minSpeakerDuration: Double = 0.5, maxSpeakers: Int = 10) {
            self.sampleRate = sampleRate
            self.enableVAD = enableVAD
            self.minSpeakerDuration = minSpeakerDuration
            self.maxSpeakers = maxSpeakers
        }

        public static let `default` = Configuration()
    }

    private let config: Configuration

    public init(configuration: Configuration = .default) {
        self.config = configuration
        print("🎭 Initializing FluidAudioManager")
        print("   Sample Rate: \(configuration.sampleRate) Hz")
        print("   VAD Enabled: \(configuration.enableVAD)")
        print("   Min Speaker Duration: \(configuration.minSpeakerDuration)s")
        print("   Max Speakers: \(configuration.maxSpeakers)")
    }

    // MARK: - Initialization

    public func initialize() async throws {
        guard !isInitialized else {
            print("✅ FluidAudio already initialized")
            return
        }

        print("🔄 Initializing FluidAudio models...")

        do {
            // Download models if needed
            print("📥 Downloading FluidAudio models if needed...")
            currentModels = try await DiarizerModels.downloadIfNeeded()

            // Initialize the diarizer with downloaded models
            print("🎯 Initializing diarizer with models...")
            diarizer.initialize(models: currentModels!)
            
            // Initialize VAD Manager with optimized configuration
            if config.enableVAD {
                print("🎙️ Initializing VAD Manager...")
                let vadConfig = VadConfig(
                    threshold: 0.445,  // FluidAudio's validated value (98% accuracy on MUSAN)
                    chunkSize: 512,  // 32ms @ 16kHz - required Silero VAD chunk size
                    sampleRate: config.sampleRate,
                    adaptiveThreshold: false,  // Keep a fixed threshold for predictable behavior
                    enableSNRFiltering: false  // Off: avoids false negatives on compressed meeting audio
                )
                
                vadManager = VadManager(config: vadConfig)
                
                do {
                    try await vadManager?.initialize()
                    print("✅ VAD Manager initialized successfully")
                    print("   Threshold: \(vadConfig.threshold)")
                    print("   SNR filtering: \(vadConfig.enableSNRFiltering ? "enabled" : "disabled")")
                    print("   Models loaded from: ~/Library/Application Support/FluidAudio/Models/")

                    // Sanity check: confirm the CoreML VAD pipeline actually executes.
                    // We deliberately do NOT assert a probability threshold here. Silero VAD
                    // is stateful (STFT → encoder → RNN with a 4-frame temporal warm-up), so a
                    // single isolated chunk — especially a non-speech constant/DC signal — will
                    // legitimately produce a low probability. The previous "model not functioning"
                    // warning was a false alarm caused by testing the model with input it should
                    // reject. A genuine failure surfaces as a thrown error, which we handle below.
                    let warmupChunk = Array(repeating: Float(0), count: vadConfig.chunkSize)
                    let probe = try await vadManager?.processChunk(warmupChunk)
                    if let probe = probe, probe.probability.isFinite {
                        print("✅ Silero VAD CoreML pipeline verified (warm-up prob=\(String(format: "%.3f", probe.probability)))")
                    } else {
                        print("⚠️ VAD warm-up returned no usable result; energy-based detection will back it up")
                    }
                } catch {
                    print("❌ VAD Manager initialization failed: \(error)")
                    print("   Continuing without VAD...")
                    vadManager = nil
                }
            }

            isInitialized = true

            print("✅ FluidAudio initialized successfully!")
            // Validation complete - ready for use

        } catch {
            print("❌ Failed to initialize FluidAudio: \(error)")
            throw FluidAudioError.initializationFailed(error.localizedDescription)
        }
    }


    // MARK: - Speaker Diarization Methods

    public func performDiarization(audioPath: String) async throws -> FluidAudioDiarizationResult {
        print("🎭 Starting speaker diarization for: \(URL(fileURLWithPath: audioPath).lastPathComponent)")
        let audioSamples = try await loadAudioFile(path: audioPath)
        return try await performDiarizationCore(audioSamples: audioSamples, context: "file")
    }

    public func performDiarization(audioBuffer: AVAudioPCMBuffer) async throws -> FluidAudioDiarizationResult {
        print("🎭 Starting buffer diarization...")
        let audioSamples = bufferToFloatArray(audioBuffer)
        return try await performDiarizationCore(audioSamples: audioSamples, context: "buffer")
    }

    private func performDiarizationCore(audioSamples: [Float], context: String) async throws -> FluidAudioDiarizationResult {
        guard isInitialized else {
            throw FluidAudioError.notInitialized
        }

        do {
            // Perform diarization
            let result = try diarizer.performCompleteDiarization(audioSamples, sampleRate: config.sampleRate)

            // Convert to our result format
            let speakerSegments = convertDiarizationResult(result)

            let diarizationResult = FluidAudioDiarizationResult(
                speakers: speakerSegments,
                totalSpeakers: speakerSegments.map { $0.speakerId }.uniqued().count,
                processingTime: 0.0, // FluidAudio doesn't provide this directly
                success: true
            )

            print("✅ \(context.capitalized) diarization completed: \(diarizationResult.totalSpeakers) speakers found")
            return diarizationResult

        } catch {
            print("❌ \(context.capitalized) diarization failed: \(error)")
            throw FluidAudioError.diarizationFailed(error.localizedDescription)
        }
    }

    // MARK: - Optimized Audio Processing Pipeline
    
    public struct ProcessedSegment {
        public let speakerId: String
        public let audioSamples: [Float]
        public let startTime: Double
        public let endTime: Double
    }
    
    // Optimized method that uses VAD to filter before diarization
    public func processAudioForTranscription(audioSamples: [Float]) async throws -> [ProcessedSegment] {
        guard isInitialized else {
            throw FluidAudioError.notInitialized
        }
        
        print("🎯 Starting optimized audio processing...")
        let startTime = Date()
        
        // Step 1: Quick VAD check - does this audio contain voice at all?
        let hasVoice = try await performVAD(audioSamples: audioSamples)
        
        // Early exit if no voice detected
        if !hasVoice {
            print("🔇 No voice activity detected in audio")
            return []
        }
        
        print("🎤 Voice detected, performing speaker diarization...")
        
        // Step 2: Perform diarization to identify speakers and segments
        let diarizationResult = try diarizer.performCompleteDiarization(audioSamples, sampleRate: config.sampleRate)
        
        // Step 3: Convert diarization segments to our format
        let segments = diarizationResult.segments.map { segment in
            let startSample = Int(Double(segment.startTimeSeconds) * Double(config.sampleRate))
            let endSample = min(Int(Double(segment.endTimeSeconds) * Double(config.sampleRate)), audioSamples.count)
            let segmentSamples = Array(audioSamples[startSample..<endSample])
            
            return ProcessedSegment(
                speakerId: segment.speakerId,
                audioSamples: segmentSamples,
                startTime: Double(segment.startTimeSeconds),
                endTime: Double(segment.endTimeSeconds)
            )
        }
        
        let processingTime = Date().timeIntervalSince(startTime)
        let uniqueSpeakers = Set(segments.map { $0.speakerId }).count
        
        print("✅ Audio processing complete in \(String(format: "%.2f", processingTime))s")
        print("   Segments: \(segments.count)")
        print("   Speakers: \(uniqueSpeakers)")
        
        return segments
    }
    
    // MARK: - Real-time Processing
    // Note: Real-time processing will be implemented in a future version

    // MARK: - Voice Activity Detection

    public func performVAD(audioSamples: [Float]) async throws -> Bool {
        guard isInitialized else {
            throw FluidAudioError.notInitialized
        }

        print("🎙️ Performing Voice Activity Detection...")
        
        // Debug: Check first few samples to verify they're in correct range
        if audioSamples.count > 10 {
            let firstSamples = audioSamples.prefix(10).map { String(format: "%.4f", $0) }.joined(separator: ", ")
            print("🔍 First 10 samples: [\(firstSamples)]")
        }
        
        // Debug: Check actual audio levels and characteristics
        let maxAmplitude = audioSamples.map { abs($0) }.max() ?? 0
        let avgAmplitude = audioSamples.map { abs($0) }.reduce(0, +) / Float(audioSamples.count)
        let clippedSamples = audioSamples.filter { abs($0) >= 0.99 }.count
        let clippingRatio = Float(clippedSamples) / Float(audioSamples.count)
        
        print("📊 Audio Analysis:")
        print("   Max amplitude: \(String(format: "%.4f", maxAmplitude))")
        print("   Avg amplitude: \(String(format: "%.6f", avgAmplitude))")
        print("   Clipped samples: \(clippedSamples)/\(audioSamples.count) (\(String(format: "%.1f%%", clippingRatio * 100)))")
        
        // Check for silence or very low audio
        if avgAmplitude < 0.001 {
            print("🔇 Audio is essentially silent (avg < 0.001)")
            return false
        }
        
        // Prepare audio for VAD - handle clipping by scaling down if needed
        var processedSamples = audioSamples
        if clippingRatio > 0.01 {  // More than 1% clipping
            print("⚠️ Audio is clipping! Scaling down by 0.7 to prevent distortion")
            processedSamples = audioSamples.map { $0 * 0.7 }
        }
        
        // Additional diagnostics: check frequency content
        let zeroCrossings = countZeroCrossings(audioSamples)
        let zeroCrossingRate = Float(zeroCrossings) / Float(audioSamples.count)
        print("   Zero crossing rate: \(String(format: "%.4f", zeroCrossingRate))")
        
        // Use proper VadManager if available, otherwise fallback to energy-based
        if let vadManager = vadManager {
            print("🔍 Using Silero VAD model")

            // Use the library's stateful pipeline. processAudioFile() resets the RNN
            // state and processes every 512-sample chunk in order, giving the model the
            // temporal warm-up it needs — unlike a hand-rolled per-chunk loop.
            let results = try await vadManager.processAudioFile(processedSamples)
            let chunksProcessed = results.count
            let voiceChunks = results.filter { $0.isVoiceActive }.count
            let avgConfidence = chunksProcessed > 0
                ? results.map { $0.probability }.reduce(0, +) / Float(chunksProcessed)
                : 0
            let voiceRatio = chunksProcessed > 0 ? Float(voiceChunks) / Float(chunksProcessed) : 0
            var hasVoiceOverall = voiceChunks > 0

            print("📈 VAD Results:")
            print("   Chunks processed: \(chunksProcessed)")
            print("   Voice chunks: \(voiceChunks) (\(String(format: "%.1f%%", voiceRatio * 100)))")
            print("   Avg probability: \(String(format: "%.3f", avgConfidence))")
            print("   Has voice (model): \(hasVoiceOverall)")

            // Safety net: if the model finds no voice but the audio clearly carries
            // energy and speech-like zero-crossings, proceed anyway rather than dropping
            // a potentially valid recording.
            if !hasVoiceOverall && avgAmplitude > 0.02 && zeroCrossingRate > 0.01 {
                print("⚠️ Model reported no voice but audio has clear energy — overriding to voiced")
                hasVoiceOverall = true
            }

            return hasVoiceOverall
        } else {
            // Fallback to energy-based VAD if VadManager not initialized
            print("⚠️ Using fallback energy-based VAD")
            let hasVoice = avgAmplitude > 0.005 && zeroCrossingRate > 0.005
            print("✅ Energy VAD Result: Voice=\(hasVoice), Energy=\(String(format: "%.4f", avgAmplitude)), ZCR=\(String(format: "%.4f", zeroCrossingRate))")
            return hasVoice
        }
    }
    
    // Helper function to count zero crossings (indicates speech vs noise)
    private func countZeroCrossings(_ samples: [Float]) -> Int {
        guard samples.count > 1 else { return 0 }
        
        var crossings = 0
        var previousSample = samples[0]
        
        for i in 1..<min(samples.count, 10000) {  // Check first 10k samples for performance
            let currentSample = samples[i]
            if (previousSample >= 0 && currentSample < 0) || (previousSample < 0 && currentSample >= 0) {
                crossings += 1
            }
            previousSample = currentSample
        }
        
        return crossings
    }

    // Advanced VAD that returns voice segments with timing information
    public func performVADWithSegments(audioSamples: [Float]) async throws -> [VADSegment] {
        guard isInitialized else {
            throw FluidAudioError.notInitialized
        }
        
        print("🎙️ Performing Voice Activity Detection with segmentation...")
        
        if let vadManager = vadManager {
            // Use VadManager for high-accuracy segmentation
            let chunkSize = 512
            let chunkDuration = Double(chunkSize) / Double(config.sampleRate)  // Duration of each chunk in seconds
            var segments: [VADSegment] = []
            var currentSegmentStart: Double? = nil
            
            for (chunkIndex, i) in stride(from: 0, to: audioSamples.count, by: chunkSize).enumerated() {
                let endIndex = min(i + chunkSize, audioSamples.count)
                let chunk = Array(audioSamples[i..<endIndex])
                
                // Pad last chunk if needed
                let paddedChunk: [Float]
                if chunk.count < chunkSize {
                    paddedChunk = chunk + Array(repeating: 0, count: chunkSize - chunk.count)
                } else {
                    paddedChunk = chunk
                }
                
                let vadResult = try await vadManager.processChunk(paddedChunk)
                let currentTime = Double(chunkIndex) * chunkDuration
                
                if vadResult.isVoiceActive {
                    // Voice detected
                    if currentSegmentStart == nil {
                        currentSegmentStart = currentTime
                    }
                } else {
                    // Silence detected
                    if let segmentStart = currentSegmentStart {
                        // End current segment
                        let segment = VADSegment(
                            startTime: segmentStart,
                            endTime: currentTime,
                            confidence: Double(vadResult.probability)
                        )
                        segments.append(segment)
                        currentSegmentStart = nil
                    }
                }
            }
            
            // Close any remaining segment
            if let segmentStart = currentSegmentStart {
                let endTime = Double(audioSamples.count) / Double(config.sampleRate)
                let segment = VADSegment(
                    startTime: segmentStart,
                    endTime: endTime,
                    confidence: 0.9  // High confidence for final segment
                )
                segments.append(segment)
            }
            
            print("✅ VAD Segmentation: Detected \(segments.count) voice segments")
            for (index, segment) in segments.enumerated() {
                print("   Segment \(index + 1): \(String(format: "%.2f", segment.startTime))s - \(String(format: "%.2f", segment.endTime))s (confidence: \(String(format: "%.2f", segment.confidence)))")
            }
            
            return segments
        } else {
            // Fallback to energy-based segmentation
            print("⚠️ Using fallback energy-based VAD segmentation")
            return performEnergyBasedVAD(audioSamples: audioSamples)
        }
    }
    
    // Fallback energy-based VAD implementation
    private func performEnergyBasedVAD(audioSamples: [Float]) -> [VADSegment] {
        let windowSize = Int(Double(config.sampleRate) * 0.025) // 25ms windows
        let hopSize = Int(Double(config.sampleRate) * 0.010)    // 10ms hop
        let energyThreshold: Float = 0.01  // Minimum energy for speech

        var segments: [VADSegment] = []
        var currentSegmentStart: Double? = nil

        for i in stride(from: 0, to: audioSamples.count - windowSize, by: hopSize) {
            let endIndex = min(i + windowSize, audioSamples.count)
            let window = Array(audioSamples[i..<endIndex])

            // Calculate RMS energy
            let squaredSamples = window.map { $0 * $0 }
            let sumSquared = squaredSamples.reduce(0, +)
            let energy = sqrt(sumSquared / Float(window.count))
            let timeStamp = Double(i) / Double(config.sampleRate)

            if energy > energyThreshold {
                // Speech detected
                if currentSegmentStart == nil {
                    currentSegmentStart = timeStamp
                }
            } else {
                // Silence detected
                if let segmentStart = currentSegmentStart {
                    // End current segment
                    let segment = VADSegment(
                        startTime: segmentStart,
                        endTime: timeStamp,
                        confidence: 0.8
                    )
                    segments.append(segment)
                    currentSegmentStart = nil
                }
            }
        }

        // Close any remaining segment
        if let segmentStart = currentSegmentStart {
            let endTime = Double(audioSamples.count) / Double(config.sampleRate)
            let segment = VADSegment(
                startTime: segmentStart,
                endTime: endTime,
                confidence: 0.8
            )
            segments.append(segment)
        }

        print("🎤 Energy-based VAD: Detected \(segments.count) segments")
        return segments
    }

    // MARK: - Utility Methods

    private func loadAudioFile(path: String) async throws -> [Float] {
        let audioURL = URL(fileURLWithPath: path)

        guard FileManager.default.fileExists(atPath: path) else {
            throw FluidAudioError.fileNotFound(path)
        }

        do {
            // Load audio file using AVAudioFile
            let audioFile = try AVAudioFile(forReading: audioURL)
            let audioFormat = audioFile.processingFormat

            // Create buffer to hold the entire file
            guard let buffer = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: AVAudioFrameCount(audioFile.length)) else {
                throw FluidAudioError.audioProcessingFailed("Could not create audio buffer")
            }

            // Read the entire file
            try audioFile.read(into: buffer)

            // Convert to mono if necessary and resample to target sample rate
            let monoSamples = convertToMono(buffer: buffer)
            let resampledSamples = try resampleAudio(samples: monoSamples,
                                                    fromSampleRate: audioFormat.sampleRate,
                                                    toSampleRate: Double(config.sampleRate))

            print("📊 Audio loaded: \(resampledSamples.count) samples at \(config.sampleRate) Hz")
            return resampledSamples

        } catch {
            throw FluidAudioError.audioProcessingFailed("Failed to load audio file: \(error.localizedDescription)")
        }
    }

    private func bufferToFloatArray(_ buffer: AVAudioPCMBuffer) -> [Float] {
        guard let floatChannelData = buffer.floatChannelData else {
            return []
        }

        let channelData = floatChannelData[0]
        let frameLength = Int(buffer.frameLength)

        return Array(UnsafeBufferPointer(start: channelData, count: frameLength))
    }

    private func convertToMono(buffer: AVAudioPCMBuffer) -> [Float] {
        guard let floatChannelData = buffer.floatChannelData else {
            return []
        }

        let frameLength = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)

        if channelCount == 1 {
            // Already mono
            return Array(UnsafeBufferPointer(start: floatChannelData[0], count: frameLength))
        } else {
            // Convert stereo to mono by averaging channels
            var monoSamples: [Float] = []
            monoSamples.reserveCapacity(frameLength)

            for frame in 0..<frameLength {
                var sum: Float = 0.0
                for channel in 0..<channelCount {
                    sum += floatChannelData[channel][frame]
                }
                monoSamples.append(sum / Float(channelCount))
            }

            return monoSamples
        }
    }

    private func resampleAudio(samples: [Float], fromSampleRate: Double, toSampleRate: Double) throws -> [Float] {
        if abs(fromSampleRate - toSampleRate) < 0.1 {
            // Sample rates are essentially the same
            return samples
        }

        // Simple linear interpolation resampling
        // For production, consider using a more sophisticated resampling algorithm
        let ratio = toSampleRate / fromSampleRate
        let outputLength = Int(Double(samples.count) * ratio)
        var resampledSamples: [Float] = []
        resampledSamples.reserveCapacity(outputLength)

        for i in 0..<outputLength {
            let sourceIndex = Double(i) / ratio
            let index = Int(sourceIndex)
            let fraction = sourceIndex - Double(index)

            if index + 1 < samples.count {
                let sample = samples[index] * Float(1.0 - fraction) + samples[index + 1] * Float(fraction)
                resampledSamples.append(sample)
            } else if index < samples.count {
                resampledSamples.append(samples[index])
            }
        }

        print("🔄 Resampled audio: \(samples.count) -> \(resampledSamples.count) samples (\(fromSampleRate) -> \(toSampleRate) Hz)")
        return resampledSamples
    }

    private func convertDiarizationResult(_ result: DiarizationResult) -> [FluidAudioSpeakerSegment] {
        // Convert FluidAudio's result format to our internal format
        print("🔄 Converting FluidAudio diarization result with \(result.segments.count) segments")

        let segments = result.segments.map { segment in
            FluidAudioSpeakerSegment(
                speakerId: segment.speakerId,
                startTime: Double(segment.startTimeSeconds),
                endTime: Double(segment.endTimeSeconds),
                confidence: Double(segment.qualityScore)
            )
        }

        print("✅ Converted \(segments.count) FluidAudio segments")
        return segments
    }


    // MARK: - Model Information
    
    public func getModelInfo() -> FluidAudioModelInfo {
        let vadInfo = vadManager != nil ? "VadManager (98% accuracy)" : "Energy-based VAD (fallback)"
        return FluidAudioModelInfo(
            isInitialized: isInitialized,
            vadAccuracy: vadInfo,
            diarizationError: "None",
            memoryUsage: "~50MB"
        )
    }
    
    // MARK: - Cleanup

    deinit {
        print("♻️ FluidAudioManager deallocated")
    }
}

// MARK: - Data Structures

public struct FluidAudioDiarizationResult {
    public let speakers: [FluidAudioSpeakerSegment]
    public let totalSpeakers: Int
    public let processingTime: Double
    public let success: Bool
    public let error: String?

    public init(speakers: [FluidAudioSpeakerSegment], totalSpeakers: Int, processingTime: Double, success: Bool, error: String? = nil) {
        self.speakers = speakers
        self.totalSpeakers = totalSpeakers
        self.processingTime = processingTime
        self.success = success
        self.error = error
    }
}

public struct FluidAudioSpeakerSegment {
    public let speakerId: String
    public let startTime: Double
    public let endTime: Double
    public let confidence: Double

    public init(speakerId: String, startTime: Double, endTime: Double, confidence: Double) {
        self.speakerId = speakerId
        self.startTime = startTime
        self.endTime = endTime
        self.confidence = confidence
    }
}

public struct VADSegment {
    public let startTime: Double
    public let endTime: Double
    public let confidence: Double

    public init(startTime: Double, endTime: Double, confidence: Double) {
        self.startTime = startTime
        self.endTime = endTime
        self.confidence = confidence
    }
}

public struct FluidAudioModelInfo {
    public let isInitialized: Bool
    public let vadAccuracy: String
    public let diarizationError: String
    public let memoryUsage: String
}

// MARK: - Error Types

public enum FluidAudioError: Error, LocalizedError {
    case notInitialized
    case initializationFailed(String)
    case diarizationFailed(String)
    case vadFailed(String)
    case notImplemented(String)
    case fileNotFound(String)
    case audioProcessingFailed(String)
    case invalidConfiguration

    public var errorDescription: String? {
        switch self {
        case .notInitialized:
            return "FluidAudio is not initialized"
        case .initializationFailed(let message):
            return "FluidAudio initialization failed: \(message)"
        case .diarizationFailed(let message):
            return "Speaker diarization failed: \(message)"
        case .vadFailed(let message):
            return "Voice Activity Detection failed: \(message)"
        case .notImplemented(let feature):
            return "Feature not implemented: \(feature)"
        case .fileNotFound(let path):
            return "Audio file not found: \(path)"
        case .audioProcessingFailed(let message):
            return "Audio processing failed: \(message)"
        case .invalidConfiguration:
            return "Invalid FluidAudio configuration"
        }
    }
}

// MARK: - Extensions

extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen: Set<Element> = []
        return filter { seen.insert($0).inserted }
    }
}
