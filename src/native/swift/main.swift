import Foundation

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
            
            // Keep the process alive while recording
            isRunning = true
            let runLoop = RunLoop.current
            
            while isRunning && runLoop.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1)) {
                // Keep running
            }
            
        } else {
            print("Failed to start recording")
            exit(1)
        }
    }
    
    private func stopRecording() {
        if let filePath = audioCapture.stopRecording() {
            print("Recording stopped. File saved to: \\(filePath)")
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
            print("Recording stopped. File saved to: \\(filePath)")
        }
        exit(0)
    }
    
    private func printUsage() {
        print("Usage: audio-capture [start|stop|check-permissions]")
        print("Commands:")
        print("  start              - Start recording system audio")
        print("  stop               - Stop current recording")
        print("  check-permissions  - Check if audio permissions are granted")
    }
}

// Entry point
let app = AudioCaptureApp()
app.run()