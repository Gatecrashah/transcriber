import Foundation
import TranscriperCore

class AudioCaptureApp {
    private let audioCapture = AudioCapture()
    private var swiftBridge: SwiftAudioBridge?
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
        case "init":
            initializeProcessing()
        case "process":
            if args.count >= 3 {
                processAudioFile(args[2])
            } else {
                print("Error: process command requires file path")
                exit(1)
            }
        case "system-info":
            getSystemInfo()
        case "models":
            getAvailableModels()
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

        if audioCapture.startSystemAudioRecording() {
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

    private func initializeProcessing() {
        if #available(macOS 14.0, *) {
            swiftBridge = SwiftAudioBridge()
            let success = swiftBridge!.initialize()

            if success {
                print("SUCCESS: SwiftAudioBridge initialized")
                exit(0)
            } else {
                print("ERROR: SwiftAudioBridge initialization failed")
                exit(1)
            }
        } else {
            print("ERROR: Requires macOS 14.0 or later")
            exit(1)
        }
    }

    private func processAudioFile(_ filePath: String) {
        if swiftBridge == nil {
            if #available(macOS 14.0, *) {
                swiftBridge = SwiftAudioBridge()
                let success = swiftBridge!.initialize()

                if !success {
                    print("ERROR: Failed to initialize SwiftAudioBridge")
                    exit(1)
                }
            } else {
                print("ERROR: Requires macOS 14.0 or later")
                exit(1)
            }
        }

        let result = swiftBridge!.processAudioFile(filePath)
        print(result) // Output JSON result to stdout
        exit(0)
    }

    private func getSystemInfo() {
        if swiftBridge == nil {
            if #available(macOS 14.0, *) {
                swiftBridge = SwiftAudioBridge()
                let success = swiftBridge!.initialize()

                if !success {
                    print("ERROR: Failed to initialize SwiftAudioBridge")
                    exit(1)
                }
            } else {
                print("ERROR: Requires macOS 14.0 or later")
                exit(1)
            }
        }

        let info = swiftBridge!.getSystemInfo()
        print(info) // Output JSON info to stdout
        exit(0)
    }

    private func getAvailableModels() {
        if swiftBridge == nil {
            if #available(macOS 14.0, *) {
                swiftBridge = SwiftAudioBridge()
                _ = swiftBridge!.initialize() // Don't fail if this doesn't work for models query
            } else {
                print("ERROR: Requires macOS 14.0 or later")
                exit(1)
            }
        }

        let models = swiftBridge!.getAvailableModels()
        print(models) // Output JSON models to stdout
        exit(0)
    }

    private func stop() {
        isRunning = false
        if let filePath = audioCapture.stopRecording() {
            print("Recording stopped. File saved to: \(filePath)")
        }
        exit(0)
    }

    private func printUsage() {
        print("Usage: audio-capture [command] [options]")
        print("Recording Commands:")
        print("  start              - Start recording microphone input")
        print("  start-system       - Start system audio capture (macOS 14.4+)")
        print("  stop               - Stop current recording")
        print("  check-permissions  - Check if audio permissions are granted")
        print("")
        print("Processing Commands (Swift-native pipeline):")
        print("  init               - Initialize SwiftAudioBridge processing system")
        print("  process <file>     - Process audio file and output JSON result")
        print("  system-info        - Get system processing information as JSON")
        print("  models             - Get available WhisperKit models as JSON")
    }
}

// Entry point
let app = AudioCaptureApp()
AudioCaptureApp.shared = app
app.run()
