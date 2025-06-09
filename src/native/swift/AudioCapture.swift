import Foundation
import CoreAudio
import AudioToolbox
import AVFoundation

@objc public class AudioCapture: NSObject {
    private var audioEngine: AVAudioEngine?
    private var audioFile: AVAudioFile?
    private var isRecording = false
    
    private let outputDirectory: URL
    private var currentRecordingURL: URL?
    
    public override init() {
        // Set up output directory using temporary directory for now
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
    
    @objc public func requestPermissions() -> Bool {
        // Check if we have microphone permission
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
    
    @objc public func startSystemAudioRecording() -> Bool {
        guard !isRecording else {
            print("Already recording")
            return false
        }
        
        guard requestPermissions() else {
            print("Audio permissions not granted")
            return false
        }
        
        do {
            try setupAudioEngine()
            try setupAudioFile()
            try startRecording()
            
            isRecording = true
            print("Audio recording started successfully")
            return true
            
        } catch {
            print("Failed to start recording: \(error.localizedDescription)")
            cleanup()
            return false
        }
    }
    
    @objc public func stopRecording() -> String? {
        guard isRecording else {
            return nil
        }
        
        isRecording = false
        
        // Stop audio engine
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        
        // Close audio file
        audioFile = nil
        
        print("Recording stopped")
        
        return currentRecordingURL?.path
    }
    
    @objc public func isCurrentlyRecording() -> Bool {
        return isRecording
    }
    
    // MARK: - Private Methods
    
    private func setupAudioEngine() throws {
        audioEngine = AVAudioEngine()
        
        guard audioEngine != nil else {
            throw AudioCaptureError.engineCreationFailed
        }
        
        print("Audio engine setup complete")
    }
    
    private func setupAudioFile() throws {
        // Create output file
        let fileName = "recording_\(Date().timeIntervalSince1970).wav"
        currentRecordingURL = outputDirectory.appendingPathComponent(fileName)
        
        guard let url = currentRecordingURL else {
            throw AudioCaptureError.fileCreationFailed
        }
        
        guard let audioEngine = audioEngine else {
            throw AudioCaptureError.setupIncomplete
        }
        
        // Get the input node's format
        let inputFormat = audioEngine.inputNode.outputFormat(forBus: 0)
        
        // Create format settings for 16 kHz mono WAV file (required by whisper.cpp)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16000.0,  // 16 kHz required by whisper.cpp
            AVNumberOfChannelsKey: 1,  // Mono
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]
        
        // Create audio file with whisper.cpp compatible format
        audioFile = try AVAudioFile(forWriting: url, settings: outputSettings)
        
        print("Audio file setup complete: \(fileName)")
        print("Input format: \(inputFormat)")
        print("Output format: 16 kHz, 16-bit PCM, Mono (whisper.cpp compatible)")
    }
    
    private func startRecording() throws {
        guard let audioEngine = audioEngine,
              let audioFile = audioFile else {
            throw AudioCaptureError.setupIncomplete
        }
        
        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        let outputFormat = audioFile.processingFormat
        
        // Create audio converter for format conversion if needed
        let converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        guard let audioConverter = converter else {
            throw AudioCaptureError.setupIncomplete
        }
        
        // Install tap on input node with the input format
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { (buffer, time) in
            // Convert the buffer to the output format
            let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * outputFormat.sampleRate / inputFormat.sampleRate))
            
            guard let convertedBuffer = outputBuffer else {
                print("Error creating output buffer")
                return
            }
            
            var error: NSError?
            let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }
            
            audioConverter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)
            
            if let conversionError = error {
                print("Error converting audio: \(conversionError.localizedDescription)")
                return
            }
            
            do {
                try audioFile.write(from: convertedBuffer)
            } catch {
                print("Error writing audio buffer: \(error.localizedDescription)")
            }
        }
        
        // Start the audio engine
        try audioEngine.start()
        
        print("Audio engine started successfully")
        print("Recording with format conversion: \(inputFormat.sampleRate) Hz -> \(outputFormat.sampleRate) Hz")
    }
    
    private func cleanup() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil
        audioFile = nil
        currentRecordingURL = nil
        
        print("Cleanup completed")
    }
}

// MARK: - Error Types

enum AudioCaptureError: Error {
    case engineCreationFailed
    case fileCreationFailed
    case setupIncomplete
    
    var localizedDescription: String {
        switch self {
        case .engineCreationFailed:
            return "Failed to create audio engine"
        case .fileCreationFailed:
            return "Failed to create audio file"
        case .setupIncomplete:
            return "Audio setup incomplete"
        }
    }
}