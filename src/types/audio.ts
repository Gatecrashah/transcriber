/**
 * TypeScript interfaces for audio-related functionality
 */

export interface AudioDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
}

export interface AudioRecordingResult {
  success: boolean;
  audioPath?: string;
  systemAudioPath?: string;
  microphoneAudioPath?: string;
  error?: string;
}

export interface AudioInitializationResult {
  success: boolean;
  error?: string;
}

export interface AudioDeviceResult {
  success: boolean;
  devices?: AudioDevice[];
  error?: string;
}

export interface AudioLevelResult {
  success: boolean;
  level?: number;
  systemLevel?: number;
  microphoneLevel?: number;
  error?: string;
}

export interface AudioStatusResult {
  success: boolean;
  isRecording?: boolean;
  systemAudioActive?: boolean;
  microphoneAudioActive?: boolean;
  error?: string;
}

export interface AudioSaveResult {
  success: boolean;
  audioPath?: string;
  error?: string;
}

export interface DesktopSource {
  id: string;
  name: string;
  thumbnail?: string;
}

export interface DesktopSourcesResult {
  success: boolean;
  sources?: DesktopSource[];
  error?: string;
}

// Audio recording configuration
export interface AudioRecordingConfig {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  format?: 'wav' | 'mp3' | 'flac';
}

// Audio stream information
export interface AudioStreamInfo {
  isActive: boolean;
  level: number;
  sampleRate: number;
  channels: number;
  deviceId?: string;
}

// Dual audio capture state
export interface DualAudioState {
  systemAudio: AudioStreamInfo;
  microphoneAudio: AudioStreamInfo;
  isRecording: boolean;
  error?: string;
}