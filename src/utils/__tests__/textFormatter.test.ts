/**
 * Comprehensive tests for text formatting utilities
 */

import {
  formatSpeakerTranscribedText,
  formatTranscribedText,
  cleanTranscriptionArtifacts,
  extractTimestamps,
  countWords
} from '../textFormatter';

describe('textFormatter', () => {
  describe('formatSpeakerTranscribedText', () => {
    it('should handle empty input', () => {
      expect(formatSpeakerTranscribedText('')).toBe('');
      expect(formatSpeakerTranscribedText('   ')).toBe('');
    });

    it('should preserve speaker labels and clean content', () => {
      const input = '**Speaker A:**\n[00:01:23.456 --> 00:01:27.890]Hello there\n\n**Speaker B:**\n[00:01:28.123 --> 00:01:32.456]How are you doing today?';
      const expected = '**Speaker A:**\nHello there\n\n**Speaker B:**\nHow are you doing today?';
      
      expect(formatSpeakerTranscribedText(input)).toBe(expected);
    });

    it('should remove BLANK_AUDIO markers', () => {
      const input = '**Speaker A:**\n[BLANK_AUDIO]Hello [BLANK_AUDIO] world\n\n**Speaker B:**\nGoodbye [BLANK_AUDIO]';
      const expected = '**Speaker A:**\nHello  world\n\n**Speaker B:**\nGoodbye';
      
      expect(formatSpeakerTranscribedText(input)).toBe(expected);
    });

    it('should remove inaudible markers', () => {
      const input = '**Speaker A:**\nHello [inaudible] world\n\n**Speaker B:**\n[inaudible] Goodbye';
      const expected = '**Speaker A:**\nHello  world\n\n**Speaker B:**\nGoodbye';
      
      expect(formatSpeakerTranscribedText(input)).toBe(expected);
    });

    it('should handle mixed speaker content', () => {
      const input = '**John:**\nHello everyone\n\n**Sarah:**\nNice to meet you\n\n**John:**\nLikewise';
      const expected = '**John:**\nHello everyone\n\n**Sarah:**\nNice to meet you\n\n**John:**\nLikewise';
      
      expect(formatSpeakerTranscribedText(input)).toBe(expected);
    });

    it('should skip empty content sections', () => {
      const input = '**Speaker A:**\nHello\n\n**Speaker B:**\n   \n\n**Speaker C:**\nWorld';
      const result = formatSpeakerTranscribedText(input);
      
      expect(result).toContain('**Speaker A:**');
      expect(result).toContain('Hello');
      expect(result).toContain('**Speaker C:**');
      expect(result).toContain('World');
      expect(result).not.toContain('**Speaker B:**');
    });
  });

  describe('formatTranscribedText', () => {
    it('should handle empty input', () => {
      expect(formatTranscribedText('')).toBe('');
      expect(formatTranscribedText('   ')).toBe('');
    });

    it('should remove ANSI color codes', () => {
      const input = '[38;5;160mHello[0m world [38;5;227mtest[0m';
      const result = formatTranscribedText(input);
      
      expect(result).not.toContain('[38;5;160m');
      expect(result).not.toContain('[0m');
      expect(result).not.toContain('[38;5;227m');
      expect(result).toContain('Hello');
      expect(result).toContain('world');
      expect(result).toContain('test');
    });

    it('should remove timestamp patterns', () => {
      const input = '[00:01:23.456 --> 00:01:27.890] Hello world [00:01:28.123 --> 00:01:32.456]';
      const result = formatTranscribedText(input);
      
      expect(result).not.toContain('[00:01:23.456 --> 00:01:27.890]');
      expect(result).not.toContain('[00:01:28.123 --> 00:01:32.456]');
      expect(result).toContain('Hello world');
    });

    it('should remove number-bracket patterns', () => {
      const input = '000 880] Hello 240 560] world 1200 1440]';
      const result = formatTranscribedText(input);
      
      expect(result).not.toContain('000 880]');
      expect(result).not.toContain('240 560]');
      expect(result).not.toContain('1200 1440]');
      expect(result).toContain('Hello');
      expect(result).toContain('world');
    });

    it('should remove common transcription artifacts', () => {
      const input = '[BLANK_AUDIO] Hello [inaudible] world (speaking in foreign language) test SPEAKER_01: final';
      const result = formatTranscribedText(input);
      
      expect(result).not.toContain('[BLANK_AUDIO]');
      expect(result).not.toContain('[inaudible]');
      expect(result).not.toContain('(speaking in foreign language)');
      expect(result).not.toContain('SPEAKER_01:');
      expect(result).toContain('Hello');
      expect(result).toContain('world');
      expect(result).toContain('test');
      expect(result).toContain('final');
    });

    it('should fix sentence structure', () => {
      const input = 'hello world this is a test';
      const result = formatTranscribedText(input);
      
      expect(result).toMatch(/^[A-Z]/); // Should start with capital letter
      expect(result).toContain('Hello world');
    });

    it('should create paragraphs with default settings', () => {
      const input = 'This is the first sentence. This is the second sentence. This is the third sentence. This is the fourth sentence. This is the fifth sentence. This is the sixth sentence.';
      const result = formatTranscribedText(input);
      
      expect(result).toContain('\n\n'); // Should have paragraph breaks
    });

    it('should respect formatting options', () => {
      const input = 'This is the first sentence. This is the second sentence. This is the third sentence. This is the fourth sentence. This is the fifth sentence. This is the sixth sentence.';
      
      const withParagraphs = formatTranscribedText(input, { enableParagraphBreaks: true });
      const withoutParagraphs = formatTranscribedText(input, { enableParagraphBreaks: false });
      
      expect(withParagraphs).toContain('\n\n');
      expect(withoutParagraphs).not.toContain('\n\n');
    });

    it('should handle custom sentences per paragraph', () => {
      const input = 'This is sentence one. This is sentence two. This is sentence three. This is sentence four. This is sentence five. This is sentence six.';
      const result = formatTranscribedText(input, { maxSentencesPerParagraph: 2 });
      
      // Should have more paragraph breaks with fewer sentences per paragraph
      const paragraphCount = (result.match(/\n\n/g) || []).length;
      expect(paragraphCount).toBeGreaterThan(0);
    });

    it('should clean up excessive whitespace', () => {
      const input = 'Hello     world    test    multiple    spaces';
      const result = formatTranscribedText(input);
      
      expect(result).not.toContain('     ');
      expect(result).not.toContain('    ');
      expect(result).toMatch(/Hello world/);
    });

    it('should handle real-world whisper output', () => {
      const input = `[38;5;160m000 880] Hello, this is a test[0m [38;5;227m880 1200] of the whisper transcription[0m [BLANK_AUDIO] system.`;
      const result = formatTranscribedText(input);
      
      expect(result).toBe('Hello, this is a test of the whisper transcription system.');
    });
  });

  describe('cleanTranscriptionArtifacts', () => {
    it('should remove all common artifacts', () => {
      const input = '[BLANK_AUDIO] Hello [inaudible] world (speaking in foreign language) SPEAKER_01: test';
      const result = cleanTranscriptionArtifacts(input);
      
      expect(result).toBe('Hello world test');
    });

    it('should normalize whitespace', () => {
      const input = 'Hello    world     test';
      const result = cleanTranscriptionArtifacts(input);
      
      expect(result).toBe('Hello world test');
    });

    it('should handle empty input', () => {
      expect(cleanTranscriptionArtifacts('')).toBe('');
      expect(cleanTranscriptionArtifacts('   ')).toBe('');
    });
  });

  describe('extractTimestamps', () => {
    it('should extract timestamp patterns', () => {
      const input = 'Hello [00:01:23.456 --> 00:01:27.890] world [00:02:30.123 --> 00:02:35.456] test';
      const timestamps = extractTimestamps(input);
      
      expect(timestamps).toHaveLength(2);
      expect(timestamps[0]).toBe('[00:01:23.456 --> 00:01:27.890]');
      expect(timestamps[1]).toBe('[00:02:30.123 --> 00:02:35.456]');
    });

    it('should return empty array when no timestamps found', () => {
      const input = 'Hello world test';
      const timestamps = extractTimestamps(input);
      
      expect(timestamps).toHaveLength(0);
    });

    it('should handle malformed timestamps', () => {
      const input = 'Hello [00:01:23 --> 00:01:27] world [invalid timestamp] test';
      const timestamps = extractTimestamps(input);
      
      expect(timestamps).toHaveLength(0); // Should not match malformed patterns
    });
  });

  describe('countWords', () => {
    it('should count words correctly', () => {
      const input = 'Hello world test';
      const count = countWords(input);
      
      expect(count).toBe(3);
    });

    it('should handle text with artifacts', () => {
      const input = '[BLANK_AUDIO] Hello [inaudible] world SPEAKER_01: test';
      const count = countWords(input);
      
      expect(count).toBe(3); // Should count only actual words after cleaning
    });

    it('should handle empty input', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('   ')).toBe(0);
    });

    it('should handle multiple whitespace', () => {
      const input = 'Hello     world    test';
      const count = countWords(input);
      
      expect(count).toBe(3);
    });

    it('should handle punctuation', () => {
      const input = 'Hello, world! How are you?';
      const count = countWords(input);
      
      expect(count).toBe(5);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very long input', () => {
      const input = 'word '.repeat(10000);
      const result = formatTranscribedText(input);
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle unicode characters', () => {
      const input = 'Hello 世界 🌍 test';
      const result = formatTranscribedText(input);
      
      expect(result).toContain('Hello');
      expect(result).toContain('世界');
      expect(result).toContain('🌍');
      expect(result).toContain('test');
    });

    it('should handle special characters in speaker names', () => {
      const input = '**Dr. Smith-Jones:**\nHello there\n\n**María García:**\nHola mundo';
      const result = formatSpeakerTranscribedText(input);
      
      expect(result).toContain('**Dr. Smith-Jones:**');
      expect(result).toContain('**María García:**');
    });

    it('should handle malformed speaker markers', () => {
      const input = '**Speaker A:\nMissing closing marker\n**Speaker B:**\nProper format';
      const result = formatSpeakerTranscribedText(input);
      
      // Should handle gracefully and not crash
      expect(result).toBeDefined();
      expect(result).toContain('Speaker B');
    });
  });
});