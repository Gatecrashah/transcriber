import koffi from 'koffi';
import * as path from 'path';
import type {
  KoffiLib,
  TranscriperInitialize,
  TranscriperIsReady,
  TranscriperProcessAudioFile,
  TranscriperProcessAudioBuffer,
  TranscriperGetSystemInfo,
  TranscriperGetAvailableModels,
  TranscriperCleanup
} from '../types/koffi';

interface SwiftCommandOptions {
  command: string[];
  parseResult?: (output: string) => unknown;
  successPattern?: string;
  timeout?: number;
}

interface SwiftCommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class SwiftNativeBridge {
  private static lib: KoffiLib | null = null;
  private static isInitialized = false;
  private static readonly BUFFER_SIZE = 1024 * 1024; // 1MB result buffer

  // Function type definitions
  private static transcriper_initialize: TranscriperInitialize | null = null;
  private static transcriper_is_ready: TranscriperIsReady | null = null;
  private static transcriper_process_audio_file: TranscriperProcessAudioFile | null = null;
  private static transcriper_process_audio_buffer: TranscriperProcessAudioBuffer | null = null;
  private static transcriper_get_system_info: TranscriperGetSystemInfo | null = null;
  private static transcriper_get_available_models: TranscriperGetAvailableModels | null = null;
  private static transcriper_cleanup: TranscriperCleanup | null = null;

  // Serializes native calls. The Swift side keeps a single shared bridge instance
  // (and an `isProcessing` guard), so overlapping calls must not run concurrently.
  // Now that calls go through worker threads, the main thread could otherwise
  // dispatch a second call before the first finishes — this chain prevents that.
  private static nativeQueue: Promise<unknown> = Promise.resolve();

  /**
   * Run a task once any previously queued native call has settled, regardless of
   * its outcome. Returns the task's own promise so callers see its real result.
   */
  private static serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = SwiftNativeBridge.nativeQueue.then(task, task);
    SwiftNativeBridge.nativeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  /**
   * Invoke a koffi-registered native function on a libuv worker thread instead of
   * blocking the Electron main-process event loop. Transcription and model loading
   * can take many seconds; running them synchronously freezes the entire UI.
   * Output (`_Out_`) buffers are caller-allocated and decoded after the call
   * resolves, exactly as in the previous synchronous path.
   */
  private static callNativeAsync(fn: unknown, args: unknown[]): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      try {
        (fn as { async: (...a: unknown[]) => void }).async(
          ...args,
          (err: Error | null, result: number) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private static loadLibrary(): void {
    if (SwiftNativeBridge.lib) return;

    const dylibName = 'libTranscriperNative.dylib';

    // Try multiple paths to find the Swift library
    const possiblePaths = [
      // Packaged app: shipped via forge `extraResource` into Contents/Resources/.
      // `process.resourcesPath` only points at the app bundle when packaged; in dev
      // it points at Electron's own Resources (where the file is absent), so the
      // loop below simply falls through to the development paths.
      process.resourcesPath ? path.join(process.resourcesPath, dylibName) : '',
      // Development path (output of `swift build -c release`)
      path.resolve(process.cwd(), `src/native/swift/.build/arm64-apple-macosx/release/${dylibName}`),
      // Development path (committed prebuilt copy)
      path.resolve(process.cwd(), `src/native/swift/${dylibName}`),
      // Fallback relative to the bundled main process file
      path.resolve(__dirname, `../../native/swift/.build/arm64-apple-macosx/release/${dylibName}`),
      path.resolve(__dirname, `../../native/swift/${dylibName}`),
    ].filter(Boolean);
    
    console.log('🔍 Searching for Swift native library...');
    console.log('   Current working directory:', process.cwd());
    console.log('   __dirname:', __dirname);
    
    let libPath: string | null = null;
    for (const possiblePath of possiblePaths) {
      console.log(`   Checking: ${possiblePath}`);
      // Note: We can't use fs.existsSync in webpack bundle, so we'll try to load and catch errors
      try {
        // Try to load the library
        SwiftNativeBridge.lib = koffi.load(possiblePath);
        libPath = possiblePath;
        console.log(`   ✅ Found library at: ${possiblePath}`);
        break;
      } catch {
        // Library not found at this path, try next
        console.log(`   ❌ Not found at: ${possiblePath}`);
        SwiftNativeBridge.lib = null;
      }
    }
    
    if (!libPath || !SwiftNativeBridge.lib) {
      const error = new Error('Swift native library not found in any expected location');
      console.error('❌ Failed to load Swift library:', error);
      console.error('   Tried paths:', possiblePaths);
      throw error;
    }
    
    try {
      // Load function definitions using C-style signatures
      SwiftNativeBridge.transcriper_initialize = SwiftNativeBridge.lib.func('int32 transcriper_initialize()');
      SwiftNativeBridge.transcriper_is_ready = SwiftNativeBridge.lib.func('int32 transcriper_is_ready()');
      SwiftNativeBridge.transcriper_process_audio_file = SwiftNativeBridge.lib.func('int32 transcriper_process_audio_file(str filename, _Out_ char *result, int32 bufferSize)');
      SwiftNativeBridge.transcriper_process_audio_buffer = SwiftNativeBridge.lib.func('int32 transcriper_process_audio_buffer(const float *audioData, int32 dataLength, int32 sampleRate, int32 channels, _Out_ char *result, int32 bufferSize)');
      SwiftNativeBridge.transcriper_get_system_info = SwiftNativeBridge.lib.func('int32 transcriper_get_system_info(_Out_ char *info, int32 bufferSize)');
      SwiftNativeBridge.transcriper_get_available_models = SwiftNativeBridge.lib.func('int32 transcriper_get_available_models(_Out_ char *models, int32 bufferSize)');
      SwiftNativeBridge.transcriper_cleanup = SwiftNativeBridge.lib.func('void transcriper_cleanup()');

      console.log('🌉 Swift native library loaded successfully from:', libPath);
    } catch (error) {
      console.error('❌ Failed to load Swift library functions:', error);
      throw new Error(`Failed to load Swift library functions: ${error.message}`);
    }
  }

  static async runCommand(options: SwiftCommandOptions): Promise<SwiftCommandResult> {
    try {
      SwiftNativeBridge.loadLibrary();
    } catch (error) {
      console.error('❌ Failed to load Swift library in runCommand:', error);
      return {
        success: false,
        error: `Failed to load Swift native library: ${error.message}`
      };
    }

    const { command } = options;
    const [commandName, ...args] = command;

    try {
      switch (commandName) {
        case 'init':
          return await SwiftNativeBridge.initialize();
        
        case 'process':
          if (args.length === 0) {
            throw new Error('Missing file path for process command');
          }
          return await SwiftNativeBridge.processAudioFile(args[0]);
        
        case 'system-info':
          return await SwiftNativeBridge.getSystemInfo();
        
        case 'models':
          return await SwiftNativeBridge.getAvailableModels();
        
        default:
          throw new Error(`Unknown command: ${commandName}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async initialize(): Promise<SwiftCommandResult> {
    SwiftNativeBridge.loadLibrary();

    if (SwiftNativeBridge.isInitialized) {
      return { success: true };
    }

    const result = await SwiftNativeBridge.serialize(() =>
      SwiftNativeBridge.callNativeAsync(SwiftNativeBridge.transcriper_initialize, [])
    );
    SwiftNativeBridge.isInitialized = result === 1;

    return {
      success: SwiftNativeBridge.isInitialized,
      error: SwiftNativeBridge.isInitialized ? undefined : 'Swift initialization failed'
    };
  }

  static async processAudioFile(filePath: string): Promise<SwiftCommandResult> {
    SwiftNativeBridge.loadLibrary();

    if (!SwiftNativeBridge.isInitialized) {
      const initResult = await SwiftNativeBridge.initialize();
      if (!initResult.success) {
        return initResult;
      }
    }

    const resultBuffer = koffi.alloc('char', SwiftNativeBridge.BUFFER_SIZE);
    const resultLength = await SwiftNativeBridge.serialize(() =>
      SwiftNativeBridge.callNativeAsync(SwiftNativeBridge.transcriper_process_audio_file, [
        filePath,
        resultBuffer,
        SwiftNativeBridge.BUFFER_SIZE
      ])
    );

    if (resultLength <= 0) {
      return {
        success: false,
        error: 'Swift audio file processing failed'
      };
    }

    try {
      const jsonString = koffi.decode(resultBuffer, 'char', -1);
      const parsedResult = JSON.parse(jsonString);
      
      return {
        success: true,
        data: parsedResult
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse Swift result: ${error.message}`
      };
    }
  }

  static async processAudioBuffer(audioData: Float32Array, sampleRate: number, channels: number): Promise<SwiftCommandResult> {
    SwiftNativeBridge.loadLibrary();

    if (!SwiftNativeBridge.isInitialized) {
      const initResult = await SwiftNativeBridge.initialize();
      if (!initResult.success) {
        return initResult;
      }
    }

    const resultBuffer = koffi.alloc('char', SwiftNativeBridge.BUFFER_SIZE);

    // Koffi can handle Float32Array directly as pointer argument
    const resultLength = await SwiftNativeBridge.serialize(() =>
      SwiftNativeBridge.callNativeAsync(SwiftNativeBridge.transcriper_process_audio_buffer, [
        audioData,
        audioData.length,
        sampleRate,
        channels,
        resultBuffer,
        SwiftNativeBridge.BUFFER_SIZE
      ])
    );

    if (resultLength <= 0) {
      return {
        success: false,
        error: 'Swift audio buffer processing failed'
      };
    }

    try {
      const jsonString = koffi.decode(resultBuffer, 'char', -1);
      const parsedResult = JSON.parse(jsonString);
      
      return {
        success: true,
        data: parsedResult
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse Swift buffer result: ${error.message}`
      };
    }
  }

  private static async getSystemInfo(): Promise<SwiftCommandResult> {
    SwiftNativeBridge.loadLibrary();

    if (!SwiftNativeBridge.isInitialized) {
      const initResult = await SwiftNativeBridge.initialize();
      if (!initResult.success) {
        return initResult;
      }
    }

    const infoBuffer = koffi.alloc('char', SwiftNativeBridge.BUFFER_SIZE);
    const resultLength = await SwiftNativeBridge.serialize(() =>
      SwiftNativeBridge.callNativeAsync(SwiftNativeBridge.transcriper_get_system_info, [
        infoBuffer,
        SwiftNativeBridge.BUFFER_SIZE
      ])
    );

    if (resultLength <= 0) {
      return {
        success: false,
        error: 'Swift system info failed'
      };
    }

    try {
      const jsonString = koffi.decode(infoBuffer, 'char', -1);
      const systemInfo = JSON.parse(jsonString);
      
      return {
        success: true,
        data: systemInfo
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse system info: ${error.message}`
      };
    }
  }

  private static async getAvailableModels(): Promise<SwiftCommandResult> {
    SwiftNativeBridge.loadLibrary();

    if (!SwiftNativeBridge.isInitialized) {
      const initResult = await SwiftNativeBridge.initialize();
      if (!initResult.success) {
        return initResult;
      }
    }

    const modelsBuffer = koffi.alloc('char', SwiftNativeBridge.BUFFER_SIZE);
    const resultLength = await SwiftNativeBridge.serialize(() =>
      SwiftNativeBridge.callNativeAsync(SwiftNativeBridge.transcriper_get_available_models, [
        modelsBuffer,
        SwiftNativeBridge.BUFFER_SIZE
      ])
    );

    if (resultLength <= 0) {
      return {
        success: false,
        error: 'Swift models query failed'
      };
    }

    try {
      const jsonString = koffi.decode(modelsBuffer, 'char', -1);
      const modelsInfo = JSON.parse(jsonString);
      
      return {
        success: true,
        data: modelsInfo
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse models info: ${error.message}`
      };
    }
  }

  static cleanup(): void {
    if (SwiftNativeBridge.lib && SwiftNativeBridge.transcriper_cleanup) {
      SwiftNativeBridge.transcriper_cleanup();
      SwiftNativeBridge.isInitialized = false;
    }
  }

  // Maintain compatibility with SwiftProcessRunner interface
  static extractJsonFromOutput(output: string): unknown {
    const lines = output.split('\n');
    const jsonStartIndex = lines.findIndex(line => line.trim().startsWith('{'));

    if (jsonStartIndex === -1) {
      throw new Error('No JSON result found in output');
    }

    const jsonLines = lines.slice(jsonStartIndex);
    const jsonString = jsonLines.join('\n').trim();

    return JSON.parse(jsonString);
  }
}