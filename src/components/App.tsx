import React, { useState, useEffect } from 'react';
import { Mic, Square, PanelRightOpen, PanelRightClose, ArrowLeft } from 'lucide-react';
import { NotepadEditor } from './NotepadEditor';
import { TranscriptionPanel } from './TranscriptionPanel';
import { Homepage } from './Homepage';
import { ErrorBoundary } from './ErrorBoundary';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { useTranscription } from '../hooks/useTranscription';
import { useNoteManagement } from '../hooks/useNoteManagement';
import { formatSpeakerTranscribedText, formatTranscribedText } from '../utils/textFormatter';
import '../styles/error-boundary.css';

export const App: React.FC = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
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
    deleteNote,
    addTranscriptionToCurrentNote,
    removeTranscriptionFromCurrentNote,
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

  // Helper function to generate unique IDs
  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  // Helper function to parse speaker segments from formatted text
  const parseSpeakerSegments = (text: string) => {
    const segments: Array<{ speaker: string; text: string; startTime: number; endTime: number; }> = [];
    const lines = text.split('\n');
    
    let currentSpeaker = '';
    let currentText = '';
    
    lines.forEach(line => {
      const speakerMatch = line.match(/^\*\*(.+?):\*\*$/);
      if (speakerMatch) {
        // Save previous speaker's text if any
        if (currentSpeaker && currentText.trim()) {
          segments.push({
            speaker: currentSpeaker,
            text: currentText.trim(),
            startTime: 0,
            endTime: 0
          });
        }
        // Start new speaker
        currentSpeaker = speakerMatch[1];
        currentText = '';
      } else if (line.trim() && currentSpeaker) {
        currentText += (currentText ? ' ' : '') + line.trim();
      }
    });
    
    // Add final speaker if any
    if (currentSpeaker && currentText.trim()) {
      segments.push({
        speaker: currentSpeaker,
        text: currentText.trim(),
        startTime: 0,
        endTime: 0
      });
    }
    
    return segments;
  };

  // Helper function to add transcription to current note
  const addTranscriptionToNote = (text: string, speakers?: Array<{ speaker: string; text: string; startTime: number; endTime: number; }>, model?: string) => {
    if (!currentNote) {
      console.warn('No current note available for transcription');
      return false;
    }

    const transcription = {
      id: generateId(),
      text: text.trim(),
      timestamp: new Date(),
      speakers,
      model,
    };

    console.log('Adding transcription to note:', { noteId: currentNote.id, transcriptionId: transcription.id });
    const success = addTranscriptionToCurrentNote(transcription);
    
    if (success) {
      // Open panel to show the new transcription
      setIsPanelOpen(true);
    }
    
    return success;
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      const result = await stopRecording();
      console.log('🎤 Stop recording result:', result);
      
      if (result.success) {
        console.log('🔄 Starting transcription for dual streams');
        
        // Check if we have dual-stream recording results
        if (result.systemAudioPath || result.microphoneAudioPath) {
          console.log('🎙️ Using dual-stream transcription with speaker diarization');
          
          try {
            const transcriptionResult = await transcribeDualStreams(
              result.systemAudioPath,
              result.microphoneAudioPath,
              {
                language: 'en',
                threads: 8,
                model: 'base',
                systemSpeakerName: 'Meeting Participants',
                microphoneSpeakerName: 'You',
              }
            );
            
            console.log('🗣️ Dual-stream transcription result:', transcriptionResult);
            
            if (transcriptionResult.success && transcriptionResult.text.trim()) {
              console.log('RAW SPEAKER TRANSCRIPTION:', transcriptionResult.text);
              // Apply speaker-specific formatting to clean up timestamps while preserving speaker labels
              const formattedText = formatSpeakerTranscribedText(transcriptionResult.text.trim());
              console.log('SPEAKER-IDENTIFIED TRANSCRIPTION:', formattedText);
              
              // Parse speaker segments for structured storage
              const speakers = parseSpeakerSegments(formattedText);
              
              // Add transcription to current note
              addTranscriptionToNote(formattedText, speakers, 'base');
            } else {
              console.error('❌ Dual-stream transcription failed:', transcriptionResult);
            }
          } catch (error) {
            console.error('❌ Dual-stream transcription error:', error);
          }
        } 
        // Fallback to single-stream transcription
        else if (result.audioPath) {
          console.log('🔄 Fallback to single-stream transcription for:', result.audioPath);
          
          try {
            const transcriptionResult = await transcribe(result.audioPath, {
              language: 'en',
              threads: 8,
              model: 'base',
            });
            
            if (transcriptionResult.success && transcriptionResult.text.trim()) {
              const formattedText = formatTranscribedText(transcriptionResult.text.trim());
              
              // Add transcription to current note (no speaker segments for single stream)
              addTranscriptionToNote(formattedText, undefined, 'base');
            }
          } catch (error) {
            console.error('❌ Single-stream transcription error:', error);
          }
        } else {
          console.error('❌ No audio data available for transcription');
        }
      } else {
        console.error('❌ Recording failed:', result);
      }
    } else {
      // Use dual audio capture for both system audio AND microphone simultaneously
      await startDualAudioCapture();
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

        {/* Notepad Editor */}
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
              <div className="audio-visualizer">
                {/* Show dual stream indicators when both are active */}
                {systemAudioActive && microphoneAudioActive ? (
                  <div className="dual-audio-bars">
                    <div className="audio-stream">
                      <div className="stream-label">🔊</div>
                      <div className="audio-bars">
                        {[...Array(2)].map((_, i) => (
                          <div
                            key={`sys-${i}`}
                            className="audio-bar system-audio"
                            style={{
                              animationDelay: `${i * 0.1}s`,
                              height: `${Math.min(100, 20 + systemAudioLevel * 0.8)}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="audio-stream">
                      <div className="stream-label">🎤</div>
                      <div className="audio-bars">
                        {[...Array(2)].map((_, i) => (
                          <div
                            key={`mic-${i}`}
                            className="audio-bar microphone-audio"
                            style={{
                              animationDelay: `${i * 0.1 + 0.05}s`,
                              height: `${Math.min(100, 20 + microphoneAudioLevel * 0.8)}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Single stream fallback */
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
                )}
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