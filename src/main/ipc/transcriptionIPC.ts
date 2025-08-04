import { ipcMain } from 'electron';
import { TranscriptionManager, TranscriptionResult } from '../transcription/transcriptionManagerSwift';

export class TranscriptionIPC {
  private transcriptionManager: TranscriptionManager;
  private isInitialized = false;
  private initializationPromise: Promise<boolean> | null = null;

  constructor() {
    console.log('🚀 Initializing TranscriptionIPC with Swift-native processing...');
    this.transcriptionManager = new TranscriptionManager();
    this.setupHandlers();
    
    // Initialize the Swift processing system
    this.initializationPromise = this.initializeSwiftProcessing();
  }

  private async initializeSwiftProcessing(): Promise<boolean> {
    try {
      console.log('🔄 Initializing Swift-native transcription system...');
      const success = await this.transcriptionManager.initialize();
      
      if (success) {
        this.isInitialized = true;
        console.log('✅ Swift-native transcription system initialized successfully');
        return true;
      } else {
        console.error('❌ Failed to initialize Swift-native transcription system');
        return false;
      }
    } catch (error) {
      console.error('❌ Error initializing Swift-native transcription system:', error);
      return false;
    }
  }

  private setupHandlers() {
    // Check if Swift-native transcription system is ready
    ipcMain.handle('transcription:check-installation', async () => {
      try {
        // Wait for initialization if it's still in progress
        if (!this.isInitialized && this.initializationPromise) {
          console.log('⏳ Waiting for Swift-native transcription system to initialize...');
          const success = await this.initializationPromise;
          if (!success) {
            return {
              installed: false,
              error: 'Swift-native transcription system failed to initialize',
              isSwiftNative: true
            };
          }
        }

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
          performance: 'High-performance native processing'
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
        
        const swiftOptions = {
          ...options,
          enableDiarization: options.enableDiarization !== false,
        };
        
        console.log('🚀 Swift transcription options:', swiftOptions);
        console.log('💡 Using WhisperKit + FluidAudio native processing');
        
        const startTime = Date.now();
        const result = await this.transcriptionManager.transcribeFile(filePath, swiftOptions);
        const processingTime = Date.now() - startTime;
        
        if (result.success) {
          console.log(`⚡ Processing completed in ${processingTime}ms`);
          console.log(`🎭 Speakers detected: ${result.speakers?.length || 0}`);
        }
        
        return result;
      } catch (error) {
        console.error('❌ Transcription error:', error);
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
        
        // Remove enableDiarization as it's not part of the Swift options interface
        const swiftOptions = {
          ...options
        };
        
        console.log('🚀 Dual stream options:', swiftOptions);
        console.log('💡 Using FluidAudio diarization');
        
        const startTime = Date.now();
        const result = await this.transcriptionManager.transcribeDualStreams(
          systemAudioPath,
          microphoneAudioPath,
          swiftOptions
        );
        const processingTime = Date.now() - startTime;
        
        if (result.success) {
          console.log(`⚡ Dual stream processing completed in ${processingTime}ms`);
          console.log(`🎭 Total speakers detected: ${result.speakers?.length || 0}`);
        }
        
        return result;
      } catch (error) {
        console.error('❌ Dual stream transcription error:', error);
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

    // NEW: Direct audio buffer transcription - no temp files!
    ipcMain.handle('transcription:process-audio-buffer', async (_, 
      audioData: Float32Array, 
      sampleRate: number,
      channels: number
    ) => {
      try {
        console.log('🚀 Direct buffer transcription - ZERO FILE I/O!');
        console.log(`   Buffer size: ${audioData.length} samples`);
        console.log(`   Sample rate: ${sampleRate}Hz, Channels: ${channels}`);
        
        // Ensure Swift system is initialized
        if (!this.isInitialized) {
          if (this.initializationPromise) {
            await this.initializationPromise;
          } else {
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
        }
        
        // Direct processing through our native Swift bridge
        const result = await this.transcriptionManager.processAudioBuffer(
          audioData,
          sampleRate
        );
        
        return result;
      } catch (error) {
        console.error('❌ Direct buffer transcription error:', error);
        return {
          text: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as TranscriptionResult;
      }
    });

  }

  /**
   * Get the transcription manager instance
   */
  public getTranscriptionManager(): TranscriptionManager {
    return this.transcriptionManager;
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