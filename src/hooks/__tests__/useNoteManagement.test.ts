/**
 * Tests for useNoteManagement hook - focusing on transcription linking
 */

import { renderHook, act } from '@testing-library/react';
import { useNoteManagement } from '../useNoteManagement';
import type { NoteTranscription } from '../../types/notes';

// Mock localStorage
const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  
  return {
    store,
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
};

const mockLocalStorage = createMockLocalStorage();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('useNoteManagement - Transcription Linking', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  describe('createNewNote', () => {
    it('should create note with empty transcriptions array', () => {
      const { result } = renderHook(() => useNoteManagement());

      act(() => {
        const note = result.current.createNewNote();
        expect(note.transcriptions).toEqual([]);
      });
    });
  });

  describe('addTranscriptionToCurrentNote', () => {
    it('should add transcription to current note', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create a note first
      act(() => {
        result.current.createNewNote();
      });

      const mockTranscription: NoteTranscription = {
        id: 'test-transcription-1',
        text: 'Hello world',
        timestamp: new Date(),
        speakers: [
          {
            speaker: 'Speaker A',
            text: 'Hello world',
            startTime: 0,
            endTime: 2
          }
        ],
        model: 'base'
      };

      act(() => {
        const success = result.current.addTranscriptionToCurrentNote(mockTranscription);
        expect(success).toBe(true);
      });

      expect(result.current.currentNote?.transcriptions).toHaveLength(1);
      expect(result.current.currentNote?.transcriptions?.[0].id).toBe('test-transcription-1');
      expect(result.current.currentNote?.transcriptions?.[0].text).toBe('Hello world');
    });

    it('should return false when no current note', () => {
      const { result } = renderHook(() => useNoteManagement());

      const mockTranscription: NoteTranscription = {
        id: 'test-transcription-1',
        text: 'Hello world',
        timestamp: new Date(),
        model: 'base'
      };

      act(() => {
        const success = result.current.addTranscriptionToCurrentNote(mockTranscription);
        expect(success).toBe(false);
      });
    });

    it('should add multiple transcriptions to same note', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create a note first
      act(() => {
        result.current.createNewNote();
      });

      const transcription1: NoteTranscription = {
        id: 'transcription-1',
        text: 'First transcription',
        timestamp: new Date(),
        model: 'base'
      };

      const transcription2: NoteTranscription = {
        id: 'transcription-2',
        text: 'Second transcription',
        timestamp: new Date(),
        model: 'small'
      };

      act(() => {
        result.current.addTranscriptionToCurrentNote(transcription1);
      });

      expect(result.current.currentNote?.transcriptions).toHaveLength(1);
      expect(result.current.currentNote?.transcriptions?.[0].id).toBe('transcription-1');

      act(() => {
        result.current.addTranscriptionToCurrentNote(transcription2);
      });

      expect(result.current.currentNote?.transcriptions).toHaveLength(2);
      expect(result.current.currentNote?.transcriptions?.[0].id).toBe('transcription-1');
      expect(result.current.currentNote?.transcriptions?.[1].id).toBe('transcription-2');
    });
  });

  describe('removeTranscriptionFromCurrentNote', () => {
    it('should remove transcription from current note', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create a note and add transcriptions
      act(() => {
        result.current.createNewNote();
      });

      const transcription1: NoteTranscription = {
        id: 'transcription-1',
        text: 'First transcription',
        timestamp: new Date(),
        model: 'base'
      };

      const transcription2: NoteTranscription = {
        id: 'transcription-2',
        text: 'Second transcription',
        timestamp: new Date(),
        model: 'small'
      };

      act(() => {
        result.current.addTranscriptionToCurrentNote(transcription1);
        result.current.addTranscriptionToCurrentNote(transcription2);
      });

      expect(result.current.currentNote?.transcriptions).toHaveLength(2);

      // Remove first transcription
      act(() => {
        const success = result.current.removeTranscriptionFromCurrentNote('transcription-1');
        expect(success).toBe(true);
      });

      expect(result.current.currentNote?.transcriptions).toHaveLength(1);
      expect(result.current.currentNote?.transcriptions?.[0].id).toBe('transcription-2');
    });

    it('should return false when no current note', () => {
      const { result } = renderHook(() => useNoteManagement());

      act(() => {
        const success = result.current.removeTranscriptionFromCurrentNote('non-existent');
        expect(success).toBe(false);
      });
    });

    it('should handle removing non-existent transcription', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create a note
      act(() => {
        result.current.createNewNote();
      });

      act(() => {
        const success = result.current.removeTranscriptionFromCurrentNote('non-existent');
        expect(success).toBe(true); // Should still return true
      });

      expect(result.current.currentNote?.transcriptions).toHaveLength(0);
    });
  });

  describe('saveNote and loadNotes - Transcription Persistence', () => {
    it('should save and load note with transcriptions correctly', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create a note and add transcription
      act(() => {
        result.current.createNewNote();
      });

      const mockTranscription: NoteTranscription = {
        id: 'test-transcription',
        text: 'Test transcription content',
        timestamp: new Date('2023-12-01T10:00:00Z'),
        speakers: [
          {
            speaker: 'Speaker A',
            text: 'Hello',
            startTime: 0,
            endTime: 1
          },
          {
            speaker: 'Speaker B',
            text: 'World',
            startTime: 1,
            endTime: 2
          }
        ],
        processingTime: 1500,
        model: 'base'
      };

      act(() => {
        result.current.addTranscriptionToCurrentNote(mockTranscription);
      });

      const currentNote = result.current.currentNote!;

      // Save the note
      act(() => {
        result.current.saveNote(currentNote);
      });

      // Load notes
      act(() => {
        const loadedNotes = result.current.loadNotes();
        expect(loadedNotes).toHaveLength(1);
        
        const loadedNote = loadedNotes[0];
        expect(loadedNote.transcriptions).toHaveLength(1);
        
        const loadedTranscription = loadedNote.transcriptions![0];
        expect(loadedTranscription.id).toBe('test-transcription');
        expect(loadedTranscription.text).toBe('Test transcription content');
        expect(loadedTranscription.timestamp).toBeInstanceOf(Date);
        expect(loadedTranscription.speakers).toHaveLength(2);
        expect(loadedTranscription.speakers![0].speaker).toBe('Speaker A');
        expect(loadedTranscription.processingTime).toBe(1500);
        expect(loadedTranscription.model).toBe('base');
      });
    });

    it('should handle note without transcriptions', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create a note without transcriptions
      act(() => {
        const note = result.current.createNewNote();
        result.current.updateCurrentNote({ content: 'Test content' });
        result.current.saveNote(note);
      });

      // Load notes
      act(() => {
        const loadedNotes = result.current.loadNotes();
        expect(loadedNotes).toHaveLength(1);
        expect(loadedNotes[0].transcriptions).toEqual([]);
      });
    });

    it('should preserve transcription Date objects after serialization', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create a note and add transcription with specific timestamp
      const specificDate = new Date('2023-12-01T15:30:45Z');
      
      act(() => {
        result.current.createNewNote();
      });

      const mockTranscription: NoteTranscription = {
        id: 'test-transcription',
        text: 'Test content',
        timestamp: specificDate,
        model: 'base'
      };

      act(() => {
        result.current.addTranscriptionToCurrentNote(mockTranscription);
        result.current.saveNote(result.current.currentNote!);
      });

      // Load notes and verify Date object preservation
      act(() => {
        const loadedNotes = result.current.loadNotes();
        const loadedTranscription = loadedNotes[0].transcriptions![0];
        
        expect(loadedTranscription.timestamp).toBeInstanceOf(Date);
        expect(loadedTranscription.timestamp.toISOString()).toBe(specificDate.toISOString());
      });
    });
  });

  describe('loadNote by ID', () => {
    it('should load specific note with transcriptions', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create multiple notes with different transcriptions
      let noteId1: string, noteId2: string;

      act(() => {
        const note1 = result.current.createNewNote();
        noteId1 = note1.id;
        result.current.addTranscriptionToCurrentNote({
          id: 'transcription-note1',
          text: 'Note 1 transcription',
          timestamp: new Date(),
          model: 'base'
        });
        result.current.saveNote(note1);

        const note2 = result.current.createNewNote();
        noteId2 = note2.id;
        result.current.addTranscriptionToCurrentNote({
          id: 'transcription-note2',
          text: 'Note 2 transcription',
          timestamp: new Date(),
          model: 'small'
        });
        result.current.saveNote(note2);
      });

      // Load specific note
      act(() => {
        const loadedNote = result.current.loadNote(noteId1);
        expect(loadedNote).not.toBeNull();
        expect(loadedNote!.id).toBe(noteId1);
        expect(loadedNote!.transcriptions).toHaveLength(1);
        expect(loadedNote!.transcriptions![0].text).toBe('Note 1 transcription');
      });
    });

    it('should return null for non-existent note ID', () => {
      const { result } = renderHook(() => useNoteManagement());

      act(() => {
        const loadedNote = result.current.loadNote('non-existent-id');
        expect(loadedNote).toBeNull();
      });
    });
  });

  describe('Note isolation', () => {
    it('should ensure transcriptions are isolated between notes', () => {
      const { result } = renderHook(() => useNoteManagement());

      // Create first note with transcription
      let note1Id: string;
      act(() => {
        const note1 = result.current.createNewNote();
        note1Id = note1.id;
        result.current.addTranscriptionToCurrentNote({
          id: 'transcription-1',
          text: 'First note transcription',
          timestamp: new Date(),
          model: 'base'
        });
      });

      // Create second note with different transcription
      let note2Id: string;
      act(() => {
        const note2 = result.current.createNewNote();
        note2Id = note2.id;
        result.current.addTranscriptionToCurrentNote({
          id: 'transcription-2',
          text: 'Second note transcription',
          timestamp: new Date(),
          model: 'small'
        });
      });

      // Save both notes
      act(() => {
        const notes = result.current.loadNotes();
        expect(notes).toHaveLength(2);
        
        const note1 = notes.find(n => n.id === note1Id);
        const note2 = notes.find(n => n.id === note2Id);
        
        expect(note1!.transcriptions).toHaveLength(1);
        expect(note1!.transcriptions![0].text).toBe('First note transcription');
        
        expect(note2!.transcriptions).toHaveLength(1);
        expect(note2!.transcriptions![0].text).toBe('Second note transcription');
      });
    });
  });
});