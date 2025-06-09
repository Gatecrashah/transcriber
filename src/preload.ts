import { contextBridge, ipcRenderer } from 'electron';

// Expose audio API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  audio: {
    initialize: () => ipcRenderer.invoke('audio:initialize'),
    getDevices: () => ipcRenderer.invoke('audio:getDevices'),
    startRecording: () => ipcRenderer.invoke('audio:startRecording'),
    stopRecording: () => ipcRenderer.invoke('audio:stopRecording'),
    getLevel: () => ipcRenderer.invoke('audio:getLevel'),
    isRecording: () => ipcRenderer.invoke('audio:isRecording'),
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
        stopRecording: () => Promise<{ success: boolean; audioPath?: string; error?: string }>;
        getLevel: () => Promise<{ success: boolean; level?: number; error?: string }>;
        isRecording: () => Promise<{ success: boolean; isRecording?: boolean; error?: string }>;
      };
    };
  }
}
