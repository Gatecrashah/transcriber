/**
 * Tests for TranscriptionProcessor
 */

import * as fs from 'fs';
import { spawn } from 'child_process';
import { TranscriptionProcessor } from '../core/processor';
import { WhisperModelManager } from '../core/models';
import { AudioAnalyzer } from '../audio/analyzer';

// Mock dependencies
jest.mock('fs');
jest.mock('child_process');
jest.mock('../core/models');
jest.mock('../audio/analyzer');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const MockWhisperModelManager = WhisperModelManager as jest.MockedClass<typeof WhisperModelManager>;
const MockAudioAnalyzer = AudioAnalyzer as jest.MockedClass<typeof AudioAnalyzer>;

describe('TranscriptionProcessor', () => {
  let processor: TranscriptionProcessor;
  let mockModelManager: jest.Mocked<WhisperModelManager>;
  let mockAudioAnalyzer: jest.Mocked<AudioAnalyzer>;
  let mockProcess: any;

  beforeEach(() => {
    mockModelManager = new MockWhisperModelManager('/mock/whisper/dir') as jest.Mocked<WhisperModelManager>;
    mockAudioAnalyzer = new MockAudioAnalyzer('/mock/whisper/path', mockModelManager) as jest.Mocked<AudioAnalyzer>;
    
    processor = new TranscriptionProcessor('/mock/whisper/path', mockModelManager);
    
    // Replace the analyzer with our mock
    (processor as any).audioAnalyzer = mockAudioAnalyzer;

    // Mock child process
    mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };

    mockSpawn.mockReturnValue(mockProcess as any);
    jest.clearAllMocks();
  });

  describe('transcribeFile', () => {
    beforeEach(() => {
      // Default mocks for file operations
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: 50 * 1024 * 1024 // 50MB
      } as fs.Stats);
      
      mockModelManager.getModelPath.mockReturnValue('/mock/model/path.bin');
      mockModelManager.hasTinydiarizeModel.mockReturnValue(false);
      
      mockAudioAnalyzer.analyzeAudioFile.mockResolvedValue({
        hasAudio: true,
        info: 'Valid audio file'
      });
    });

    it('should transcribe a valid audio file successfully', async () => {
      // Mock successful whisper process
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0); // Exit code 0 = success
        }
      });
      
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Hello world, this is a test transcription.');
        }
      });

      const result = await processor.transcribeFile('/mock/audio.wav');

      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello world, this is a test transcription.');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/mock/audio.wav');
      expect(mockModelManager.getModelPath).toHaveBeenCalledWith('base');
      expect(mockAudioAnalyzer.analyzeAudioFile).toHaveBeenCalledWith('/mock/audio.wav');
    });

    it('should fail when audio file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await processor.transcribeFile('/nonexistent/audio.wav');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Audio file not found');
    });

    it('should fail when audio file is too small', async () => {
      mockFs.statSync.mockReturnValue({
        size: 500 // Too small
      } as fs.Stats);

      const result = await processor.transcribeFile('/mock/audio.wav');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Audio file too small');
    });

    it('should warn about large audio files', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockFs.statSync.mockReturnValue({
        size: 200 * 1024 * 1024 // 200MB - large file
      } as fs.Stats);

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await processor.transcribeFile('/mock/large-audio.wav');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Large audio file'));
      consoleSpy.mockRestore();
    });

    it('should use custom model when specified', async () => {
      mockModelManager.getModelPath.mockReturnValue('/mock/small-model.bin');
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await processor.transcribeFile('/mock/audio.wav', { model: 'small' });

      expect(mockModelManager.getModelPath).toHaveBeenCalledWith('small');
    });

    it('should add language parameter when specified', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await processor.transcribeFile('/mock/audio.wav', { language: 'es' });

      expect(mockSpawn).toHaveBeenCalledWith('/mock/whisper/path', 
        expect.arrayContaining(['-l', 'es'])
      );
    });

    it('should add thread count when specified', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await processor.transcribeFile('/mock/audio.wav', { threads: 8 });

      expect(mockSpawn).toHaveBeenCalledWith('/mock/whisper/path', 
        expect.arrayContaining(['-t', '8'])
      );
    });

    it('should enable diarization when tinydiarize model is available', async () => {
      mockModelManager.hasTinydiarizeModel.mockReturnValue(true);
      mockModelManager.getTinydiarizeModelPath.mockReturnValue('/mock/tinydiarize.bin');
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await processor.transcribeFile('/mock/audio.wav', { enableDiarization: true });

      expect(mockModelManager.getTinydiarizeModelPath).toHaveBeenCalled();
      expect(mockSpawn).toHaveBeenCalledWith('/mock/whisper/path', 
        expect.arrayContaining(['--tinydiarize', '--output-json'])
      );
    });

    it('should skip diarization when tinydiarize model is missing', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockModelManager.hasTinydiarizeModel.mockReturnValue(false);
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await processor.transcribeFile('/mock/audio.wav', { enableDiarization: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tinydiarize model not found'));
      expect(mockSpawn).toHaveBeenCalledWith('/mock/whisper/path', 
        expect.not.arrayContaining(['--tinydiarize'])
      );
      consoleSpy.mockRestore();
    });

    it('should add output format parameters', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      // Test SRT format
      await processor.transcribeFile('/mock/audio.wav', { outputFormat: 'srt' });
      expect(mockSpawn).toHaveBeenCalledWith('/mock/whisper/path', 
        expect.arrayContaining(['--output-srt'])
      );

      // Test VTT format
      await processor.transcribeFile('/mock/audio.wav', { outputFormat: 'vtt' });
      expect(mockSpawn).toHaveBeenCalledWith('/mock/whisper/path', 
        expect.arrayContaining(['--output-vtt'])
      );

      // Test JSON format
      await processor.transcribeFile('/mock/audio.wav', { outputFormat: 'json' });
      expect(mockSpawn).toHaveBeenCalledWith('/mock/whisper/path', 
        expect.arrayContaining(['--output-json'])
      );
    });

    it('should handle whisper process failure', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1); // Exit code 1 = failure
        }
      });
      
      mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Whisper error: invalid model');
        }
      });

      const result = await processor.transcribeFile('/mock/audio.wav');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Whisper error: invalid model');
    });

    it('should handle process spawn error', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Process spawn failed'));
        }
      });

      const result = await processor.transcribeFile('/mock/audio.wav');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Process spawn failed');
    });

    it('should warn about empty transcription results', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });
      
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(''); // Empty output
        }
      });

      await processor.transcribeFile('/mock/audio.wav');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Empty transcription result'));
      consoleSpy.mockRestore();
    });

    it('should extract duration from whisper output', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });
      
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('[00:00:05.123 --> 00:00:15.456] Hello world');
        }
      });

      const result = await processor.transcribeFile('/mock/audio.wav');

      expect(result.duration).toBeCloseTo(15.456, 2);
    });
  });

  describe('transcribeStream', () => {
    it('should handle streaming transcription', async () => {
      const onProgress = jest.fn();
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });
      
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Hello\nworld\ntest');
        }
      });

      const result = await processor.transcribeStream('/mock/audio.wav', onProgress);

      expect(result.success).toBe(true);
      expect(onProgress).toHaveBeenCalledWith('Hello');
      expect(onProgress).toHaveBeenCalledWith('world');
      expect(onProgress).toHaveBeenCalledWith('test');
    });

    it('should filter out progress lines in streaming', async () => {
      const onProgress = jest.fn();
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });
      
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback('Hello\n[progress: 50%]\nworld\nwhisper_decode_token\ntest');
        }
      });

      await processor.transcribeStream('/mock/audio.wav', onProgress);

      expect(onProgress).toHaveBeenCalledWith('Hello');
      expect(onProgress).toHaveBeenCalledWith('world');
      expect(onProgress).toHaveBeenCalledWith('test');
      expect(onProgress).not.toHaveBeenCalledWith('[progress: 50%]');
      expect(onProgress).not.toHaveBeenCalledWith('whisper_decode_token');
    });

    it('should handle streaming errors', async () => {
      const onProgress = jest.fn();
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Stream error'));
        }
      });

      const result = await processor.transcribeStream('/mock/audio.wav', onProgress);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stream error');
    });
  });

  describe('checkInstallation', () => {
    it('should return true when whisper is properly installed', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      const result = await processor.checkInstallation();

      expect(result.installed).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('/mock/whisper/path', ['--help']);
    });

    it('should return false when whisper is not installed', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1); // Non-zero exit code
        }
      });

      const result = await processor.checkInstallation();

      expect(result.installed).toBe(false);
    });

    it('should handle installation check errors', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Command not found'));
        }
      });

      const result = await processor.checkInstallation();

      expect(result.installed).toBe(false);
      expect(result.error).toContain('Command not found');
    });
  });

  describe('private methods', () => {
    it('should extract duration correctly from various timestamp formats', () => {
      const extractDuration = (processor as any).extractDuration.bind(processor);

      // Test various timestamp formats
      expect(extractDuration('[00:00:05.123 --> 00:00:15.456] Hello')).toBeCloseTo(15.456, 2);
      expect(extractDuration('[00:01:30.000 --> 00:02:45.500] World')).toBeCloseTo(165.5, 1);
      expect(extractDuration('[01:30:15.750 --> 01:45:30.250] Long')).toBeCloseTo(6330.25, 2);
      expect(extractDuration('No timestamp here')).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle audio analyzer errors gracefully', async () => {
      mockAudioAnalyzer.analyzeAudioFile.mockRejectedValue(new Error('Analysis failed'));
      
      const result = await processor.transcribeFile('/mock/audio.wav');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Analysis failed');
    });

    it('should handle unexpected errors during transcription', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Filesystem error');
      });

      const result = await processor.transcribeFile('/mock/audio.wav');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Filesystem error');
    });
  });
});