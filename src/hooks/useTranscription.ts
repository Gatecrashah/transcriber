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
  speakers?: SpeakerSegment[];
}

interface SpeakerSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

interface TranscriptionOptions {
  language?: string;
  threads?: number;
  model?: string;
  temperature?: number;
  beam_size?: number;
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
        model: options.model || 'base',
        temperature: options.temperature || 0,
        beam_size: options.beam_size || 5,
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

  const transcribeDualStreams = useCallback(async (
    systemAudioPath?: string,
    microphoneAudioPath?: string,
    options: TranscriptionOptions & {
      systemSpeakerName?: string;
      microphoneSpeakerName?: string;
    } = {}
  ): Promise<TranscriptionResult> => {
    if (!window.electronAPI?.transcription) {
      const error = 'Transcription API not available';
      setState(prev => ({ ...prev, error }));
      return { success: false, text: '', error };
    }

    setState(prev => ({ ...prev, isTranscribing: true, error: null }));

    try {
      console.log('🎙️ Starting dual-stream transcription with speaker diarization');
      
      const result = await window.electronAPI.transcription.transcribeDualStreams(
        systemAudioPath,
        microphoneAudioPath,
        {
          language: options.language || 'en',
          threads: options.threads || 8,
          model: options.model || 'base',
          systemSpeakerName: options.systemSpeakerName || 'Meeting Participants',
          microphoneSpeakerName: options.microphoneSpeakerName || 'You',
        }
      );

      setState(prev => ({ ...prev, isTranscribing: false }));

      if (result.success) {
        console.log('✅ Dual-stream transcription successful with speaker identification');
        return {
          success: true,
          text: result.text,
          duration: result.duration,
          speakers: result.speakers,
        };
      } else {
        setState(prev => ({ ...prev, error: result.error || 'Dual-stream transcription failed' }));
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
    transcribeDualStreams,
    checkInstallation,
  };
};