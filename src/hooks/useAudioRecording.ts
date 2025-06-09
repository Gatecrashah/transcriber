import { useState, useEffect, useCallback } from 'react';

interface AudioRecordingState {
  isRecording: boolean;
  audioLevel: number;
  error: string | null;
}

interface AudioRecordingResult {
  success: boolean;
  audioPath?: string;
  error?: string;
}

export const useAudioRecording = () => {
  const [state, setState] = useState<AudioRecordingState>({
    isRecording: false,
    audioLevel: 0,
    error: null,
  });

  const [levelUpdateInterval, setLevelUpdateInterval] = useState<NodeJS.Timeout | null>(null);

  const updateAudioLevel = useCallback(async () => {
    if (state.isRecording && window.electronAPI?.audio?.getLevel) {
      try {
        const result = await window.electronAPI.audio.getLevel();
        if (result.success && result.level !== undefined) {
          setState(prev => ({ ...prev, audioLevel: result.level }));
        }
      } catch (error) {
        // Silently handle level monitoring errors
      }
    }
  }, [state.isRecording]);

  useEffect(() => {
    if (state.isRecording) {
      const interval = setInterval(updateAudioLevel, 100);
      setLevelUpdateInterval(interval);
    } else {
      if (levelUpdateInterval) {
        clearInterval(levelUpdateInterval);
        setLevelUpdateInterval(null);
      }
      setState(prev => ({ ...prev, audioLevel: 0 }));
    }

    return () => {
      if (levelUpdateInterval) {
        clearInterval(levelUpdateInterval);
      }
    };
  }, [state.isRecording, updateAudioLevel]);

  const startRecording = useCallback(async (): Promise<AudioRecordingResult> => {
    if (!window.electronAPI?.audio) {
      const error = 'Audio API not available';
      setState(prev => ({ ...prev, error }));
      return { success: false, error };
    }

    try {
      setState(prev => ({ ...prev, error: null }));
      
      // Check if audio system is initialized
      const initResult = await window.electronAPI.audio.initialize();
      if (!initResult.success) {
        const error = `Audio system not ready: ${initResult.error}`;
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }
      
      const result = await window.electronAPI.audio.startRecording();
      
      if (result.success) {
        setState(prev => ({ ...prev, isRecording: true }));
        return { success: true };
      } else {
        setState(prev => ({ ...prev, error: result.error || 'Failed to start recording' }));
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<AudioRecordingResult> => {
    if (!window.electronAPI?.audio) {
      const error = 'Audio API not available';
      setState(prev => ({ ...prev, error }));
      return { success: false, error };
    }

    try {
      const result = await window.electronAPI.audio.stopRecording();
      setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
      
      if (result.success) {
        return { success: true, audioPath: result.audioPath };
      } else {
        setState(prev => ({ ...prev, error: result.error || 'Failed to stop recording' }));
        return { success: false, error: result.error };
      }
    } catch (error) {
      setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, []);

  return {
    isRecording: state.isRecording,
    audioLevel: state.audioLevel,
    error: state.error,
    startRecording,
    stopRecording,
  };
};