/**
 * TypeScript interfaces for note management
 */

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  meetingType?: 'one-on-one' | 'team-meeting' | 'client-call' | 'interview' | 'other';
  transcriptions?: NoteTranscription[];
}

export interface NoteTranscription {
  id: string;
  text: string;
  timestamp: Date;
  speakers?: Array<{
    speaker: string;
    text: string;
    startTime: number;
    endTime: number;
  }>;
  processingTime?: number;
  model?: string;
}

export interface NoteCreateOptions {
  title?: string;
  content?: string;
  meetingType?: Note['meetingType'];
}

export interface NoteUpdateOptions {
  title?: string;
  content?: string;
  meetingType?: Note['meetingType'];
}

// Serialized note format for storage
export interface SerializedNote {
  id: string;
  title: string;
  content: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  meetingType?: Note['meetingType'];
  transcriptions?: Array<{
    id: string;
    text: string;
    timestamp: string; // ISO string
    speakers?: NoteTranscription['speakers'];
    processingTime?: number;
    model?: string;
  }>;
}