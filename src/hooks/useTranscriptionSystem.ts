import { useState, useEffect, useCallback } from 'react';

interface SystemState {
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
}

/**
 * Simplified hook for transcription system initialization and checks
 * Removes all the unused file-based transcription methods
 */
export const useTranscriptionSystem = () => {
  const [state, setState] = useState<SystemState>({
    isInitialized: false,
    isInitializing: false,
    error: null,
  });

  // Check if transcription system is installed
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

  // Initialize the app (audio + transcription systems)
  const initialize = useCallback(async () => {
    if (state.isInitialized || state.isInitializing) return;

    setState(prev => ({ ...prev, isInitializing: true, error: null }));

    try {
      console.log('Initializing Transcriper systems...');

      // Initialize audio system for browser-based capture
      if (window.electronAPI?.audio?.initialize) {
        console.log('Initializing audio system...');
        const audioResult = await window.electronAPI.audio.initialize();
        if (!audioResult.success) {
          throw new Error(`Audio initialization failed: ${audioResult.error}`);
        }
        console.log('✅ Audio system initialized');
      } else {
        throw new Error('Audio API not available');
      }

      // Check transcription installation
      console.log('Checking transcription system...');
      const transcriptionResult = await checkInstallation();
      if (!transcriptionResult.installed) {
        console.warn(`Transcription system warning: ${transcriptionResult.error}`);
        // Don't fail - transcription might still work
      } else {
        console.log('✅ Transcription system ready');
      }

      setState(prev => ({
        ...prev,
        isInitialized: true,
        isInitializing: false,
        error: null
      }));
      console.log('✅ All systems initialized');

    } catch (error) {
      console.error('System initialization failed:', error);
      setState(prev => ({
        ...prev,
        isInitialized: false,
        isInitializing: false,
        error: error instanceof Error ? error.message : 'Unknown initialization error'
      }));
    }
  }, [state.isInitialized, state.isInitializing, checkInstallation]);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, []);  // Only run once on mount, not on every state change

  return {
    isInitialized: state.isInitialized,
    isInitializing: state.isInitializing,
    error: state.error,
    initialize,
    checkInstallation,
  };
};