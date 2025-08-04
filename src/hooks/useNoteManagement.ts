import { useState, useCallback } from 'react';
import type { Note, NoteTranscription, SerializedNote } from '../types/notes';

export const useNoteManagement = () => {
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [isOnHomepage, setIsOnHomepage] = useState(true);
  const [noteTitle, setNoteTitle] = useState('Meeting Notes');

  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  const serializeNote = (note: Note): SerializedNote => {
    return {
      ...note,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      transcriptions: note.transcriptions?.map(t => ({
        ...t,
        timestamp: t.timestamp.toISOString()
      }))
    };
  };

  const deserializeNote = (serializedNote: SerializedNote): Note => {
    return {
      ...serializedNote,
      createdAt: new Date(serializedNote.createdAt),
      updatedAt: new Date(serializedNote.updatedAt),
      transcriptions: serializedNote.transcriptions?.map(t => ({
        ...t,
        timestamp: new Date(t.timestamp)
      }))
    };
  };

  const saveNote = useCallback((note: Note) => {
    try {
      const savedNotes = localStorage.getItem('transcriper-notes');
      let notes: SerializedNote[] = [];
      
      if (savedNotes) {
        notes = JSON.parse(savedNotes);
      }

      const serializedNote = serializeNote(note);
      const existingIndex = notes.findIndex(n => n.id === note.id);
      
      if (existingIndex >= 0) {
        // Update existing note
        notes[existingIndex] = {
          ...serializedNote,
          updatedAt: new Date().toISOString(),
        };
      } else {
        // Add new note
        notes.push({
          ...serializedNote,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      localStorage.setItem('transcriper-notes', JSON.stringify(notes));
      return true;
    } catch (error) {
      console.error('Failed to save note:', error);
      return false;
    }
  }, []);

  const createNewNote = useCallback(() => {
    const newNote: Note = {
      id: generateId(),
      title: noteTitle,
      content: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptions: [],
    };
    
    setCurrentNote(newNote);
    setIsOnHomepage(false);
    return newNote;
  }, [noteTitle]);

  const openNote = useCallback((note: Note) => {
    setCurrentNote(note);
    setIsOnHomepage(false);
  }, []);

  const goToHomepage = useCallback(() => {
    // Save current note before going to homepage
    if (currentNote) {
      saveNote(currentNote);
    }
    setIsOnHomepage(true);
    setCurrentNote(null);
  }, [currentNote, saveNote]);

  const updateCurrentNote = useCallback((updates: Partial<Pick<Note, 'title' | 'content' | 'meetingType'>>) => {
    if (currentNote) {
      const updatedNote = {
        ...currentNote,
        ...updates,
        updatedAt: new Date(),
      };
      setCurrentNote(updatedNote);
      
      // Auto-save after a delay
      setTimeout(() => {
        saveNote(updatedNote);
      }, 1000);
    }
  }, [currentNote, saveNote]);

  const addTranscriptionToCurrentNote = useCallback((transcription: NoteTranscription) => {
    if (currentNote) {
      const updatedNote = {
        ...currentNote,
        transcriptions: [...(currentNote.transcriptions || []), transcription],
        updatedAt: new Date(),
      };
      setCurrentNote(updatedNote);
      saveNote(updatedNote);
      return true;
    }
    return false;
  }, [currentNote, saveNote]);

  const removeTranscriptionFromCurrentNote = useCallback((transcriptionId: string) => {
    if (currentNote) {
      const updatedNote = {
        ...currentNote,
        transcriptions: currentNote.transcriptions?.filter(t => t.id !== transcriptionId) || [],
        updatedAt: new Date(),
      };
      setCurrentNote(updatedNote);
      saveNote(updatedNote);
      return true;
    }
    return false;
  }, [currentNote, saveNote]);

  // Convenience method for adding transcription with minimal params
  const addTranscription = useCallback((
    text: string,
    speakers?: Array<{ speaker: string; text: string; startTime: number; endTime: number; }>,
    model?: string
  ): boolean => {
    if (!currentNote) {
      console.warn('No current note available for transcription');
      return false;
    }

    const transcription: NoteTranscription = {
      id: generateId(),
      text: text.trim(),
      timestamp: new Date(),
      speakers,
      model,
    };

    return addTranscriptionToCurrentNote(transcription);
  }, [currentNote, addTranscriptionToCurrentNote]);

  const deleteNote = useCallback((noteId: string) => {
    try {
      const savedNotes = localStorage.getItem('transcriper-notes');
      if (savedNotes) {
        const notes: SerializedNote[] = JSON.parse(savedNotes);
        const filteredNotes = notes.filter(note => note.id !== noteId);
        localStorage.setItem('transcriper-notes', JSON.stringify(filteredNotes));
      }
      return true;
    } catch (error) {
      console.error('Failed to delete note:', error);
      return false;
    }
  }, []);

  const loadNotes = useCallback((): Note[] => {
    try {
      const savedNotes = localStorage.getItem('transcriper-notes');
      if (savedNotes) {
        const serializedNotes: SerializedNote[] = JSON.parse(savedNotes);
        return serializedNotes.map(deserializeNote);
      }
      return [];
    } catch (error) {
      console.error('Failed to load notes:', error);
      return [];
    }
  }, []);

  const loadNote = useCallback((noteId: string): Note | null => {
    try {
      const notes = loadNotes();
      return notes.find(note => note.id === noteId) || null;
    } catch (error) {
      console.error('Failed to load note:', error);
      return null;
    }
  }, [loadNotes]);

  return {
    currentNote,
    isOnHomepage,
    noteTitle,
    setNoteTitle,
    createNewNote,
    openNote,
    goToHomepage,
    updateCurrentNote,
    saveNote,
    deleteNote,
    loadNotes,
    loadNote,
    addTranscriptionToCurrentNote,
    removeTranscriptionFromCurrentNote,
    addTranscription, // Convenience method for adding transcriptions
  };
};