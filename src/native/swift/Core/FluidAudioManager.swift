import Foundation
import FluidAudio
import AVFoundation

@available(macOS 14.0, *)
public class FluidAudioManager: ObservableObject {
    private let diarizer = DiarizerManager()
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
            
            isInitialized = true
            
            print("✅ FluidAudio initialized successfully!")
            try await validateInitialization()
            
        } catch {
            print("❌ Failed to initialize FluidAudio: \(error)")
            throw FluidAudioError.initializationFailed(error.localizedDescription)
        }
    }
    
    private func validateInitialization() async throws {
        guard isInitialized else {
            throw FluidAudioError.notInitialized
        }
        
        print("🔍 Validating FluidAudio initialization...")
        
        // Create a small test audio buffer to verify functionality
        let testSamples: [Float] = Array(repeating: 0.0, count: config.sampleRate) // 1 second of silence
        
        do {
            // Test basic diarization functionality
            _ = try diarizer.performCompleteDiarization(testSamples, sampleRate: config.sampleRate)
            print("✅ FluidAudio validation successful - ready for speaker diarization")
        } catch {
            print("⚠️ FluidAudio validation warning: \(error)")
            // Don't throw here as silence might not produce meaningful results
        }
    }
    
    // MARK: - Speaker Diarization Methods
    
    public func performDiarization(audioPath: String) async throws -> FluidAudioDiarizationResult {
        guard isInitialized else {
            throw FluidAudioError.notInitialized
        }
        
        print("🎭 Starting speaker diarization for: \(URL(fileURLWithPath: audioPath).lastPathComponent)")
        
        do {
            // Load audio file and convert to required format
            let audioSamples = try await loadAudioFile(path: audioPath)
            
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
            
            print("✅ Diarization completed: \(diarizationResult.totalSpeakers) speakers found")
            return diarizationResult
            
        } catch {
            print("❌ Diarization failed: \(error)")
            throw FluidAudioError.diarizationFailed(error.localizedDescription)
        }
    }
    
    public func performDiarization(audioBuffer: AVAudioPCMBuffer) async throws -> FluidAudioDiarizationResult {
        guard isInitialized else {
            throw FluidAudioError.notInitialized
        }
        
        print("🎭 Starting buffer diarization...")
        
        do {
            // Convert buffer to float array
            let audioSamples = bufferToFloatArray(audioBuffer)
            
            // Perform diarization
            let result = try diarizer.performCompleteDiarization(audioSamples, sampleRate: config.sampleRate)
            
            // Convert to our result format
            let speakerSegments = convertDiarizationResult(result)
            
            let diarizationResult = FluidAudioDiarizationResult(
                speakers: speakerSegments,
                totalSpeakers: speakerSegments.map { $0.speakerId }.uniqued().count,
                processingTime: 0.0,
                success: true
            )
            
            print("✅ Buffer diarization completed: \(diarizationResult.totalSpeakers) speakers found")
            return diarizationResult
            
        } catch {
            print("❌ Buffer diarization failed: \(error)")
            throw FluidAudioError.diarizationFailed(error.localizedDescription)
        }
    }
    
    // MARK: - Real-time Diarization (Future Enhancement)
    
    public func startRealtimeDiarization() async throws {
        // TODO: Implement real-time speaker diarization
        // This will be implemented in Phase 3 for real-time processing
        print("🚧 Real-time diarization not yet implemented")
        throw FluidAudioError.notImplemented("Real-time diarization")
    }
    
    // MARK: - Voice Activity Detection
    
    public func performVAD(audioSamples: [Float]) throws -> [VADSegment] {
        guard isInitialized else {
            throw FluidAudioError.notInitialized
        }
        
        // FluidAudio includes VAD functionality
        // This is a simplified implementation - FluidAudio's VAD is more sophisticated
        print("🎙️ Performing Voice Activity Detection...")
        
        // TODO: Implement proper FluidAudio VAD integration
        // For now, return a basic implementation
        return [VADSegment(startTime: 0.0, endTime: Double(audioSamples.count) / Double(config.sampleRate), confidence: 0.9)]
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
    
    public func getModelInfo() -> FluidAudioModelInfo {
        return FluidAudioModelInfo(
            isInitialized: isInitialized,
            vadAccuracy: "98%", // From FluidAudio documentation
            diarizationError: "17.7%", // DER from FluidAudio documentation
            memoryUsage: "<100MB"
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