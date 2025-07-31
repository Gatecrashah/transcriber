import { ipcMain, desktopCapturer } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function setupAudioIPC(): void {
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

  // Save audio file from browser recording
  ipcMain.handle('audio:saveAudioFile', async (_, audioData: ArrayBuffer) => {
    try {
      const fileName = `recording-${Date.now()}.wav`;
      const audioBuffer = Buffer.from(audioData);
      
      // Create temporary directory if it doesn't exist
      const tempDir = process.env.TMPDIR ? path.join(process.env.TMPDIR, 'TranscriperAudio') : '/tmp/TranscriperAudio';
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Create full file path
      const filePath = path.join(tempDir, fileName);
      
      // Write the audio buffer to file
      await fs.promises.writeFile(filePath, audioBuffer);
      
      console.log('✅ Audio file saved:', filePath);
      console.log('   Size:', audioBuffer.length, 'bytes');
      
      return { success: true, audioPath: filePath };
    } catch (error) {
      console.error('❌ Error saving audio file:', error);
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