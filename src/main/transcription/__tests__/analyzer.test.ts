/**
 * Tests for AudioAnalyzer
 */

import { spawn } from 'child_process';
import { AudioAnalyzer } from '../audio/analyzer';
import { WhisperModelManager } from '../core/models';

// Mock dependencies
jest.mock('child_process');
jest.mock('../core/models');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const MockWhisperModelManager = WhisperModelManager as jest.MockedClass<typeof WhisperModelManager>;

describe('AudioAnalyzer', () => {
  let analyzer: AudioAnalyzer;
  let mockModelManager: jest.Mocked<WhisperModelManager>;
  let mockProcess: any;

  beforeEach(() => {
    mockModelManager = new MockWhisperModelManager('/mock/whisper/dir') as jest.Mocked<WhisperModelManager>;
    analyzer = new AudioAnalyzer('/mock/whisper/path', mockModelManager);

    // Mock child process
    mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn()
    };

    mockSpawn.mockReturnValue(mockProcess as any);
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('performVAD', () => {
    beforeEach(() => {
      mockModelManager.getModelPath.mockReturnValue('/mock/tiny-model.bin');
    });

    it('should detect voice with valid transcription', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0); // Success
        }
      });

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Hello everyone, this is a clear voice recording.');
        }
      });

      const result = await analyzer.performVAD('/mock/audio.wav');

      expect(result.hasVoice).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(mockModelManager.getModelPath).toHaveBeenCalledWith('tiny');
    });

    it('should detect no voice with empty transcription', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('');
        }
      });

      const result = await analyzer.performVAD('/mock/audio.wav');

      expect(result.hasVoice).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should detect no voice with short meaningless text', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('...');
        }
      });

      const result = await analyzer.performVAD('/mock/audio.wav');

      expect(result.hasVoice).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should detect no voice with hallucination patterns', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Thank you. Thank you. Thank you. Thank you.');
        }
      });

      const result = await analyzer.performVAD('/mock/audio.wav');

      expect(result.hasVoice).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle VAD process failure gracefully', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1); // Failure
        }
      });

      const result = await analyzer.performVAD('/mock/audio.wav');

      expect(result.hasVoice).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should default to voice present on VAD error', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Process spawn failed'));
        }
      });

      const result = await analyzer.performVAD('/mock/audio.wav');

      expect(result.hasVoice).toBe(true);
      expect(result.confidence).toBe(0.5);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('VAD failed'));
      consoleSpy.mockRestore();
    });

    it('should calculate confidence based on text quality', async () => {
      const testCases = [
        { text: 'A', expectedConfidence: 0.3 }, // Minimal text only
        { text: 'Hello world this is a good transcription', expectedConfidence: 1.0 }, // Full score
        { text: 'Short', expectedConfidence: 0.9 }, // Good but short
        { text: '', expectedConfidence: 0 }, // Empty
      ];

      for (const testCase of testCases) {
        mockProcess.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'close') {
            callback(0);
          }
        });

        mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            callback(testCase.text);
          }
        });

        const result = await analyzer.performVAD('/mock/audio.wav');
        expect(result.confidence).toBeCloseTo(testCase.expectedConfidence, 1);
      }
    });
  });

  describe('analyzeAudioFile', () => {
    it('should analyze audio file with ffmpeg successfully', async () => {
      const mockFfmpegProcess = {
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockFfmpegProcess as any);

      mockFfmpegProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from(`
            Duration: 00:02:30.45, start: 0.000000, bitrate: 128 kb/s
            Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
          `));
        }
      });

      mockFfmpegProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      const result = await analyzer.analyzeAudioFile('/mock/audio.mp3');

      expect(result.hasAudio).toBe(true);
      expect(result.duration).toBeCloseTo(150.45, 1); // 2:30.45 = 150.45 seconds
      expect(result.bitrate).toBe(128);
      expect(result.format).toBe('mp3');
      expect(result.info).toContain('Duration: 150.45s');
    });

    it('should handle ffmpeg analysis timeout', async () => {
      const mockFfmpegProcess = {
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockFfmpegProcess as any);

      // Don't call the close callback to simulate hanging process
      mockFfmpegProcess.on.mockImplementation(() => {});

      const analyzePromise = analyzer.analyzeAudioFile('/mock/audio.wav');

      // Fast-forward timer to trigger timeout
      jest.advanceTimersByTime(6000);

      const result = await analyzePromise;

      expect(result.hasAudio).toBe(true);
      expect(result.info).toContain('Analysis timeout');
      expect(mockFfmpegProcess.kill).toHaveBeenCalled();
    });

    it('should handle ffmpeg not available', async () => {
      mockSpawn.mockImplementation(() => {
        const mockProcess = {
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        // Simulate ffmpeg error
        setTimeout(() => {
          mockProcess.on.mock.calls.find(call => call[0] === 'error')?.[1](new Error('Command not found'));
        }, 0);

        return mockProcess as any;
      });

      const result = await analyzer.analyzeAudioFile('/mock/audio.wav');

      expect(result.hasAudio).toBe(true);
      expect(result.info).toContain('FFmpeg not available');
    });

    it('should handle invalid ffmpeg output', async () => {
      const mockFfmpegProcess = {
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockFfmpegProcess as any);

      mockFfmpegProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('Invalid ffmpeg output without duration info'));
        }
      });

      mockFfmpegProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      const result = await analyzer.analyzeAudioFile('/mock/audio.wav');

      expect(result.hasAudio).toBe(true);
      expect(result.info).toContain('Analysis failed');
    });

    it('should parse different audio formats correctly', async () => {
      const testCases = [
        {
          output: 'Duration: 00:01:15.30, bitrate: 320 kb/s\nAudio: aac, 48000 Hz, stereo',
          expectedDuration: 75.3,
          expectedBitrate: 320,
          expectedFormat: 'aac'
        },
        {
          output: 'Duration: 00:00:45.00, bitrate: 64 kb/s\nAudio: opus, 48000 Hz, mono',
          expectedDuration: 45.0,
          expectedBitrate: 64,
          expectedFormat: 'opus'
        }
      ];

      for (const testCase of testCases) {
        const mockFfmpegProcess = {
          stderr: { on: jest.fn() },
          on: jest.fn(),
          kill: jest.fn()
        };

        mockSpawn.mockReturnValue(mockFfmpegProcess as any);

        mockFfmpegProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            callback(Buffer.from(testCase.output));
          }
        });

        mockFfmpegProcess.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'close') {
            callback(0);
          }
        });

        const result = await analyzer.analyzeAudioFile('/mock/audio.wav');

        expect(result.duration).toBeCloseTo(testCase.expectedDuration, 1);
        expect(result.bitrate).toBe(testCase.expectedBitrate);
        expect(result.format).toBe(testCase.expectedFormat);
      }
    });
  });

  describe('isLikelyHallucination', () => {
    it('should detect repetitive phrase hallucinations', () => {
      const repetitiveText = 'Thank you for watching. Thank you for watching. Thank you for watching. Thank you for watching.';
      expect(analyzer.isLikelyHallucination(repetitiveText)).toBe(true);
    });

    it('should detect blank audio markers', () => {
      const blankAudioText = 'Hello [BLANK_AUDIO] world';
      expect(analyzer.isLikelyHallucination(blankAudioText)).toBe(true);
    });

    it('should detect inaudible markers', () => {
      const inaudibleText = 'This is [inaudible] content';
      expect(analyzer.isLikelyHallucination(inaudibleText)).toBe(true);
    });

    it('should detect no speech markers', () => {
      const noSpeechText = '[no speech detected]';
      expect(analyzer.isLikelyHallucination(noSpeechText)).toBe(true);
    });

    it('should detect excessive word repetition', () => {
      const repetitiveWords = 'the the the the the the the the the the';
      expect(analyzer.isLikelyHallucination(repetitiveWords)).toBe(true);
    });

    it('should detect common whisper repetition patterns', () => {
      const patterns = [
        'thank you thank you thank you thank you',
        'the same way that we help each other the same way that we help each other',
        'in the same way that we are going to help each other in the same way that'
      ];

      patterns.forEach(pattern => {
        expect(analyzer.isLikelyHallucination(pattern)).toBe(true);
      });
    });

    it('should accept valid transcriptions', () => {
      const validTexts = [
        'Hello everyone, welcome to today\'s meeting.',
        'This is a normal conversation between multiple people.',
        'We discussed the quarterly results and future plans.',
        'The weather is nice today, let\'s go for a walk.'
      ];

      validTexts.forEach(text => {
        expect(analyzer.isLikelyHallucination(text)).toBe(false);
      });
    });

    it('should handle empty or very short text', () => {
      expect(analyzer.isLikelyHallucination('')).toBe(true);
      expect(analyzer.isLikelyHallucination('Hi')).toBe(true);
      expect(analyzer.isLikelyHallucination('Hello.')).toBe(true);
    });

    it('should calculate repetition ratio correctly', () => {
      // High repetition ratio (should be detected)
      const highRepetition = 'word word word word word word word word word word';
      expect(analyzer.isLikelyHallucination(highRepetition)).toBe(true);

      // Normal repetition ratio (should pass)
      const normalText = 'This is a normal sentence with some repeated words like the and a';
      expect(analyzer.isLikelyHallucination(normalText)).toBe(false);
    });

    it('should be case insensitive for pattern matching', () => {
      const patterns = [
        '[BLANK_AUDIO] test',
        '[blank_audio] test',
        '[Blank_Audio] test',
        '[INAUDIBLE] test',
        '[inaudible] test'
      ];

      patterns.forEach(pattern => {
        expect(analyzer.isLikelyHallucination(pattern)).toBe(true);
      });
    });
  });

  describe('private runWhisper method', () => {
    it('should handle successful whisper execution', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Transcription output');
        }
      });

      const runWhisper = (analyzer as any).runWhisper.bind(analyzer);
      const result = await runWhisper(['-m', 'model', '-f', 'file']);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Transcription output');
    });

    it('should handle whisper execution failure', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1);
        }
      });

      mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Error message');
        }
      });

      const runWhisper = (analyzer as any).runWhisper.bind(analyzer);
      const result = await runWhisper(['-m', 'model', '-f', 'file']);

      expect(result.success).toBe(false);
      expect(result.stderr).toBe('Error message');
    });

    it('should handle process spawn errors', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Spawn failed'));
        }
      });

      const runWhisper = (analyzer as any).runWhisper.bind(analyzer);
      const result = await runWhisper(['-m', 'model', '-f', 'file']);

      expect(result.success).toBe(false);
      expect(result.stderr).toBe('Spawn failed');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle undefined or null inputs gracefully', () => {
      expect(analyzer.isLikelyHallucination(null as any)).toBe(true);
      expect(analyzer.isLikelyHallucination(undefined as any)).toBe(true);
    });

    it('should handle very long text inputs', () => {
      const longText = 'This is a very long transcription. '.repeat(1000);
      expect(() => analyzer.isLikelyHallucination(longText)).not.toThrow();
    });

    it('should handle unicode and special characters', () => {
      const unicodeText = 'Hello 世界 🌍 This is a test with émojis and spëcial chars';
      expect(analyzer.isLikelyHallucination(unicodeText)).toBe(false);
    });

    it('should handle malformed regex patterns in input', () => {
      const regexText = 'Text with regex chars [](){}.*+?^$|\\';
      expect(() => analyzer.isLikelyHallucination(regexText)).not.toThrow();
    });
  });
});