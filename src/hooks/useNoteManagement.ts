import { useState, useCallback } from 'react';

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export const useNoteManagement = () => {
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [isOnHomepage, setIsOnHomepage] = useState(true);
  const [noteTitle, setNoteTitle] = useState('Meeting Notes');

  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  const saveNote = useCallback((note: Note) => {
    try {
      const savedNotes = localStorage.getItem('transcriper-notes');
      let notes: Note[] = [];
      
      if (savedNotes) {
        notes = JSON.parse(savedNotes);
      }

      const existingIndex = notes.findIndex(n => n.id === note.id);
      
      if (existingIndex >= 0) {
        // Update existing note
        notes[existingIndex] = {
          ...note,
          updatedAt: new Date(),
        };
      } else {
        // Add new note
        notes.push({
          ...note,
          createdAt: new Date(),
          updatedAt: new Date(),
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

  const updateCurrentNote = useCallback((updates: Partial<Pick<Note, 'title' | 'content'>>) => {
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

  const deleteNote = useCallback((noteId: string) => {
    try {
      const savedNotes = localStorage.getItem('transcriper-notes');
      if (savedNotes) {
        const notes: Note[] = JSON.parse(savedNotes);
        const filteredNotes = notes.filter(note => note.id !== noteId);
        localStorage.setItem('transcriper-notes', JSON.stringify(filteredNotes));
      }
      return true;
    } catch (error) {
      console.error('Failed to delete note:', error);
      return false;
    }
  }, []);

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
  };
};