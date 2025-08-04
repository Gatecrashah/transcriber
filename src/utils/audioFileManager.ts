// Audio file saving utilities
import type { TranscriptionResult } from '../types/transcription';

/**
 * Save audio blob to temporary file via Electron IPC
 * @deprecated Use processAudioDirectly for zero file I/O
 */
export const saveAudioFile = async (audioBlob: Blob): Promise<string> => {
  const arrayBuffer = await audioBlob.arrayBuffer();
  
  if (window.electronAPI?.audio?.saveAudioFile) {
    const result = await window.electronAPI.audio.saveAudioFile(arrayBuffer);
    if (result.success) {
      return result.audioPath;
    }
  }
  
  // Fallback: create a local URL (won't work for transcription, but for debugging)
  return URL.createObjectURL(audioBlob);
};

/**
 * Process audio directly without creating temporary files
 * This is the new ZERO FILE I/O approach!
 */
export const processAudioDirectly = async (audioBlob: Blob): Promise<{
  transcription?: TranscriptionResult;
  audioMetadata?: {
    sampleRate: number;
    channels: number;
    samples: number;
    duration: number;
  };
  error?: string;
}> => {
  const arrayBuffer = await audioBlob.arrayBuffer();
  
  if (window.electronAPI?.audio?.processDirectly) {
    const result = await window.electronAPI.audio.processDirectly(arrayBuffer);
    return result;
  }
  
  return { error: 'Direct audio processing not available' };
};