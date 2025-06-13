import { contextBridge, ipcRenderer } from 'electron';
import type { 
  AudioInitializationResult, 
  AudioDeviceResult, 
  AudioRecordingResult, 
  AudioLevelResult, 
  AudioStatusResult, 
  AudioSaveResult, 
  DesktopSourcesResult 
} from './types/audio';
import type { 
  TranscriptionResult, 
  TranscriptionInstallationResult, 
  TranscriptionOptions
} from './types/transcription';

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
    transcribeFile: (filePath: string, options?: TranscriptionOptions) => ipcRenderer.invoke('transcription:transcribe-file', filePath, options),
    transcribeDualStreams: (systemAudioPath?: string, microphoneAudioPath?: string, options?: TranscriptionOptions) => ipcRenderer.invoke('transcription:transcribe-dual-streams', systemAudioPath, microphoneAudioPath, options),
    startStream: (filePath: string) => ipcRenderer.invoke('transcription:start-stream', filePath),
    onProgress: (callback: (text: string) => void) => {
      ipcRenderer.on('transcription:progress', (_event, text) => callback(text));
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
        initialize: () => Promise<AudioInitializationResult>;
        getDevices: () => Promise<AudioDeviceResult>;
        startRecording: () => Promise<AudioInitializationResult>;
        startSystemCapture: () => Promise<AudioInitializationResult>;
        stopRecording: () => Promise<AudioRecordingResult>;
        getLevel: () => Promise<AudioLevelResult>;
        isRecording: () => Promise<AudioStatusResult>;
        saveAudioFile: (audioData: ArrayBuffer) => Promise<AudioSaveResult>;
        getDesktopSources: () => Promise<DesktopSourcesResult>;
      };
      transcription: {
        checkInstallation: () => Promise<TranscriptionInstallationResult>;
        transcribeFile: (filePath: string, options?: TranscriptionOptions) => Promise<TranscriptionResult>;
        transcribeDualStreams: (systemAudioPath?: string, microphoneAudioPath?: string, options?: TranscriptionOptions) => Promise<TranscriptionResult>;
        startStream: (filePath: string) => Promise<TranscriptionResult>;
        onProgress: (callback: (text: string) => void) => void;
        removeProgressListener: () => void;
      };
    };
  }
}
