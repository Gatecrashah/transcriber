import React, { useState } from 'react';
import { Mic, Square, PanelRightOpen, PanelRightClose, ArrowLeft } from 'lucide-react';
import { NotepadEditor } from './NotepadEditor';
import { TranscriptionPanel } from './TranscriptionPanel';
import { Homepage } from './Homepage';
import { ErrorBoundary } from './ErrorBoundary';
import { AudioVisualizer } from './AudioVisualizer';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { useTranscription } from '../hooks/useTranscription';
import { useNoteManagement } from '../hooks/useNoteManagement';
import { useNoteTranscription } from '../hooks/useNoteTranscription';
import { useRecordingHandlers } from '../hooks/useRecordingHandlers';
import { useAppInitialization } from '../hooks/useAppInitialization';
// TODO: Create new SwiftKit-compatible text formatter
import '../styles/app.css';
import '../styles/notepad.css';
import '../styles/homepage.css';
import '../styles/transcription-panel.css';
import '../styles/error-boundary.css';

export const App: React.FC = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);


  // Note management
  const {
    currentNote,
    isOnHomepage,
    createNewNote,
    openNote,
    goToHomepage,
    updateCurrentNote,
    deleteNote,
    addTranscriptionToCurrentNote,
  } = useNoteManagement();
  
  const {
    isRecording,
    audioLevel,
    systemAudioLevel,
    microphoneAudioLevel,
    systemAudioActive,
    microphoneAudioActive,
    startDualAudioCapture,
    stopRecording,
    error: audioError
  } = useAudioRecording();


  const {
    transcribe,
    transcribeDualStreams,
    isTranscribing,
    error: transcriptionError,
    checkInstallation
  } = useTranscription();

  // Note transcription management
  const { addTranscriptionToNote } = useNoteTranscription({
    currentNote,
    addTranscriptionToCurrentNote,
    onTranscriptionAdded: () => setIsPanelOpen(true)
  });

  // Recording handlers
  const { handleToggleRecording } = useRecordingHandlers({
    isRecording,
    stopRecording,
    startDualAudioCapture,
    transcribeDualStreams,
    transcribe,
    addTranscriptionToNote
  });

  // App initialization
  const { isInitialized, initError } = useAppInitialization({
    checkInstallation
  });





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
        <ErrorBoundary>
          <Homepage 
            onCreateNote={createNewNote} 
            onOpenNote={openNote} 
            onDeleteNote={deleteNote}
          />
        </ErrorBoundary>
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


        {/* Note Editor */}
        <div className="editor-container">
          <ErrorBoundary>
            <NotepadEditor 
              initialContent={currentNote?.content || ''}
              onContentChange={(content) => updateCurrentNote({ content })}
            />
          </ErrorBoundary>
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
              <AudioVisualizer
                systemAudioLevel={systemAudioLevel}
                microphoneAudioLevel={microphoneAudioLevel}
                systemAudioActive={systemAudioActive}
                microphoneAudioActive={microphoneAudioActive}
                audioLevel={audioLevel}
              />
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
      <ErrorBoundary>
        <TranscriptionPanel 
          isOpen={isPanelOpen}
          noteTranscriptions={currentNote?.transcriptions || []}
          onClose={() => setIsPanelOpen(false)}
          onInsertToNotepad={(text) => {
            // This will be handled by the notepad editor
            const event = new CustomEvent('insertText', { detail: text });
            document.dispatchEvent(event);
          }}
        />
      </ErrorBoundary>
    </div>
  );
};