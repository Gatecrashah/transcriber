import React, { useState, useRef, useEffect } from 'react';
import { X, Copy, Plus, Trash2, FileText } from 'lucide-react';

interface TranscriptionSegment {
  id: string;
  text: string;
  timestamp: Date;
  inserted: boolean;
}

interface TranscriptionPanelProps {
  isOpen: boolean;
  transcriptionText: string;
  onClose: () => void;
  onInsertToNotepad: (text: string) => void;
}

export const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({
  isOpen,
  transcriptionText,
  onClose,
  onInsertToNotepad,
}) => {
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Add new transcription text as segments
  useEffect(() => {
    if (transcriptionText.trim()) {
      const newSegment: TranscriptionSegment = {
        id: Date.now().toString(),
        text: transcriptionText.trim(),
        timestamp: new Date(),
        inserted: false,
      };
      setSegments(prev => [newSegment, ...prev]);
    }
  }, [transcriptionText]);

  const handleInsertSegment = (segment: TranscriptionSegment) => {
    onInsertToNotepad(segment.text);
    setSegments(prev => 
      prev.map(s => 
        s.id === segment.id 
          ? { ...s, inserted: true }
          : s
      )
    );
  };

  const handleInsertSelected = () => {
    const selectedText = segments
      .filter(s => selectedSegments.has(s.id))
      .map(s => s.text)
      .join('\n\n');
    
    if (selectedText) {
      onInsertToNotepad(selectedText);
      setSegments(prev => 
        prev.map(s => 
          selectedSegments.has(s.id)
            ? { ...s, inserted: true }
            : s
        )
      );
      setSelectedSegments(new Set());
    }
  };

  const handleCopySegment = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleDeleteSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
    setSelectedSegments(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const toggleSegmentSelection = (id: string) => {
    setSelectedSegments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div 
      ref={panelRef}
      className={`transcription-panel ${isOpen ? 'open' : ''}`}
    >
      <div className="panel-header">
        <div className="panel-title">
          <FileText size={18} />
          <span>Transcriptions</span>
        </div>
        <div className="panel-actions">
          {selectedSegments.size > 0 && (
            <>
              <button
                className="action-button primary"
                onClick={handleInsertSelected}
                title={`Insert ${selectedSegments.size} selected transcription(s)`}
              >
                <Plus size={16} />
                Insert ({selectedSegments.size})
              </button>
            </>
          )}
          <button 
            className="close-button"
            onClick={onClose}
            title="Close panel"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="panel-content">
        {segments.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>No transcriptions yet</h3>
            <p>Start recording to see your transcriptions here</p>
          </div>
        ) : (
          <div className="segments-list">
            {segments.map((segment) => (
              <div 
                key={segment.id}
                className={`segment ${segment.inserted ? 'inserted' : ''} ${selectedSegments.has(segment.id) ? 'selected' : ''}`}
              >
                <div className="segment-header">
                  <input
                    type="checkbox"
                    checked={selectedSegments.has(segment.id)}
                    onChange={() => toggleSegmentSelection(segment.id)}
                    className="segment-checkbox"
                  />
                  <span className="segment-time">{formatTime(segment.timestamp)}</span>
                  <div className="segment-actions">
                    <button
                      className="action-button"
                      onClick={() => handleCopySegment(segment.text)}
                      title="Copy to clipboard"
                    >
                      <Copy size={14} />
                    </button>
                    {!segment.inserted && (
                      <button
                        className="action-button primary"
                        onClick={() => handleInsertSegment(segment)}
                        title="Insert into notepad"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                    <button
                      className="action-button danger"
                      onClick={() => handleDeleteSegment(segment.id)}
                      title="Delete transcription"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="segment-text">
                  {segment.text}
                  {segment.inserted && (
                    <span className="inserted-badge">Inserted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};