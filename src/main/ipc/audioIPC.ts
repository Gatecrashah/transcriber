import { ipcMain, desktopCapturer } from 'electron';
import type { TranscriptionManager } from '../transcription/transcriptionManagerSwift';

// Store reference to transcription manager
let transcriptionManager: TranscriptionManager | null = null;

export function setupAudioIPC(transcriptionMgr?: TranscriptionManager): void {
  // Store the transcription manager reference if provided
  if (transcriptionMgr) {
    transcriptionManager = transcriptionMgr;
  }
  // Get available desktop sources for capture
  ipcMain.handle('audio:getDesktopSources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        // Don't request thumbnails to avoid IPC message size issues
        thumbnailSize: { width: 0, height: 0 }
      });
      
      return { 
        success: true, 
        sources: sources.map(source => ({
          id: source.id,
          name: source.name
        }))
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // DEPRECATED: Save audio file from browser recording
  // This is kept only for backward compatibility - use processDirectly instead!
  ipcMain.handle('audio:saveAudioFile', async (_, audioData: ArrayBuffer) => {
    console.warn('⚠️ DEPRECATED: saveAudioFile called - use processDirectly for zero file I/O!');
    return { 
      success: false, 
      error: 'File-based audio processing is deprecated. Use processDirectly for zero file I/O.' 
    };
  });

  // NEW: Process audio without saving to file - returns transcription directly!
  ipcMain.handle('audio:processDirectly', async (_, audioData: ArrayBuffer) => {
    try {
      console.log('🚀 Direct audio processing - NO FILE I/O!');
      const audioBuffer = Buffer.from(audioData);
      
      // Debug: Check first few bytes to identify format
      const first4Bytes = audioBuffer.slice(0, 4).toString('ascii');
      console.log(`   First 4 bytes: "${first4Bytes}" (should be "RIFF" for WAV)`);
      
      // Parse WAV header to get audio parameters
      const sampleRate = audioBuffer.readUInt32LE(24);
      const channels = audioBuffer.readUInt16LE(22);
      const bitsPerSample = audioBuffer.readUInt16LE(34);
      
      // Skip WAV header (44 bytes) and extract raw audio data
      const dataStart = 44;
      const audioDataBytes = audioBuffer.slice(dataStart);
      
      // Convert to Float32Array
      const samples = audioDataBytes.length / (bitsPerSample / 8);
      const audioFloat32 = new Float32Array(samples);
      
      // Debug: Check if we're getting actual audio data
      let nonZeroSamples = 0;
      
      if (bitsPerSample === 16) {
        for (let i = 0; i < samples; i++) {
          const sample = audioDataBytes.readInt16LE(i * 2);
          audioFloat32[i] = sample / 32768.0; // Convert to -1.0 to 1.0 range
          if (Math.abs(audioFloat32[i]) > 0.001) nonZeroSamples++;
        }
      } else if (bitsPerSample === 32) {
        for (let i = 0; i < samples; i++) {
          audioFloat32[i] = audioDataBytes.readFloatLE(i * 4);
          if (Math.abs(audioFloat32[i]) > 0.001) nonZeroSamples++;
        }
      }
      
      console.log(`   Sample rate: ${sampleRate}Hz, Channels: ${channels}, Bits: ${bitsPerSample}`);
      console.log(`   Processing ${audioFloat32.length} samples`);
      console.log(`   Non-zero samples: ${nonZeroSamples} (${(nonZeroSamples/samples*100).toFixed(1)}%)`);
      
      // Debug: Show first few samples
      const firstSamples = Array.from(audioFloat32.slice(0, 10)).map(s => s.toFixed(4)).join(', ');
      console.log(`   First 10 samples: [${firstSamples}]`);
      
      // Use the existing transcription manager
      if (!transcriptionManager) {
        throw new Error('Transcription manager not initialized');
      }
      
      // Process through our direct transcription pipeline
      const result = await transcriptionManager.processAudioBuffer(
        audioFloat32,
        sampleRate
      );
      
      return { 
        success: true, 
        transcription: result,
        audioMetadata: {
          sampleRate,
          channels,
          samples: audioFloat32.length,
          duration: audioFloat32.length / sampleRate
        }
      };
    } catch (error) {
      console.error('❌ Error in direct audio processing:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Request system audio permission (placeholder - permissions handled by getDisplayMedia)
  ipcMain.handle('audio:requestSystemAudioPermission', async () => {
    try {
      // In modern Electron, getDisplayMedia() handles permissions automatically
      // This is mainly for compatibility with existing code
      return { 
        success: true, 
        message: 'System audio permission handled by getDisplayMedia()' 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Minimal initialization for compatibility
  ipcMain.handle('audio:initialize', async () => {
    try {
      // Browser-based audio capture doesn't need initialization
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  console.log('Minimal audio IPC handlers registered (browser-based recording support)');
}

export function cleanupAudioIPC(): void {
  // No cleanup needed for minimal handlers
}