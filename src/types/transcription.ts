/**
 * TypeScript interfaces for transcription-related functionality
 */

export interface SpeakerSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface TranscriptionResult {
  text: string;
  success: boolean;
  error?: string;
  duration?: number;
  speakers?: SpeakerSegment[];
  language?: string;
}

export interface TranscriptionOptions {
  language?: string;
  threads?: number;
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v3';
  outputFormat?: 'txt' | 'json' | 'srt' | 'vtt';
  enableDiarization?: boolean;
  speakerLabel?: string;
  systemSpeakerName?: string;
  microphoneSpeakerName?: string;
}

export interface TranscriptionInstallationResult {
  installed: boolean;
  error?: string;
}

export interface WhisperModelInfo {
  name: string;
  size: number;
  path: string;
  isValid: boolean;
  downloadUrl?: string;
}

export interface TranscriptionProgress {
  progress: number; // 0-100
  currentStep: string;
  estimatedTimeRemaining?: number;
}

// Whisper.cpp specific interfaces
export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  speaker_id?: number;
  confidence?: number;
  avg_logprob?: number;
  no_speech_prob?: number;
}

export interface WhisperOutput {
  text: string;
  segments?: WhisperSegment[];
  language?: string;
  duration?: number;
}

// Voice Activity Detection
export interface VADResult {
  hasVoice: boolean;
  confidence: number;
  segments?: Array<{
    start: number;
    end: number;
    confidence: number;
  }>;
}

// Audio analysis results
export interface AudioAnalysis {
  hasAudio: boolean;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
  format?: string;
  info?: string;
}

// Diarization-specific types
export interface DiarizationResult {
  speakers: SpeakerSegment[];
  speakerCount: number;
  confidence: number;
}

export interface TinydiarizeOptions {
  modelPath: string;
  language?: string;
  minSpeakers?: number;
  maxSpeakers?: number;
}