import { ipcMain } from 'electron';
import { TranscriptionManager, TranscriptionResult } from '../transcription/transcriptionManager';

export class TranscriptionIPC {
  private transcriptionManager: TranscriptionManager;

  constructor() {
    this.transcriptionManager = new TranscriptionManager();
    this.setupHandlers();
  }

  private setupHandlers() {
    // Check if whisper.cpp is installed
    ipcMain.handle('transcription:check-installation', async () => {
      try {
        return await this.transcriptionManager.checkInstallation();
      } catch (error) {
        console.error('Error checking transcription installation:', error);
        return {
          installed: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Transcribe a file
    ipcMain.handle('transcription:transcribe-file', async (event, filePath: string, options: Record<string, unknown> = {}) => {
      try {
        console.log('Transcribing file:', filePath);
        
        // Enable pyannote for testing if diarization is enabled
        const enhancedOptions = {
          ...options,
          usePyannote: options.enableDiarization === true, // Enable pyannote when diarization is requested
        };
        
        console.log('🎙️ Transcription options:', enhancedOptions);
        return await this.transcriptionManager.transcribeFile(filePath, enhancedOptions);
      } catch (error) {
        console.error('Error transcribing file:', error);
        return {
          text: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as TranscriptionResult;
      }
    });

    // Transcribe dual streams with speaker diarization
    ipcMain.handle('transcription:transcribe-dual-streams', async (
      event, 
      systemAudioPath?: string, 
      microphoneAudioPath?: string, 
      options: Record<string, unknown> = {}
    ) => {
      try {
        console.log('Transcribing dual streams:', { systemAudioPath, microphoneAudioPath });
        
        // Enable pyannote for testing - this gives the best speaker diarization
        const enhancedOptions = {
          ...options,
          usePyannote: true, // Always enable pyannote for dual streams (falls back to tinydiarize if unavailable)
        };
        
        console.log('🎙️ Dual stream options:', enhancedOptions);
        return await this.transcriptionManager.transcribeDualStreams(
          systemAudioPath,
          microphoneAudioPath,
          enhancedOptions
        );
      } catch (error) {
        console.error('Error transcribing dual streams:', error);
        return {
          text: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as TranscriptionResult;
      }
    });

    // Start streaming transcription
    ipcMain.handle('transcription:start-stream', async (event, filePath: string) => {
      try {
        console.log('Starting stream transcription for:', filePath);
        
        return await this.transcriptionManager.transcribeStream(filePath, (partialText) => {
          // Send progress updates to the renderer
          event.sender.send('transcription:progress', partialText);
        });
      } catch (error) {
        console.error('Error starting stream transcription:', error);
        return {
          text: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as TranscriptionResult;
      }
    });
  }
}