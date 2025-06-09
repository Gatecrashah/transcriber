import { useState, useCallback } from 'react';

interface TranscriptionState {
  isTranscribing: boolean;
  error: string | null;
}

interface TranscriptionResult {
  success: boolean;
  text: string;
  error?: string;
  duration?: number;
}

interface TranscriptionOptions {
  language?: string;
  threads?: number;
}

export const useTranscription = () => {
  const [state, setState] = useState<TranscriptionState>({
    isTranscribing: false,
    error: null,
  });

  const transcribe = useCallback(async (
    audioPath: string, 
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> => {
    if (!window.electronAPI?.transcription) {
      const error = 'Transcription API not available';
      setState(prev => ({ ...prev, error }));
      return { success: false, text: '', error };
    }

    setState(prev => ({ ...prev, isTranscribing: true, error: null }));

    try {
      // Set up progress listener
      const progressHandler = (partialText: string) => {
        // Could emit progress events here if needed
        console.log('Transcription progress:', partialText);
      };

      window.electronAPI.transcription.onProgress(progressHandler);

      const result = await window.electronAPI.transcription.transcribeFile(audioPath, {
        language: options.language || 'auto',
        threads: options.threads || 4,
      });

      // Clean up progress listener
      window.electronAPI.transcription.removeProgressListener();

      setState(prev => ({ ...prev, isTranscribing: false }));

      if (result.success) {
        return {
          success: true,
          text: result.text,
          duration: result.duration,
        };
      } else {
        setState(prev => ({ ...prev, error: result.error || 'Transcription failed' }));
        return {
          success: false,
          text: '',
          error: result.error,
        };
      }
    } catch (error) {
      setState(prev => ({ ...prev, isTranscribing: false }));
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      return {
        success: false,
        text: '',
        error: errorMessage,
      };
    }
  }, []);

  const checkInstallation = useCallback(async () => {
    if (!window.electronAPI?.transcription) {
      return { installed: false, error: 'Transcription API not available' };
    }

    try {
      return await window.electronAPI.transcription.checkInstallation();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { installed: false, error: errorMessage };
    }
  }, []);

  return {
    isTranscribing: state.isTranscribing,
    error: state.error,
    transcribe,
    checkInstallation,
  };
};