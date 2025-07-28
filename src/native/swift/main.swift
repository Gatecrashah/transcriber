import Foundation
import TranscriperCore

class AudioCaptureApp {
    private let audioCapture = AudioCapture()
    private var isRunning = false
    
    func run() {
        // Setup signal handling for graceful shutdown
        signal(SIGINT) { _ in
            exit(0)
        }
        signal(SIGTERM) { _ in
            exit(0)
        }
        
        // Parse command line arguments
        let args = CommandLine.arguments
        guard args.count > 1 else {
            printUsage()
            return
        }
        
        let command = args[1]
        
        switch command {
        case "start":
            startRecording()
        case "start-system":
            startSystemRecording()
        case "stop":
            stopRecording()
        case "check-permissions":
            checkPermissions()
        default:
            printUsage()
        }
    }
    
    private func startRecording() {
        print("Starting system audio recording...")
        
        if audioCapture.startSystemAudioRecording() {
            print("Recording started successfully")
            runRecordingLoop()
        } else {
            print("Failed to start recording")
            exit(1)
        }
    }
    
    private func startSystemRecording() {
        print("Starting system audio capture using macOS 14.4+ APIs...")
        
        if audioCapture.startSystemAudioCaptureNew() {
            print("System audio capture started successfully")
            runRecordingLoop()
        } else {
            print("Failed to start system audio capture")
            print("This feature requires macOS 14.4+ and proper permissions")
            exit(1)
        }
    }
    
    private func runRecordingLoop() {
        // Keep the process alive while recording
        isRunning = true
        
        // Setup signal handlers to stop recording gracefully
        signal(SIGINT) { _ in
            if let app = AudioCaptureApp.shared {
                app.handleTermination()
            }
        }
        signal(SIGTERM) { _ in
            if let app = AudioCaptureApp.shared {
                app.handleTermination()
            }
        }
        
        // Run the main loop to keep process alive
        while isRunning {
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
        }
    }
    
    func handleTermination() {
        if let filePath = audioCapture.stopRecording() {
            print("Recording stopped. File saved to: \(filePath)")
        }
        isRunning = false
        exit(0)
    }
    
    static var shared: AudioCaptureApp?
    
    private func stopRecording() {
        if let filePath = audioCapture.stopRecording() {
            print("Recording stopped. File saved to: \(filePath)")
        } else {
            print("No active recording to stop")
        }
        stop()
    }
    
    private func checkPermissions() {
        let hasPermissions = audioCapture.requestPermissions()
        print(hasPermissions ? "Permissions granted" : "Permissions denied")
        exit(hasPermissions ? 0 : 1)
    }
    
    private func stop() {
        isRunning = false
        if let filePath = audioCapture.stopRecording() {
            print("Recording stopped. File saved to: \(filePath)")
        }
        exit(0)
    }
    
    private func printUsage() {
        print("Usage: audio-capture [start|start-system|stop|check-permissions]")
        print("Commands:")
        print("  start              - Start recording microphone input")
        print("  start-system       - Start system audio capture (macOS 14.4+)")
        print("  stop               - Stop current recording")
        print("  check-permissions  - Check if audio permissions are granted")
    }
}

// Entry point
let app = AudioCaptureApp()
AudioCaptureApp.shared = app
app.run()