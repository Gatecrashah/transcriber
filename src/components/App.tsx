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

  // Format transcribed text for better readability
  const formatTranscribedText = (text: string): string => {
    if (!text) return '';
    
    console.log('Original transcription:', text);
    
    // First pass: Remove ANSI color codes and timestamp artifacts
    let formatted = text
      // Remove ANSI color codes like [38;5;160m, [0m, [38;5;227m, etc.
      .replace(/\[[0-9;]+m/g, '')                          // All ANSI color codes
      
      // Remove ALL number-bracket timestamp patterns more aggressively
      .replace(/\b[0-9]+\s+[0-9]+\]\s*/g, '')              // "000 880]", "880 240]", etc.
      .replace(/[0-9]{2,}\s+[0-9]{2,}\]\s*/g, '')          // 2+ digit numbers with brackets
      .replace(/^[0-9]+\s+[0-9]+\]\s*/gm, '')              // At start of line
      .replace(/\s*[0-9]+\s+[0-9]+\]\s*/g, ' ')            // In middle of text with cleanup
      .replace(/^\s*[0-9]+\s+[0-9]+\]/gm, '')              // Start of line without trailing space
      
      // Remove subtitle-style timestamps completely
      .replace(/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\]/g, '') // Complete pattern
      .replace(/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}/g, '') // Without closing bracket
      .replace(/[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}/g, '') // Without brackets 
      
      // Remove common transcription artifacts  
      .replace(/\[\s*BLANK_AUDIO\s*\]/gi, '')              // "[BLANK_AUDIO]"
      .replace(/\[\s*LANK_UDIO\s*\]?/gi, '')               // Partial "[LANK_UDIO" fragments
      .replace(/\[\s*B?LANK_?A?UDIO\s*\]?/gi, '')          // Various fragments like [LANK_UDIO
      .replace(/\(speaking in foreign language\)/gi, '')
      .replace(/SPEAKER_[0-9A-Z]+:\s*/gi, '')
      .replace(/Speaker\s*[0-9A-Z]*:\s*/gi, '')
      
      // Clean up isolated dashes and punctuation artifacts
      .replace(/\s*-\.\s*/g, ' ')                          // "- ." patterns
      .replace(/^\s*[\.\-\[\]]+\s*/g, '')                  // Leading punctuation
      .replace(/\s*[\.\-\[\]]+\s*$/g, '')                  // Trailing punctuation  
      .replace(/\s*[\.\-]+\s+/g, ' ')                      // Isolated dots and dashes
      .replace(/\[\s*\]/g, '')                             // Empty brackets
      
      // Aggressive whitespace cleanup
      .replace(/[\t\r\n\f\v]+/g, ' ')                      // All whitespace types to space
      .replace(/\s{2,}/g, ' ')                             // Multiple spaces to single space  
      .replace(/\u00A0+/g, ' ')                            // Non-breaking spaces
      .replace(/\u2000-\u200B/g, ' ')                      // Various Unicode spaces
      .trim();

    // Second pass: Improve sentence structure and punctuation
    formatted = formatted
      // Fix missing periods between sentences (lowercase followed by capital)
      .replace(/([a-z])\s+([A-Z][a-z])/g, '$1. $2')
      // Fix periods followed by lowercase
      .replace(/\.\s*([a-z])/g, (match, letter) => '. ' + letter.toUpperCase())
      // Add periods to sentences that end without punctuation
      .replace(/([a-z])\s+(And|But|So|Then|Now|Well|Actually|However|Therefore)\s/g, '$1. $2 ')
      .replace(/([a-z])\s+(The|This|That|We|I|You|They|He|She|It)\s/g, '$1. $2 ')
      // Clean up multiple punctuation
      .replace(/[.]{2,}/g, '.')
      .replace(/[,]{2,}/g, ',')
      .replace(/[!]{2,}/g, '!')
      .replace(/[?]{2,}/g, '?')
      // Fix spacing around punctuation
      .replace(/\s+([.!?])/g, '$1')
      .replace(/([.!?])\s*([a-zA-Z])/g, '$1 $2')
      // Remove trailing punctuation artifacts
      .replace(/^[^\w]*/, '')
      .replace(/[^\w.!?]*$/, '');

    // Third pass: Split into proper sentences and format as readable paragraphs
    if (formatted.length > 0) {
      // Ensure first letter is capitalized
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
      
      // Split into sentences
      const sentences = formatted.split(/[.!?]+/).filter(s => s.trim().length > 0);
      
      // Group sentences into paragraphs (every 3-4 sentences)
      const paragraphs = [];
      for (let i = 0; i < sentences.length; i += 3) {
        const paragraphSentences = sentences.slice(i, i + 3);
        const paragraph = paragraphSentences
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(s => s.charAt(0).toUpperCase() + s.slice(1))
          .join('. ') + '.';
        
        if (paragraph.length > 1) {
          paragraphs.push(paragraph);
        }
      }
      
      // Join paragraphs with double line breaks for better readability
      formatted = paragraphs.join('\n\n');
    }
    
    // Final aggressive cleanup - remove any remaining multiple spaces
    formatted = formatted
      .replace(/\s{3,}/g, ' ')  // Replace 3+ spaces with single space first
      .replace(/\s{2,}/g, ' ')  // Then replace 2+ spaces with single space
      .replace(/\s+/g, ' ')     // Final cleanup for any remaining multiple spaces
      .replace(/\u00A0+/g, ' ') // Remove non-breaking spaces at the end too
      .trim();
    
    console.log('Formatted transcription:', formatted);
    return formatted;
  };

  // Note management
  const {
    currentNote,
    isOnHomepage,
    createNewNote,
    openNote,
    goToHomepage,
    updateCurrentNote,
    deleteNote,
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
        // Start transcription with specific language and model settings
        const transcriptionResult = await transcribe(result.audioPath, {
          language: 'en',    // Set to 'en' for English, 'auto' for auto-detect, or specific language codes
          threads: 4,        // Number of CPU threads to use
          model: 'large',   // Whisper model: tiny, base, small, medium, large (if supported)
        });
        if (transcriptionResult.success && transcriptionResult.text.trim()) {
          console.log('RAW TRANSCRIPTION:', transcriptionResult.text);
          const formattedText = formatTranscribedText(transcriptionResult.text.trim());
          console.log('FORMATTED TRANSCRIPTION:', formattedText);
          setTranscriptionText(formattedText);
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
        <Homepage 
          onCreateNote={createNewNote} 
          onOpenNote={openNote} 
          onDeleteNote={deleteNote}
        />
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