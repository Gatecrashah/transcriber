import React, { useState, useEffect } from 'react';
import { Mic, Square, PanelRightOpen, PanelRightClose, ArrowLeft } from 'lucide-react';
import { NotepadEditor } from './NotepadEditor';
import { TranscriptionPanel } from './TranscriptionPanel';
import { Homepage } from './Homepage';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { useTranscription } from '../hooks/useTranscription';
import { useNoteManagement } from '../hooks/useNoteManagement';

export const App: React.FC = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Note management
  const {
    currentNote,
    isOnHomepage,
    createNewNote,
    openNote,
    goToHomepage,
    updateCurrentNote,
  } = useNoteManagement();
  
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

  const handleTitleEdit = () => {
    setIsEditingTitle(true);
  };

  const handleTitleSave = (newTitle: string) => {
    const title = newTitle || 'Meeting Notes';
    updateCurrentNote({ title });
    setIsEditingTitle(false);
  };

  const formatDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Show homepage if on homepage, otherwise show note editor
  if (isOnHomepage) {
    return (
      <div className="app">
        <Homepage onCreateNote={createNewNote} onOpenNote={openNote} />
      </div>
    );
  }

  return (
    <div className="app">
      {/* Main Content Area */}
      <div className={`main-content ${isPanelOpen ? 'panel-open' : ''}`}>
        {/* Header */}
        <header className="app-header">
          <div className="header-left">
            <div className="note-meta">
              <button className="back-button" onClick={goToHomepage} title="Back to homepage">
                <ArrowLeft size={20} />
              </button>
              {isEditingTitle ? (
                <input
                  type="text"
                  className="note-title-input"
                  value={currentNote?.title || ''}
                  onChange={(e) => updateCurrentNote({ title: e.target.value })}
                  onBlur={() => handleTitleSave(currentNote?.title || '')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleTitleSave(currentNote?.title || '');
                    } else if (e.key === 'Escape') {
                      setIsEditingTitle(false);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <h1 className="note-title" onClick={handleTitleEdit}>
                  {currentNote?.title || 'Meeting Notes'}
                </h1>
              )}
            </div>
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

        {/* Date Badge */}
        <div className="note-date-container">
          <div className="note-date">{formatDate()}</div>
        </div>

        {/* Notepad Editor */}
        <div className="editor-container">
          <NotepadEditor 
            initialContent={currentNote?.content || ''}
            onContentChange={(content) => updateCurrentNote({ content })}
          />
        </div>

        {/* Floating Record Button */}
        <div className="floating-controls">
          {!isRecording ? (
            <button
              className={`record-button ${!isInitialized ? 'initializing' : ''}`}
              onClick={handleToggleRecording}
              disabled={!isInitialized || isTranscribing}
              title={!isInitialized ? 'Initializing...' : 'Start recording'}
            >
              {!isInitialized ? (
                <div className="spinner" />
              ) : (
                <Mic size={20} />
              )}
            </button>
          ) : (
            <div className="recording-controls">
              <div className="audio-visualizer">
                <div className="audio-bars">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="audio-bar"
                      style={{
                        animationDelay: `${i * 0.1}s`,
                        height: `${Math.min(100, 20 + audioLevel * 0.8)}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                className="stop-button"
                onClick={handleToggleRecording}
                title="Stop recording"
              >
                <Square size={14} />
              </button>
            </div>
          )}
          
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