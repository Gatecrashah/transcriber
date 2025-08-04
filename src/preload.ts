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
    saveAudioFile: (audioData: ArrayBuffer) => ipcRenderer.invoke('audio:saveAudioFile', audioData),
    processDirectly: (audioData: ArrayBuffer) => ipcRenderer.invoke('audio:processDirectly', audioData),
    getDesktopSources: () => ipcRenderer.invoke('audio:getDesktopSources'),
    requestSystemAudioPermission: () => ipcRenderer.invoke('audio:requestSystemAudioPermission'),
  },
  transcription: {
    checkInstallation: () => ipcRenderer.invoke('transcription:check-installation'),
    transcribeFile: (filePath: string, options?: TranscriptionOptions) => ipcRenderer.invoke('transcription:transcribe-file', filePath, options),
    transcribeDualStreams: (systemAudioPath?: string, microphoneAudioPath?: string, options?: TranscriptionOptions) => ipcRenderer.invoke('transcription:transcribe-dual-streams', systemAudioPath, microphoneAudioPath, options),
    startStream: (filePath: string) => ipcRenderer.invoke('transcription:start-stream', filePath),
    processAudioBuffer: (audioData: Float32Array, sampleRate: number, channels: number) => {
      // Convert Float32Array to regular array for IPC serialization
      const audioArray = Array.from(audioData);
      return ipcRenderer.invoke('transcription:process-audio-buffer', audioArray, sampleRate, channels);
    },
    onProgress: (callback: (text: string) => void) => {
      ipcRenderer.on('transcription:progress', (_event, text) => callback(text));
    },
    onBufferProgress: (callback: (text: string) => void) => {
      ipcRenderer.on('transcription:buffer-progress', (_event, text) => callback(text));
    },
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners('transcription:progress');
    },
    removeBufferProgressListener: () => {
      ipcRenderer.removeAllListeners('transcription:buffer-progress');
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
        processDirectly: (audioData: ArrayBuffer) => Promise<{
          success: boolean;
          transcription?: TranscriptionResult;
          audioMetadata?: {
            sampleRate: number;
            channels: number;
            samples: number;
            duration: number;
          };
          error?: string;
        }>;
        getDesktopSources: () => Promise<DesktopSourcesResult>;
      };
      transcription: {
        checkInstallation: () => Promise<TranscriptionInstallationResult>;
        transcribeFile: (filePath: string, options?: TranscriptionOptions) => Promise<TranscriptionResult>;
        transcribeDualStreams: (systemAudioPath?: string, microphoneAudioPath?: string, options?: TranscriptionOptions) => Promise<TranscriptionResult>;
        startStream: (filePath: string) => Promise<TranscriptionResult>;
        processAudioBuffer: (audioData: Float32Array, sampleRate: number, channels: number) => Promise<TranscriptionResult>;
        onProgress: (callback: (text: string) => void) => void;
        onBufferProgress: (callback: (text: string) => void) => void;
        removeProgressListener: () => void;
        removeBufferProgressListener: () => void;
      };
    };
  }
}
