import { contextBridge, ipcRenderer } from 'electron';

// Expose audio and transcription APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  audio: {
    initialize: () => ipcRenderer.invoke('audio:initialize'),
    getDevices: () => ipcRenderer.invoke('audio:getDevices'),
    startRecording: () => ipcRenderer.invoke('audio:startRecording'),
    startSystemCapture: () => ipcRenderer.invoke('audio:startSystemCapture'),
    stopRecording: () => ipcRenderer.invoke('audio:stopRecording'),
    getLevel: () => ipcRenderer.invoke('audio:getLevel'),
    isRecording: () => ipcRenderer.invoke('audio:isRecording'),
    saveAudioFile: (audioData: ArrayBuffer) => ipcRenderer.invoke('audio:saveAudioFile', audioData),
    getDesktopSources: () => ipcRenderer.invoke('audio:getDesktopSources'),
  },
  transcription: {
    checkInstallation: () => ipcRenderer.invoke('transcription:check-installation'),
    transcribeFile: (filePath: string, options?: Record<string, unknown>) => ipcRenderer.invoke('transcription:transcribe-file', filePath, options),
    startStream: (filePath: string) => ipcRenderer.invoke('transcription:start-stream', filePath),
    onProgress: (callback: (text: string) => void) => {
      ipcRenderer.on('transcription:progress', (event, text) => callback(text));
    },
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners('transcription:progress');
    }
  }
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      audio: {
        initialize: () => Promise<{ success: boolean; error?: string }>;
        getDevices: () => Promise<{ success: boolean; devices?: any[]; error?: string }>;
        startRecording: () => Promise<{ success: boolean; error?: string }>;
        startSystemCapture: () => Promise<{ success: boolean; error?: string }>;
        stopRecording: () => Promise<{ success: boolean; audioPath?: string; error?: string }>;
        getLevel: () => Promise<{ success: boolean; level?: number; error?: string }>;
        isRecording: () => Promise<{ success: boolean; isRecording?: boolean; error?: string }>;
        saveAudioFile: (audioData: ArrayBuffer) => Promise<{ success: boolean; audioPath?: string; error?: string }>;
        getDesktopSources: () => Promise<{ success: boolean; sources?: Array<{id: string; name: string}>; error?: string }>;
      };
      transcription: {
        checkInstallation: () => Promise<{ installed: boolean; error?: string }>;
        transcribeFile: (filePath: string, options?: Record<string, unknown>) => Promise<{ text: string; success: boolean; error?: string; duration?: number }>;
        startStream: (filePath: string) => Promise<{ text: string; success: boolean; error?: string }>;
        onProgress: (callback: (text: string) => void) => void;
        removeProgressListener: () => void;
      };
    };
  }
}
