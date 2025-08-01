import { useCallback } from 'react';
import type { Note, NoteTranscription } from '../types/notes';

interface SpeakerSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

interface UseNoteTranscriptionProps {
  currentNote: Note | null;
  addTranscriptionToCurrentNote: (transcription: NoteTranscription) => boolean;
  onTranscriptionAdded?: () => void;
}

export const useNoteTranscription = ({
  currentNote,
  addTranscriptionToCurrentNote,
  onTranscriptionAdded
}: UseNoteTranscriptionProps) => {
  
  // Helper function to generate unique IDs
  const generateId = useCallback(() => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }, []);

  // Add transcription to current note with proper validation and side effects
  const addTranscriptionToNote = useCallback((
    text: string, 
    speakers?: SpeakerSegment[], 
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

    console.log('Adding transcription to note:', { 
      noteId: currentNote.id, 
      transcriptionId: transcription.id 
    });
    
    const success = addTranscriptionToCurrentNote(transcription);
    
    if (success && onTranscriptionAdded) {
      // Notify parent component (e.g., to open transcription panel)
      onTranscriptionAdded();
    }
    
    return success;
  }, [currentNote, addTranscriptionToCurrentNote, onTranscriptionAdded, generateId]);

  return {
    addTranscriptionToNote,
    generateId
  };
};