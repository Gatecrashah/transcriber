import koffi from 'koffi';
import * as path from 'path';

// Koffi type declarations
declare module 'koffi' {
  interface IKoffiLib {
    func(signature: string): any;
  }
  function load(path: string): IKoffiLib;
  function alloc(type: string, count: number): any;
  function decode(buffer: any, type: string, length?: number): string;
}

interface SwiftCommandOptions {
  command: string[];
  parseResult?: (output: string) => any;
  successPattern?: string;
  timeout?: number;
}

interface SwiftCommandResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class SwiftNativeBridge {
  private static lib: any = null;
  private static isInitialized = false;
  private static readonly BUFFER_SIZE = 1024 * 1024; // 1MB result buffer

  // Function type definitions
  private static transcriper_initialize: any = null;
  private static transcriper_is_ready: any = null;
  private static transcriper_process_audio_file: any = null;
  private static transcriper_process_audio_buffer: any = null;
  private static transcriper_get_system_info: any = null;
  private static transcriper_get_available_models: any = null;
  private static transcriper_cleanup: any = null;

  private static loadLibrary(): void {
    if (SwiftNativeBridge.lib) return;

    // Try multiple paths to find the Swift library
    const possiblePaths = [
      // Development path
      path.resolve(process.cwd(), 'src/native/swift/.build/arm64-apple-macosx/release/libTranscriperNative.dylib'),
      // Alternative development path
      path.resolve(process.cwd(), 'src/native/swift/libTranscriperNative.dylib'),
      // Production path (might be different)
      path.resolve(__dirname, '../../native/swift/.build/arm64-apple-macosx/release/libTranscriperNative.dylib'),
      // Alternative production path
      path.resolve(__dirname, '../../native/swift/libTranscriperNative.dylib'),
    ];
    
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
      } catch (e) {
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

    const { command, parseResult, successPattern } = options;
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
        error: error.message
      };
    }
  }

  private static async initialize(): Promise<SwiftCommandResult> {
    SwiftNativeBridge.loadLibrary();

    if (SwiftNativeBridge.isInitialized) {
      return { success: true };
    }

    const result = SwiftNativeBridge.transcriper_initialize!();
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
    const resultLength = SwiftNativeBridge.transcriper_process_audio_file!(
      filePath,
      resultBuffer,
      SwiftNativeBridge.BUFFER_SIZE
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
    const resultLength = SwiftNativeBridge.transcriper_process_audio_buffer!(
      audioData,
      audioData.length,
      sampleRate,
      channels,
      resultBuffer,
      SwiftNativeBridge.BUFFER_SIZE
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
    const resultLength = SwiftNativeBridge.transcriper_get_system_info!(
      infoBuffer,
      SwiftNativeBridge.BUFFER_SIZE
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
    const resultLength = SwiftNativeBridge.transcriper_get_available_models!(
      modelsBuffer,
      SwiftNativeBridge.BUFFER_SIZE
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
  static extractJsonFromOutput(output: string): any {
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