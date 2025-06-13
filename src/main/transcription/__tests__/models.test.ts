/**
 * Tests for WhisperModelManager
 */

import * as fs from 'fs';
import * as path from 'path';
import { WhisperModelManager } from '../core/models';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('WhisperModelManager', () => {
  let modelManager: WhisperModelManager;
  const mockWhisperDir = '/mock/whisper/dir';

  beforeEach(() => {
    modelManager = new WhisperModelManager(mockWhisperDir);
    jest.clearAllMocks();
  });

  describe('getModelPath', () => {
    it('should return correct path for base model', () => {
      // Mock file exists and is valid
      mockFs.statSync.mockReturnValue({
        size: 150 * 1024 * 1024, // 150MB
      } as fs.Stats);
      
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(8);
      mockFs.closeSync.mockReturnValue();
      
      // Mock valid GGML file
      Buffer.prototype.toString = jest.fn().mockReturnValue('ggml');

      const modelPath = modelManager.getModelPath('base');
      const expectedPath = path.join(mockWhisperDir, 'models', 'ggml-base.bin');
      
      expect(modelPath).toBe(expectedPath);
    });

    it('should map large to large-v3', () => {
      mockFs.statSync.mockReturnValue({
        size: 3000 * 1024 * 1024, // 3GB
      } as fs.Stats);
      
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(8);
      mockFs.closeSync.mockReturnValue();
      Buffer.prototype.toString = jest.fn().mockReturnValue('ggml');

      const modelPath = modelManager.getModelPath('large');
      
      expect(modelPath).toContain('ggml-large-v3.bin');
    });

    it('should fallback to base model when model not found', () => {
      // Mock model doesn't exist, but base does
      mockFs.statSync
        .mockReturnValueOnce({
          size: 1000, // Too small for medium model
        } as fs.Stats)
        .mockReturnValueOnce({
          size: 150 * 1024 * 1024, // Valid base model
        } as fs.Stats);
      
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(8);
      mockFs.closeSync.mockReturnValue();
      Buffer.prototype.toString = jest.fn().mockReturnValue('ggml');

      const modelPath = modelManager.getModelPath('medium');
      
      expect(modelPath).toContain('ggml-base.bin');
    });

    it('should cache model validation results', () => {
      mockFs.statSync.mockReturnValue({
        size: 150 * 1024 * 1024,
      } as fs.Stats);
      
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(8);
      mockFs.closeSync.mockReturnValue();
      Buffer.prototype.toString = jest.fn().mockReturnValue('ggml');

      // First call
      const path1 = modelManager.getModelPath('base');
      // Second call should use cache
      const path2 = modelManager.getModelPath('base');
      
      expect(path1).toBe(path2);
      // Should only call file operations once due to caching
      expect(mockFs.statSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTinydiarizeModelPath', () => {
    it('should return path when tinydiarize model exists and is valid size', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: 465 * 1024 * 1024, // 465MB
      } as fs.Stats);

      const modelPath = modelManager.getTinydiarizeModelPath();
      
      expect(modelPath).toContain('ggml-small.en-tdrz.bin');
      expect(modelPath).not.toBe('');
    });

    it('should return empty string when model is too small', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: 100 * 1024 * 1024, // 100MB - too small
      } as fs.Stats);

      const modelPath = modelManager.getTinydiarizeModelPath();
      
      expect(modelPath).toBe('');
    });

    it('should return empty string when model does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const modelPath = modelManager.getTinydiarizeModelPath();
      
      expect(modelPath).toBe('');
    });

    it('should cache tinydiarize model validation', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: 465 * 1024 * 1024,
      } as fs.Stats);

      // First call
      const path1 = modelManager.getTinydiarizeModelPath();
      // Second call should use cache
      const path2 = modelManager.getTinydiarizeModelPath();
      
      expect(path1).toBe(path2);
      expect(mockFs.existsSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasTinydiarizeModel', () => {
    it('should return true when tinydiarize model is available', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: 465 * 1024 * 1024,
      } as fs.Stats);

      expect(modelManager.hasTinydiarizeModel()).toBe(true);
    });

    it('should return false when tinydiarize model is not available', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(modelManager.hasTinydiarizeModel()).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should clear cache correctly', () => {
      // Prime the cache
      mockFs.statSync.mockReturnValue({
        size: 150 * 1024 * 1024,
      } as fs.Stats);
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(8);
      mockFs.closeSync.mockReturnValue();
      Buffer.prototype.toString = jest.fn().mockReturnValue('ggml');

      modelManager.getModelPath('base');
      
      // Clear cache
      modelManager.clearCache();
      
      // Should have empty cache stats
      const stats = modelManager.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.models).toHaveLength(0);
    });

    it('should provide cache statistics', () => {
      mockFs.statSync.mockReturnValue({
        size: 150 * 1024 * 1024,
      } as fs.Stats);
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(8);
      mockFs.closeSync.mockReturnValue();
      Buffer.prototype.toString = jest.fn().mockReturnValue('ggml');

      // Prime cache with multiple models
      modelManager.getModelPath('base');
      modelManager.getModelPath('small');
      
      const stats = modelManager.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.models).toContain('base');
      expect(stats.models).toContain('small');
    });

    it('should respect cache TTL', (done) => {
      // Mock a very short TTL for testing
      const originalTTL = (modelManager as any).CACHE_TTL;
      (modelManager as any).CACHE_TTL = 10; // 10ms

      mockFs.statSync.mockReturnValue({
        size: 150 * 1024 * 1024,
      } as fs.Stats);
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(8);
      mockFs.closeSync.mockReturnValue();
      Buffer.prototype.toString = jest.fn().mockReturnValue('ggml');

      // First call
      modelManager.getModelPath('base');
      expect(mockFs.statSync).toHaveBeenCalledTimes(1);
      
      // Wait for cache to expire
      setTimeout(() => {
        // Second call after TTL should re-validate
        modelManager.getModelPath('base');
        expect(mockFs.statSync).toHaveBeenCalledTimes(2);
        
        // Restore original TTL
        (modelManager as any).CACHE_TTL = originalTTL;
        done();
      }, 15);
    });
  });

  describe('model validation', () => {
    it('should reject files with invalid magic number', () => {
      mockFs.statSync.mockReturnValue({
        size: 150 * 1024 * 1024,
      } as fs.Stats);
      
      mockFs.openSync.mockReturnValue(3);
      mockFs.readSync.mockReturnValue(8);
      mockFs.closeSync.mockReturnValue();
      Buffer.prototype.toString = jest.fn().mockReturnValue('invalid'); // Wrong magic

      const modelPath = modelManager.getModelPath('base');
      
      // Should fallback to base model
      expect(modelPath).toContain('ggml-base.bin');
    });

    it('should handle file read errors gracefully', () => {
      mockFs.statSync.mockReturnValue({
        size: 150 * 1024 * 1024,
      } as fs.Stats);
      
      mockFs.openSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const modelPath = modelManager.getModelPath('medium');
      
      // Should fallback gracefully
      expect(modelPath).toBeDefined();
    });

    it('should validate minimum file sizes correctly', () => {
      // Test tiny model with insufficient size
      mockFs.statSync.mockReturnValue({
        size: 1024 * 1024, // 1MB - too small for tiny model
      } as fs.Stats);

      const modelPath = modelManager.getModelPath('tiny');
      
      // Should fallback to base model due to size validation
      expect(modelPath).toContain('ggml-base.bin');
    });
  });
});