import { ipcMain } from 'electron';
import { AudioManager } from '../audio/audioManager';

let audioManager: AudioManager | null = null;

export function setupAudioIPC(): void {
  // Initialize audio manager
  ipcMain.handle('audio:initialize', async () => {
    try {
      audioManager = new AudioManager();
      const success = await audioManager.initialize();
      return { success, error: success ? null : 'Failed to initialize audio manager' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get available audio devices
  ipcMain.handle('audio:getDevices', async () => {
    try {
      if (!audioManager) {
        throw new Error('Audio manager not initialized');
      }
      const devices = await audioManager.getAudioDevices();
      return { success: true, devices };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Start recording
  ipcMain.handle('audio:startRecording', async () => {
    try {
      if (!audioManager) {
        throw new Error('Audio manager not initialized');
      }
      
      const success = await audioManager.startRecording();
      return { success, error: success ? null : 'Failed to start recording' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Stop recording
  ipcMain.handle('audio:stopRecording', async () => {
    try {
      if (!audioManager) {
        throw new Error('Audio manager not initialized');
      }
      
      const success = await audioManager.stopRecording();
      const audioPath = audioManager.getOutputPath();
      
      return { 
        success, 
        audioPath: success ? audioPath : null,
        error: success ? null : 'Failed to stop recording' 
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get current audio level
  ipcMain.handle('audio:getLevel', () => {
    try {
      if (!audioManager) {
        return { success: false, level: 0, error: 'Audio manager not initialized' };
      }
      
      const level = audioManager.getAudioLevel();
      return { success: true, level };
    } catch (error) {
      return { success: false, level: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Check if recording
  ipcMain.handle('audio:isRecording', () => {
    try {
      if (!audioManager) {
        return { success: false, isRecording: false, error: 'Audio manager not initialized' };
      }
      
      const isRecording = audioManager.isCurrentlyRecording();
      return { success: true, isRecording };
    } catch (error) {
      return { success: false, isRecording: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  console.log('Audio IPC handlers registered');
}

export function cleanupAudioIPC(): void {
  if (audioManager) {
    audioManager.cleanup();
    audioManager = null;
  }
}