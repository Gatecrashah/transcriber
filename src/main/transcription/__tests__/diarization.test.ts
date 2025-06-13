/**
 * Tests for SpeakerDiarization
 */

import { SpeakerDiarization } from '../speaker/diarization';
import type { SpeakerSegment } from '../../../types/transcription';

describe('SpeakerDiarization', () => {
  let diarization: SpeakerDiarization;

  beforeEach(() => {
    diarization = new SpeakerDiarization();
  });

  describe('parseTinydiarizeOutput', () => {
    it('should parse [SPEAKER_TURN] markers correctly', () => {
      const input = 'Hello everyone this is a longer text [SPEAKER_TURN] How are you doing today everyone [SPEAKER_TURN] I am doing well thank you very much';
      
      const segments = diarization.parseTinydiarizeOutput(input);
      
      expect(segments).toHaveLength(3);
      expect(segments[0].speaker).toBe('Speaker Turn 1');
      expect(segments[0].text).toBe('Hello everyone this is a longer text');
      expect(segments[1].speaker).toBe('Speaker Turn 2');
      expect(segments[1].text).toBe('How are you doing today everyone');
      expect(segments[2].speaker).toBe('Speaker Turn 3');
      expect(segments[2].text).toBe('I am doing well thank you very much');
    });

    it('should skip short segments', () => {
      const input = 'Hello everyone this is good [SPEAKER_TURN] um [SPEAKER_TURN] This is a longer segment that should be included with more text';
      
      const segments = diarization.parseTinydiarizeOutput(input);
      
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe('Hello everyone this is good');
      expect(segments[1].text).toBe('This is a longer segment that should be included with more text');
    });

    it('should clean timestamps from text', () => {
      const input = '[00:01:23.456 --> 00:01:27.890] Hello there this is a longer text [SPEAKER_TURN] [00:01:28.123 --> 00:01:32.456] How are you doing today my friend';
      
      const segments = diarization.parseTinydiarizeOutput(input);
      
      expect(segments[0].text).not.toContain('[00:01:23.456 --> 00:01:27.890]');
      expect(segments[0].text).toBe('Hello there this is a longer text');
      expect(segments[1].text).toBe('How are you doing today my friend');
    });

    it('should handle case-insensitive SPEAKER_TURN markers', () => {
      const input = 'Hello everyone this is the first part [speaker_turn] World this is the second longer part [SPEAKER_TURN] Test this is the third longer section [Speaker_Turn] Final this is the fourth longer segment';
      
      const segments = diarization.parseTinydiarizeOutput(input);
      
      expect(segments).toHaveLength(4);
    });

    it('should create fallback segment when no [SPEAKER_TURN] found', () => {
      const input = 'This is a regular transcription without speaker turns';
      
      const segments = diarization.parseTinydiarizeOutput(input);
      
      expect(segments).toHaveLength(1);
      expect(segments[0].speaker).toBe('Speaker A');
      expect(segments[0].text).toBe(input);
    });

    it('should handle empty input gracefully', () => {
      const segments = diarization.parseTinydiarizeOutput('');
      
      expect(segments).toHaveLength(0);
    });

    it('should handle whitespace-only segments', () => {
      const input = 'Hello [SPEAKER_TURN]    \n\t   [SPEAKER_TURN] World';
      
      const segments = diarization.parseTinydiarizeOutput(input);
      
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe('Hello');
      expect(segments[1].text).toBe('World');
    });
  });

  describe('parseTranscriptionForMultipleSpeakers', () => {
    it('should parse JSON with segments', () => {
      const jsonInput = JSON.stringify({
        segments: [
          {
            id: 0,
            start: 0.0,
            end: 5.0,
            text: 'Hello everyone',
            speaker_id: 0,
            confidence: 0.9
          },
          {
            id: 1,
            start: 5.0,
            end: 10.0,
            text: 'How are you doing',
            speaker_id: 1,
            confidence: 0.8
          }
        ]
      });

      const segments = diarization.parseTranscriptionForMultipleSpeakers(jsonInput, 'system');
      
      expect(segments).toHaveLength(2);
      expect(segments[0].speaker).toBe('Speaker A');
      expect(segments[0].text).toBe('Hello everyone');
      expect(segments[0].startTime).toBe(0.0);
      expect(segments[0].endTime).toBe(5.0);
      expect(segments[1].speaker).toBe('Speaker B');
    });

    it('should handle speaker field as string', () => {
      const jsonInput = JSON.stringify({
        segments: [
          {
            id: 0,
            start: 0.0,
            end: 5.0,
            text: 'Hello',
            speaker: '0'
          },
          {
            id: 1,
            start: 5.0,
            end: 10.0,
            text: 'World',
            speaker: '1'
          }
        ]
      });

      const segments = diarization.parseTranscriptionForMultipleSpeakers(jsonInput, 'system');
      
      expect(segments).toHaveLength(2);
      expect(segments[0].speaker).toBe('Speaker A');
      expect(segments[1].speaker).toBe('Speaker B');
    });

    it('should fallback to [SPEAKER_TURN] parsing for non-JSON', () => {
      const input = 'Hello [SPEAKER_TURN] World [SPEAKER_TURN] Test';
      
      const segments = diarization.parseTranscriptionForMultipleSpeakers(input, 'system');
      
      expect(segments).toHaveLength(3);
      expect(segments[0].speaker).toBe('Speaker Turn 1');
    });

    it('should handle JSON with text field and [SPEAKER_TURN]', () => {
      const jsonInput = JSON.stringify({
        text: 'Hello [SPEAKER_TURN] World [SPEAKER_TURN] Test'
      });

      const segments = diarization.parseTranscriptionForMultipleSpeakers(jsonInput, 'system');
      
      expect(segments).toHaveLength(3);
    });

    it('should create fallback segment for invalid JSON', () => {
      const input = 'Invalid JSON content without markers';
      
      const segments = diarization.parseTranscriptionForMultipleSpeakers(input, 'system');
      
      expect(segments).toHaveLength(1);
      expect(segments[0].speaker).toBe('Speaker A');
      expect(segments[0].text).toBe(input);
    });
  });

  describe('parseTranscriptionForSpeakers', () => {
    it('should parse JSON with segments', () => {
      const jsonInput = JSON.stringify({
        segments: [
          {
            start: 0.0,
            end: 5.0,
            text: 'Hello world',
            confidence: 0.9
          }
        ]
      });

      const segments = diarization.parseTranscriptionForSpeakers(jsonInput, 'TestSpeaker', 'system');
      
      expect(segments).toHaveLength(1);
      expect(segments[0].speaker).toBe('TestSpeaker');
      expect(segments[0].text).toBe('Hello world');
    });

    it('should handle plain text input', () => {
      const input = 'This is plain text';
      
      const segments = diarization.parseTranscriptionForSpeakers(input, 'TestSpeaker', 'system');
      
      expect(segments).toHaveLength(1);
      expect(segments[0].speaker).toBe('TestSpeaker');
      expect(segments[0].text).toBe(input);
    });

    it('should handle JSON with text field', () => {
      const jsonInput = JSON.stringify({
        text: 'This is from JSON text field'
      });

      const segments = diarization.parseTranscriptionForSpeakers(jsonInput, 'TestSpeaker', 'system');
      
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('This is from JSON text field');
    });

    it('should skip empty text', () => {
      const segments = diarization.parseTranscriptionForSpeakers('', 'TestSpeaker', 'system');
      
      expect(segments).toHaveLength(0);
    });
  });

  describe('groupSegmentsBySpeaker', () => {
    it('should group segments by speaker correctly', () => {
      const segments: SpeakerSegment[] = [
        { speaker: 'Alice', text: 'Hello', startTime: 0, endTime: 2 },
        { speaker: 'Bob', text: 'Hi there', startTime: 2, endTime: 4 },
        { speaker: 'Alice', text: 'How are you?', startTime: 4, endTime: 6 },
        { speaker: 'Bob', text: 'Good thanks', startTime: 6, endTime: 8 }
      ];

      const grouped = diarization.groupSegmentsBySpeaker(segments);
      
      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['Alice']).toHaveLength(2);
      expect(grouped['Bob']).toHaveLength(2);
      expect(grouped['Alice'][0].text).toBe('Hello');
      expect(grouped['Alice'][1].text).toBe('How are you?');
    });

    it('should sort segments within each speaker by start time', () => {
      const segments: SpeakerSegment[] = [
        { speaker: 'Alice', text: 'Second', startTime: 4, endTime: 6 },
        { speaker: 'Alice', text: 'First', startTime: 0, endTime: 2 },
        { speaker: 'Alice', text: 'Third', startTime: 8, endTime: 10 }
      ];

      const grouped = diarization.groupSegmentsBySpeaker(segments);
      
      expect(grouped['Alice'][0].text).toBe('First');
      expect(grouped['Alice'][1].text).toBe('Second');
      expect(grouped['Alice'][2].text).toBe('Third');
    });

    it('should handle empty segments array', () => {
      const grouped = diarization.groupSegmentsBySpeaker([]);
      
      expect(Object.keys(grouped)).toHaveLength(0);
    });
  });

  describe('formatSpeakerTranscript', () => {
    it('should format speaker transcript correctly', () => {
      const segments: SpeakerSegment[] = [
        { speaker: 'Alice', text: 'Hello everyone', startTime: 0, endTime: 2 },
        { speaker: 'Bob', text: 'Hi Alice', startTime: 2, endTime: 4 },
        { speaker: 'Alice', text: 'How are you doing?', startTime: 4, endTime: 6 }
      ];

      const transcript = diarization.formatSpeakerTranscript(segments);
      
      expect(transcript).toContain('**Alice:**');
      expect(transcript).toContain('**Bob:**');
      expect(transcript).toContain('Hello everyone');
      expect(transcript).toContain('Hi Alice');
      expect(transcript).toContain('How are you doing?');
    });

    it('should handle speaker changes correctly', () => {
      const segments: SpeakerSegment[] = [
        { speaker: 'Alice', text: 'First line', startTime: 0, endTime: 2 },
        { speaker: 'Alice', text: 'Second line', startTime: 2, endTime: 4 },
        { speaker: 'Bob', text: 'Different speaker', startTime: 4, endTime: 6 }
      ];

      const transcript = diarization.formatSpeakerTranscript(segments);
      
      // Alice should only have one header, Bob should have his own
      const aliceHeaders = (transcript.match(/\*\*Alice:\*\*/g) || []).length;
      const bobHeaders = (transcript.match(/\*\*Bob:\*\*/g) || []).length;
      
      expect(aliceHeaders).toBe(1);
      expect(bobHeaders).toBe(1);
    });

    it('should skip empty text segments', () => {
      const segments: SpeakerSegment[] = [
        { speaker: 'Alice', text: 'Hello', startTime: 0, endTime: 2 },
        { speaker: 'Alice', text: '', startTime: 2, endTime: 4 },
        { speaker: 'Alice', text: '   ', startTime: 4, endTime: 6 },
        { speaker: 'Bob', text: 'World', startTime: 6, endTime: 8 }
      ];

      const transcript = diarization.formatSpeakerTranscript(segments);
      
      expect(transcript).toContain('Hello');
      expect(transcript).toContain('World');
      expect(transcript).not.toContain('   ');
    });

    it('should handle empty segments array', () => {
      const transcript = diarization.formatSpeakerTranscript([]);
      
      expect(transcript).toBe('');
    });
  });
});