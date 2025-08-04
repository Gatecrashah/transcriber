import Foundation
import CoreAudio
import AudioToolbox
import AVFoundation
import Darwin

enum AudioCaptureError: Error {
    case engineCreationFailed
    case fileCreationFailed
    case setupIncomplete
    case permissionDenied

    var localizedDescription: String {
        switch self {
        case .engineCreationFailed:
            return "Failed to create audio engine"
        case .fileCreationFailed:
            return "Failed to create audio file"
        case .setupIncomplete:
            return "Audio setup incomplete"
        case .permissionDenied:
            return "Audio permissions not granted"
        }
    }
}

@objc public class AudioCapture: NSObject {
    private var audioEngine: AVAudioEngine?
    private var audioFile: AVAudioFile?
    private var isRecording = false
    private var currentRecordingURL: URL?
    private let outputDirectory: URL

    public override init() {
        // Set up output directory using temporary directory
        let tempDir = FileManager.default.temporaryDirectory
        self.outputDirectory = tempDir.appendingPathComponent("TranscriperAudio", isDirectory: true)

        super.init()

        // Create output directory if it doesn't exist
        try? FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
    }

    deinit {
        _ = stopRecording()
        cleanup()
    }

    // MARK: - Public API (Objective-C Compatible)

    @objc public func requestPermissions() -> Bool {
        return requestMicrophonePermission()
    }

    @objc public func requestMicrophonePermission() -> Bool {
        let microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)

        switch microphoneStatus {
        case .authorized:
            return true
        case .notDetermined:
            // Request permission synchronously
            var granted = false
            let semaphore = DispatchSemaphore(value: 0)

            AVCaptureDevice.requestAccess(for: .audio) { isGranted in
                granted = isGranted
                semaphore.signal()
            }

            semaphore.wait()
            return granted
        default:
            return false
        }
    }

    @objc public func checkSystemAudioPermission() -> Bool {
        // For the simplified fallback, we only need microphone permission
        // Web API handles system audio, this is just microphone fallback
        return requestMicrophonePermission()
    }

    @objc public func startSystemAudioRecording() -> Bool {
        print("⚠️  Swift fallback: Starting basic microphone recording (Web API failed)")
        print("📝 Note: This fallback captures microphone only, not system audio")
        return startBasicMicrophoneRecording()
    }

    @objc public func stopRecording() -> String? {
        guard isRecording else {
            print("Not currently recording")
            return nil
        }

        isRecording = false
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)

        let recordingPath = currentRecordingURL?.path
        print("🛑 Swift fallback recording stopped: \(recordingPath ?? "unknown")")
        return recordingPath
    }

    @objc public func isCurrentlyRecording() -> Bool {
        return isRecording
    }

    // MARK: - Private Implementation

    private func startBasicMicrophoneRecording() -> Bool {
        guard !isRecording else {
            print("Already recording")
            return false
        }

        guard requestMicrophonePermission() else {
            print("Microphone permission not granted")
            return false
        }

        do {
            try setupAudioCapture()
            isRecording = true

            print("✅ Swift fallback: Basic microphone recording started")
            print("🎤 Capturing microphone input only")
            return true
        } catch {
            print("❌ Failed to start Swift fallback recording: \(error.localizedDescription)")
            cleanup()
            return false
        }
    }

    private func setupAudioCapture() throws {
        // Create audio engine
        audioEngine = AVAudioEngine()
        guard let engine = audioEngine else {
            throw AudioCaptureError.engineCreationFailed
        }

        // Create output file
        let fileName = "recording_\(Date().timeIntervalSince1970).wav"
        currentRecordingURL = outputDirectory.appendingPathComponent(fileName)
        guard let url = currentRecordingURL else {
            throw AudioCaptureError.fileCreationFailed
        }

        // Create format settings for 16 kHz mono WAV file (optimal for speech recognition)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16000.0,  // 16 kHz optimal for speech recognition
            AVNumberOfChannelsKey: 1,  // Mono
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]

        audioFile = try AVAudioFile(forWriting: url, settings: outputSettings)
        guard let file = audioFile else {
            throw AudioCaptureError.fileCreationFailed
        }

        // Set up audio processing
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        let outputFormat = file.processingFormat

        print("Input format: \(inputFormat.sampleRate) Hz, \(inputFormat.channelCount) channels")
        print("Output format: 16 kHz, 1 channel (optimized for speech recognition)")

        // Create audio converter for format conversion
        guard let converter = AVAudioConverter(from: inputFormat, to: outputFormat) else {
            throw AudioCaptureError.setupIncomplete
        }

        // Install tap for recording with format conversion
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { (buffer, _) in
            let sampleRateRatio = outputFormat.sampleRate / inputFormat.sampleRate
            let frameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * sampleRateRatio)
            guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: frameCapacity) else {
                return
            }

            var error: NSError?
            converter.convert(to: outputBuffer, error: &error) { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }

            if error == nil {
                try? file.write(from: outputBuffer)
            }
        }

        // Start the audio engine
        try engine.start()
        print("🎤 Microphone fallback recording active")
    }

    private func cleanup() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil
        audioFile = nil
        currentRecordingURL = nil
        print("🧹 Swift fallback resources cleaned up")
    }
}
