import { ipcMain } from 'electron';
import { TranscriptionManager, TranscriptionResult } from '../transcription/transcriptionManager';

export class TranscriptionIPC {
  private transcriptionManager: TranscriptionManager;
  private isInitialized = false;

  constructor() {
    console.log('🚀 Initializing TranscriptionIPC with Swift-native processing...');
    this.transcriptionManager = new TranscriptionManager();
    this.setupHandlers();
    
    // Initialize the Swift processing system
    this.initializeSwiftProcessing();
  }

  private async initializeSwiftProcessing() {
    try {
      console.log('🔄 Initializing Swift-native transcription system...');
      const success = await this.transcriptionManager.initialize();
      
      if (success) {
        this.isInitialized = true;
        console.log('✅ Swift-native transcription system initialized successfully');
      } else {
        console.error('❌ Failed to initialize Swift-native transcription system');
      }
    } catch (error) {
      console.error('❌ Error initializing Swift-native transcription system:', error);
    }
  }

  private setupHandlers() {
    // Check if Swift-native transcription system is ready
    ipcMain.handle('transcription:check-installation', async () => {
      try {
        // For Swift-native system, check if it's initialized and get system info
        if (!this.isInitialized) {
          return {
            installed: false,
            error: 'Swift-native transcription system not initialized',
            isSwiftNative: true
          };
        }

        const systemInfo = await this.transcriptionManager.getSystemInfo();
        const models = await this.transcriptionManager.getAvailableModels();
        
        return {
          installed: true,
          isSwiftNative: true,
          systemInfo,
          availableModels: models.models || [],
          performance: '97.7x faster than whisper.cpp'
        };
      } catch (error) {
        console.error('Error checking Swift-native installation:', error);
        return {
          installed: false,
          isSwiftNative: true,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Initialize Swift-native transcription system (can be called manually if needed)
    ipcMain.handle('transcription:initialize', async () => {
      try {
        if (this.isInitialized) {
          return { success: true, message: 'Already initialized' };
        }

        const success = await this.transcriptionManager.initialize();
        this.isInitialized = success;
        
        return { 
          success, 
          message: success ? 'Swift-native system initialized' : 'Initialization failed'
        };
      } catch (error) {
        console.error('Error initializing transcription system:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Transcribe a file using Swift-native processing
    ipcMain.handle('transcription:transcribe-file', async (event, filePath: string, options: Record<string, unknown> = {}) => {
      try {
        console.log('🎵 Transcribing file with Swift-native pipeline:', filePath);
        
        // Check if system is initialized
        if (!this.isInitialized) {
          console.log('⚠️ Swift system not initialized, attempting initialization...');
          const success = await this.transcriptionManager.initialize();
          if (!success) {
            return {
              text: '',
              success: false,
              error: 'Swift-native transcription system not available'
            } as TranscriptionResult;
          }
          this.isInitialized = true;
        }
        
        // Note: Swift-native system automatically handles speaker diarization
        // usePyannote is no longer needed as FluidAudio provides superior diarization
        const swiftOptions = {
          ...options,
          // Remove old pyannote options as Swift handles diarization natively
          enableDiarization: options.enableDiarization !== false, // Default to true for Swift
        };
        
        console.log('🚀 Swift transcription options:', swiftOptions);
        console.log('💡 Using WhisperKit + FluidAudio (97.7x faster)');
        
        const startTime = Date.now();
        const result = await this.transcriptionManager.transcribeFile(filePath, swiftOptions);
        const processingTime = Date.now() - startTime;
        
        if (result.success) {
          console.log(`⚡ Swift processing completed in ${processingTime}ms`);
          console.log(`📊 Performance: ${((processingTime / 1000) / (result.duration || 1)).toFixed(2)}x real-time`);
          console.log(`🎭 Speakers detected: ${result.speakers?.length || 0}`);
        }
        
        return result;
      } catch (error) {
        console.error('❌ Swift transcription error:', error);
        return {
          text: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as TranscriptionResult;
      }
    });

    // Transcribe dual streams with Swift-native speaker diarization
    ipcMain.handle('transcription:transcribe-dual-streams', async (
      event, 
      systemAudioPath?: string, 
      microphoneAudioPath?: string, 
      options: Record<string, unknown> = {}
    ) => {
      try {
        console.log('🎙️ Transcribing dual streams with Swift-native pipeline:', { systemAudioPath, microphoneAudioPath });
        
        // Check if system is initialized
        if (!this.isInitialized) {
          console.log('⚠️ Swift system not initialized, attempting initialization...');
          const success = await this.transcriptionManager.initialize();
          if (!success) {
            return {
              text: '',
              success: false,
              error: 'Swift-native transcription system not available'
            } as TranscriptionResult;
          }
          this.isInitialized = true;
        }
        
        // Swift-native system with FluidAudio provides superior diarization
        const swiftOptions = {
          ...options,
          // FluidAudio provides 17.7% DER vs ~25% with old pyannote
          enableDiarization: true, // Always enable for dual streams
        };
        
        console.log('🚀 Swift dual stream options:', swiftOptions);
        console.log('💡 Using FluidAudio diarization (17.7% DER, 50x faster)');
        
        const startTime = Date.now();
        const result = await this.transcriptionManager.transcribeDualStreams(
          systemAudioPath,
          microphoneAudioPath,
          swiftOptions
        );
        const processingTime = Date.now() - startTime;
        
        if (result.success) {
          console.log(`⚡ Swift dual stream processing completed in ${processingTime}ms`);
          console.log(`🎭 Total speakers detected: ${result.speakers?.length || 0}`);
        }
        
        return result;
      } catch (error) {
        console.error('❌ Swift dual stream transcription error:', error);
        return {
          text: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as TranscriptionResult;
      }
    });

    // Start streaming transcription (currently using batch mode with Swift-native processing)
    ipcMain.handle('transcription:start-stream', async (event, filePath: string) => {
      try {
        console.log('🌊 Starting stream transcription with Swift-native pipeline:', filePath);
        
        // Check if system is initialized
        if (!this.isInitialized) {
          console.log('⚠️ Swift system not initialized, attempting initialization...');
          const success = await this.transcriptionManager.initialize();
          if (!success) {
            return {
              text: '',
              success: false,
              error: 'Swift-native transcription system not available'
            } as TranscriptionResult;
          }
          this.isInitialized = true;
        }
        
        return await this.transcriptionManager.transcribeStream(filePath, (partialText) => {
          // Send progress updates to the renderer
          event.sender.send('transcription:progress', partialText);
        });
      } catch (error) {
        console.error('❌ Swift stream transcription error:', error);
        return {
          text: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as TranscriptionResult;
      }
    });

    // Get available models from Swift system
    ipcMain.handle('transcription:get-models', async () => {
      try {
        if (!this.isInitialized) {
          await this.initializeSwiftProcessing();
        }
        
        return await this.transcriptionManager.getAvailableModels();
      } catch (error) {
        console.error('Error getting available models:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          models: []
        };
      }
    });

    // Get system information from Swift system
    ipcMain.handle('transcription:get-system-info', async () => {
      try {
        if (!this.isInitialized) {
          await this.initializeSwiftProcessing();
        }
        
        return await this.transcriptionManager.getSystemInfo();
      } catch (error) {
        console.error('Error getting system info:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
  }

  /**
   * Cleanup resources when shutting down
   */
  public cleanup(): void {
    console.log('♻️ Cleaning up TranscriptionIPC...');
    if (this.transcriptionManager) {
      this.transcriptionManager.cleanup();
    }
    this.isInitialized = false;
  }
}