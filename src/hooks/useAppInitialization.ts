import { useState, useEffect, useCallback } from 'react';

interface UseAppInitializationProps {
  checkInstallation: () => Promise<{ installed: boolean; error?: string }>;
}

export const useAppInitialization = ({ checkInstallation }: UseAppInitializationProps) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const initializeApp = useCallback(async () => {
    try {
      console.log('Initializing Transcriper app...');
      
      // Initialize minimal audio system for browser-based capture
      if (window.electronAPI?.audio?.initialize) {
        console.log('Initializing minimal audio system for browser-based capture...');
        const audioResult = await window.electronAPI.audio.initialize();
        if (!audioResult.success) {
          throw new Error(`Audio initialization failed: ${audioResult.error}`);
        }
        console.log('Audio system initialized successfully');
      } else {
        throw new Error('Audio API not available');
      }

      // Check transcription installation
      console.log('Checking transcription system...');
      const transcriptionResult = await checkInstallation();
      if (!transcriptionResult.installed) {
        console.warn(`Transcription system not fully available: ${transcriptionResult.error}`);
        // Don't throw error - transcription might still work
      } else {
        console.log('Transcription system ready');
      }

      setIsInitialized(true);
      console.log('App initialization complete');
    } catch (error) {
      console.error('App initialization failed:', error);
      setInitError(error instanceof Error ? error.message : 'Unknown initialization error');
    }
  }, [checkInstallation]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  return {
    isInitialized,
    initError,
    initializeApp
  };
};