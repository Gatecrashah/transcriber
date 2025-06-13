import React, { useState, useEffect } from 'react';
import { Plus, FileText, Calendar, Search, Trash2 } from 'lucide-react';
import type { Note, SerializedNote } from '../types/notes';

interface HomepageProps {
  onCreateNote: () => void;
  onOpenNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
}

export const Homepage: React.FC<HomepageProps> = ({ onCreateNote, onOpenNote, onDeleteNote }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Load notes from localStorage
    loadNotes();
  }, []);

  const loadNotes = () => {
    try {
      const savedNotes = localStorage.getItem('transcriper-notes');
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes).map((note: SerializedNote) => ({
          ...note,
          createdAt: new Date(note.createdAt),
          updatedAt: new Date(note.updatedAt),
          transcriptions: note.transcriptions?.map(t => ({
            ...t,
            timestamp: new Date(t.timestamp)
          })) || []
        }));
        setNotes(parsedNotes.sort((a: Note, b: Note) => b.updatedAt.getTime() - a.updatedAt.getTime()));
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  };

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const getPreviewText = (content: string) => {
    // Remove HTML tags and get first 100 characters
    const plainText = content.replace(/<[^>]*>/g, '').trim();
    return plainText.length > 100 ? plainText.substring(0, 100) + '...' : plainText;
  };

  const handleDeleteNote = (noteId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent opening the note when clicking delete
    if (window.confirm('Are you sure you want to delete this note?')) {
      if (onDeleteNote) {
        onDeleteNote(noteId);
      }
      // Remove from local state immediately
      setNotes(prev => prev.filter(note => note.id !== noteId));
    }
  };

  return (
    <div className="homepage">
      {/* Header */}
      <header className="homepage-header">
        <div className="header-content">
          <h1 className="homepage-title">Transcriper</h1>
          <button className="new-note-button" onClick={onCreateNote}>
            <Plus size={16} />
            New Note
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Notes List */}
      <div className="notes-container">
        {filteredNotes.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} className="empty-icon" />
            <h3>No notes yet</h3>
            <p>Create your first meeting note to get started with transcription.</p>
            <button className="create-first-note-button" onClick={onCreateNote}>
              <Plus size={16} />
              Create First Note
            </button>
          </div>
        ) : (
          <div className="notes-list">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="note-item"
                onClick={() => onOpenNote(note)}
              >
                <div className="note-content">
                  <div className="note-header">
                    <div className="note-header-left">
                      <h3 className="note-title">{note.title}</h3>
                    </div>
                    <div className="note-header-right">
                      <span className="note-date">{formatDate(note.updatedAt)}</span>
                      <button
                        className="delete-button"
                        onClick={(e) => handleDeleteNote(note.id, e)}
                        title="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {note.content && (
                    <p className="note-preview">{getPreviewText(note.content)}</p>
                  )}
                  {note.transcriptions && note.transcriptions.length > 0 && (
                    <div className="transcription-indicator">
                      <FileText size={14} />
                      <span>{note.transcriptions.length} transcription{note.transcriptions.length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
                <div className="note-meta">
                  <Calendar size={14} />
                  <span>{note.createdAt.toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};