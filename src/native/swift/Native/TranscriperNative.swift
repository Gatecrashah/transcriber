import Foundation
import TranscriperCore

// Global instance to maintain state between C function calls
private var sharedBridge: SwiftAudioBridge?

// C-compatible wrapper functions for the Swift audio processing pipeline
// These functions can be called directly from Node.js via FFI

@_cdecl("transcriper_initialize")
public func transcriper_initialize() -> Int32 {
    print("🌉 Initializing TranscriperNative for Node.js integration...")

    do {
        if #available(macOS 14.0, *) {
            sharedBridge = SwiftAudioBridge()
            let success = sharedBridge!.initialize()

            if success {
                print("✅ TranscriperNative initialized successfully")
                return 1
            } else {
                print("❌ TranscriperNative initialization failed")
                return 0
            }
        } else {
            print("❌ TranscriperNative requires macOS 14.0 or later")
            return 0
        }
    } catch {
        print("❌ TranscriperNative initialization error: \(error)")
        return 0
    }
}

@_cdecl("transcriper_is_ready")
public func transcriper_is_ready() -> Int32 {
    guard let bridge = sharedBridge else {
        return 0
    }

    return bridge.isReady() ? 1 : 0
}

@_cdecl("transcriper_process_audio_file")
public func transcriper_process_audio_file(_ filePath: UnsafePointer<CChar>,
                                           _ resultBuffer: UnsafeMutablePointer<CChar>,
                                           _ bufferSize: Int32) -> Int32 {
    guard let bridge = sharedBridge else {
        print("❌ TranscriperNative not initialized")
        return -1
    }

    let filePathString = String(cString: filePath)
    print("🎵 Processing audio file via C API: \(URL(fileURLWithPath: filePathString).lastPathComponent)")

    let jsonResult = bridge.processAudioFile(filePathString)

    // Copy result to C buffer
    guard let resultData = jsonResult.data(using: .utf8) else {
        print("❌ Failed to convert result to UTF8")
        return -1
    }

    let resultLength = min(resultData.count, Int(bufferSize) - 1) // Leave space for null terminator

    resultData.withUnsafeBytes { bytes in
        let boundBytes = bytes.bindMemory(to: CChar.self)
        resultBuffer.initialize(from: boundBytes.baseAddress!, count: resultLength)
    }

    // Add null terminator
    resultBuffer[resultLength] = 0

    print("✅ Audio file processing completed, result length: \(resultLength)")
    return Int32(resultLength)
}

@_cdecl("transcriper_process_audio_buffer")
public func transcriper_process_audio_buffer(_ audioData: UnsafePointer<Float>,
                                             _ dataLength: Int32,
                                             _ sampleRate: Int32,
                                             _ channels: Int32,
                                             _ resultBuffer: UnsafeMutablePointer<CChar>,
                                             _ bufferSize: Int32) -> Int32 {
    guard let bridge = sharedBridge else {
        print("❌ TranscriperNative not initialized")
        return -1
    }

    print("🎵 Processing audio buffer via C API: \(dataLength) samples at \(sampleRate)Hz")

    // Convert C array to Swift Data correctly
    let floatArray = Array(UnsafeBufferPointer(start: audioData, count: Int(dataLength)))
    let audioDataSwift = floatArray.withUnsafeBytes { Data($0) }

    let jsonResult = bridge.processAudioBuffer(audioDataSwift, sampleRate: Int(sampleRate), channels: Int(channels))

    // Copy result to C buffer
    guard let resultData = jsonResult.data(using: .utf8) else {
        print("❌ Failed to convert buffer result to UTF8")
        return -1
    }

    let resultLength = min(resultData.count, Int(bufferSize) - 1)

    resultData.withUnsafeBytes { bytes in
        let boundBytes = bytes.bindMemory(to: CChar.self)
        resultBuffer.initialize(from: boundBytes.baseAddress!, count: resultLength)
    }

    resultBuffer[resultLength] = 0

    print("✅ Audio buffer processing completed, result length: \(resultLength)")
    return Int32(resultLength)
}

@_cdecl("transcriper_get_system_info")
public func transcriper_get_system_info(_ infoBuffer: UnsafeMutablePointer<CChar>,
                                         _ bufferSize: Int32) -> Int32 {
    guard let bridge = sharedBridge else {
        print("❌ TranscriperNative not initialized")
        return -1
    }

    let jsonInfo = bridge.getSystemInfo()

    guard let infoData = jsonInfo.data(using: .utf8) else {
        print("❌ Failed to convert system info to UTF8")
        return -1
    }

    let infoLength = min(infoData.count, Int(bufferSize) - 1)

    infoData.withUnsafeBytes { bytes in
        let boundBytes = bytes.bindMemory(to: CChar.self)
        infoBuffer.initialize(from: boundBytes.baseAddress!, count: infoLength)
    }

    infoBuffer[infoLength] = 0

    return Int32(infoLength)
}

@_cdecl("transcriper_get_available_models")
public func transcriper_get_available_models(_ modelsBuffer: UnsafeMutablePointer<CChar>,
                                             _ bufferSize: Int32) -> Int32 {
    guard let bridge = sharedBridge else {
        print("❌ TranscriperNative not initialized")
        return -1
    }

    let jsonModels = bridge.getAvailableModels()

    guard let modelsData = jsonModels.data(using: .utf8) else {
        print("❌ Failed to convert models info to UTF8")
        return -1
    }

    let modelsLength = min(modelsData.count, Int(bufferSize) - 1)

    modelsData.withUnsafeBytes { bytes in
        let boundBytes = bytes.bindMemory(to: CChar.self)
        modelsBuffer.initialize(from: boundBytes.baseAddress!, count: modelsLength)
    }

    modelsBuffer[modelsLength] = 0

    return Int32(modelsLength)
}

@_cdecl("transcriper_cleanup")
public func transcriper_cleanup() {
    print("♻️ Cleaning up TranscriperNative resources...")
    sharedBridge = nil
    print("✅ TranscriperNative cleanup complete")
}
