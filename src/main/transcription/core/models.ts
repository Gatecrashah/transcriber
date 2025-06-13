/**
 * Whisper model management and validation
 */

import * as path from 'path';
import * as fs from 'fs';

export class WhisperModelManager {
  private modelsDir: string;
  private modelCache = new Map<string, { isValid: boolean; path: string; lastChecked: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(whisperDir: string) {
    this.modelsDir = path.join(whisperDir, 'models');
  }

  getModelPath(model = 'base'): string {
    // Check cache first
    const cacheKey = model;
    const cached = this.modelCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.lastChecked) < this.CACHE_TTL && cached.isValid) {
      return cached.path;
    }

    // Map 'large' to 'large-v3' since that's what we're downloading
    if (model === 'large') {
      model = 'large-v3';
    }
    
    const modelPath = path.join(this.modelsDir, `ggml-${model}.bin`);
    const fallbackPath = path.join(this.modelsDir, 'ggml-base.bin');
    
    // Check if the model file exists and is valid
    const isValid = this.isValidModelFile(modelPath, model);
    
    if (!isValid) {
      console.log(`Model ${model} not found or invalid, falling back to base model`);
      const fallbackValid = this.isValidModelFile(fallbackPath, 'base');
      
      // Cache both results
      this.modelCache.set(cacheKey, { isValid: false, path: fallbackPath, lastChecked: now });
      this.modelCache.set('base', { isValid: fallbackValid, path: fallbackPath, lastChecked: now });
      
      return fallbackPath;
    }
    
    // Cache valid result
    this.modelCache.set(cacheKey, { isValid: true, path: modelPath, lastChecked: now });
    return modelPath;
  }

  getTinydiarizeModelPath(): string {
    const cacheKey = 'tinydiarize';
    const cached = this.modelCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.lastChecked) < this.CACHE_TTL) {
      return cached.isValid ? cached.path : '';
    }

    const tdrz1ModelPath = path.join(this.modelsDir, 'ggml-small.en-tdrz.bin');
    
    // Check if tinydiarize model exists
    if (fs.existsSync(tdrz1ModelPath)) {
      const stats = fs.statSync(tdrz1ModelPath);
      const isValid = stats.size > 400000000; // Should be ~465MB
      
      this.modelCache.set(cacheKey, { 
        isValid, 
        path: isValid ? tdrz1ModelPath : '', 
        lastChecked: now 
      });
      
      return isValid ? tdrz1ModelPath : '';
    }
    
    this.modelCache.set(cacheKey, { isValid: false, path: '', lastChecked: now });
    return '';
  }

  hasTinydiarizeModel(): boolean {
    return this.getTinydiarizeModelPath() !== '';
  }

  private isValidModelFile(modelPath: string, modelName: string): boolean {
    try {
      const stats = fs.statSync(modelPath);
      
      // Define expected minimum sizes for different models (in bytes)
      const expectedSizes: { [key: string]: number } = {
        'tiny': 30 * 1024 * 1024,      // ~30MB
        'base': 100 * 1024 * 1024,     // ~100MB
        'small': 400 * 1024 * 1024,    // ~400MB
        'medium': 1200 * 1024 * 1024,  // ~1.2GB
        'large-v1': 2500 * 1024 * 1024,  // ~2.5GB
        'large-v2': 2500 * 1024 * 1024,  // ~2.5GB
        'large-v3': 2800 * 1024 * 1024,  // ~2.8GB
      };
      
      const expectedSize = expectedSizes[modelName] || 1000; // Default minimum size
      
      if (stats.size < expectedSize) {
        console.log(`Model ${modelName} file is too small (${stats.size} bytes, expected at least ${expectedSize} bytes)`);
        return false;
      }
      
      // Additional check: try to read the file header to verify it's a valid GGML file
      try {
        const fd = fs.openSync(modelPath, 'r');
        const buffer = Buffer.alloc(8);
        fs.readSync(fd, buffer, 0, 8, 0);
        fs.closeSync(fd);
        
        // Check for GGML magic number
        const magic = buffer.toString('ascii', 0, 4);
        if (magic !== 'ggml') {
          console.log(`Model ${modelName} has invalid magic number: ${magic}`);
          return false;
        }
      } catch (readError) {
        console.log(`Cannot read model file ${modelName}: ${readError}`);
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  clearCache(): void {
    this.modelCache.clear();
  }

  getCacheStats(): { size: number; models: string[] } {
    return {
      size: this.modelCache.size,
      models: Array.from(this.modelCache.keys())
    };
  }
}