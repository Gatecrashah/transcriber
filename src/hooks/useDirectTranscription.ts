import { useState, useCallback } from 'react';
import { TranscriptionResult } from '../types/transcription';

/**
 * Hook for direct audio buffer transcription - ZERO FILE I/O!
 * This bypasses all temp file creation and processes audio directly in memory.
 */
export const useDirectTranscription = () => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribeAudioBuffer = useCallback(async (
    audioData: Float32Array,
    sampleRate: number,
    channels: number
  ): Promise<TranscriptionResult | null> => {
    if (!window.electronAPI?.transcription?.processAudioBuffer) {
      setError('Direct transcription API not available');
      return null;
    }

    setIsTranscribing(true);
    setError(null);

    try {
      console.log('🚀 Direct buffer transcription - bypassing all file I/O!');
      console.log(`   Processing ${audioData.length} samples at ${sampleRate}Hz`);
      
      const startTime = performance.now();
      const result = await window.electronAPI.transcription.processAudioBuffer(
        audioData,
        sampleRate,
        channels
      );
      
      const processingTime = performance.now() - startTime;
      console.log(`⚡ Direct transcription completed in ${processingTime.toFixed(2)}ms`);
      
      if (!result.success) {
        setError(result.error || 'Transcription failed');
        return null;
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('❌ Direct transcription error:', err);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  /**
   * Process audio blob directly without creating temp files
   */
  const transcribeAudioBlob = useCallback(async (
    audioBlob: Blob,
    sampleRate: number = 16000,
    channels: number = 1
  ): Promise<TranscriptionResult | null> => {
    try {
      // Convert blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Decode audio data (assuming it's already WAV format)
      const audioContext = new AudioContext({ sampleRate });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Extract audio data as Float32Array
      const audioData = audioBuffer.getChannelData(0); // Get first channel
      
      // Direct transcription - no files!
      return await transcribeAudioBuffer(audioData, sampleRate, channels);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('❌ Audio blob processing error:', err);
      return null;
    }
  }, [transcribeAudioBuffer]);

  return {
    transcribeAudioBuffer,
    transcribeAudioBlob,
    isTranscribing,
    error
  };
};