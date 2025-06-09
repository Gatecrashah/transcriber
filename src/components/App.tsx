import React, { useState, useEffect } from 'react';
import { Mic, MicOff, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { NotepadEditor } from './NotepadEditor';
import { TranscriptionPanel } from './TranscriptionPanel';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { useTranscription } from '../hooks/useTranscription';

export const App: React.FC = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  
  const {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
    error: audioError
  } = useAudioRecording();

  const {
    transcribe,
    isTranscribing,
    error: transcriptionError,
    checkInstallation
  } = useTranscription();

  // Initialize audio and transcription systems
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing Transcriper app...');
        
        // Initialize audio system
        if (window.electronAPI?.audio?.initialize) {
          console.log('Initializing audio system...');
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
    };

    initializeApp();
  }, [checkInstallation]);

  const handleToggleRecording = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (result.success && result.audioPath) {
        // Start transcription
        const transcriptionResult = await transcribe(result.audioPath);
        if (transcriptionResult.success && transcriptionResult.text.trim()) {
          setTranscriptionText(transcriptionResult.text.trim());
          // Open panel to show transcription
          setIsPanelOpen(true);
        }
      }
    } else {
      await startRecording();
    }
  };

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  return (
    <div className="app">
      {/* Main Content Area */}
      <div className={`main-content ${isPanelOpen ? 'panel-open' : ''}`}>
        {/* Header */}
        <header className="app-header">
          <div className="header-left">
            <h1 className="app-title">Transcriper</h1>
          </div>
          <div className="header-right">
            <button 
              className={`panel-toggle ${isPanelOpen ? 'active' : ''}`}
              onClick={togglePanel}
              title={isPanelOpen ? 'Close transcription panel' : 'Open transcription panel'}
            >
              {isPanelOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
            </button>
          </div>
        </header>

        {/* Notepad Editor */}
        <div className="editor-container">
          <NotepadEditor />
        </div>

        {/* Floating Record Button */}
        <div className="floating-controls">
          <button
            className={`record-button ${isRecording ? 'recording' : ''} ${!isInitialized ? 'initializing' : ''}`}
            onClick={handleToggleRecording}
            disabled={!isInitialized || isTranscribing}
            title={
              !isInitialized 
                ? 'Initializing...' 
                : isRecording 
                  ? 'Stop recording' 
                  : 'Start recording'
            }
          >
            {!isInitialized ? (
              <div className="spinner" />
            ) : isRecording ? (
              <MicOff size={24} />
            ) : (
              <Mic size={24} />
            )}
            {isRecording && isInitialized && (
              <div className="audio-level-indicator">
                <div 
                  className="audio-level-bar" 
                  style={{ height: `${audioLevel}%` }}
                />
              </div>
            )}
          </button>
          
          {!isInitialized && !initError && (
            <div className="initializing-indicator">
              <span>Initializing audio system...</span>
            </div>
          )}
          
          {isTranscribing && (
            <div className="transcribing-indicator">
              <div className="spinner" />
              <span>Transcribing...</span>
            </div>
          )}
        </div>

        {/* Error Messages */}
        {(initError || audioError || transcriptionError) && (
          <div className="error-toast">
            {initError || audioError || transcriptionError}
          </div>
        )}

        {/* Success/Info Messages */}
        {isInitialized && !isPanelOpen && !isRecording && !isTranscribing && (
          <div className="info-toast">
            💡 Ready to record! Click the microphone button to start capturing system audio
          </div>
        )}
      </div>

      {/* Transcription Side Panel */}
      <TranscriptionPanel 
        isOpen={isPanelOpen}
        transcriptionText={transcriptionText}
        onClose={() => setIsPanelOpen(false)}
        onInsertToNotepad={(text) => {
          // This will be handled by the notepad editor
          const event = new CustomEvent('insertText', { detail: text });
          document.dispatchEvent(event);
        }}
      />
    </div>
  );
};