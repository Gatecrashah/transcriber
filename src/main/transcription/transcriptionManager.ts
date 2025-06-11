import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  success: boolean;
  error?: string;
}

export class TranscriptionManager {
  private whisperPath: string;
  private modelsDir: string;

  constructor() {
    const whisperDir = path.join(process.cwd(), 'src', 'native', 'whisper', 'whisper.cpp');
    this.whisperPath = path.join(whisperDir, 'build', 'bin', 'main');
    this.modelsDir = path.join(whisperDir, 'models');
  }

  private getModelPath(model = 'base'): string {
    // Map 'large' to 'large-v3' since that's what we're downloading
    if (model === 'large') {
      model = 'large-v3';
    }
    
    const modelPath = path.join(this.modelsDir, `ggml-${model}.bin`);
    const fallbackPath = path.join(this.modelsDir, 'ggml-base.bin');
    
    // Check if the model file exists and is valid
    if (!this.isValidModelFile(modelPath, model)) {
      console.log(`Model ${model} not found or invalid, falling back to base model`);
      return fallbackPath;
    }
    
    return modelPath;
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

  /**
   * Transcribe an audio file using whisper.cpp
   * @param audioFilePath Path to the audio file to transcribe
   * @param options Additional options for transcription
   */
  async transcribeFile(
    audioFilePath: string,
    options: {
      language?: string;
      threads?: number;
      model?: string;
      outputFormat?: 'txt' | 'json' | 'srt' | 'vtt';
    } = {}
  ): Promise<TranscriptionResult> {
    try {
      // Validate audio file exists and has reasonable size
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }
      
      const stats = fs.statSync(audioFilePath);
      console.log(`📁 Audio file: ${audioFilePath} (${stats.size} bytes)`);
      
      if (stats.size < 1000) {
        throw new Error(`Audio file too small: ${stats.size} bytes`);
      }
      
      if (stats.size > 100 * 1024 * 1024) {
        console.warn(`⚠️ Large audio file: ${stats.size} bytes`);
      }
      
      // Analyze audio file to check if it contains actual audio data
      const audioAnalysis = await this.analyzeAudioFile(audioFilePath);
      console.log(`🔍 Audio analysis: ${audioAnalysis.info}`);
      
      if (!audioAnalysis.hasAudio) {
        console.warn('⚠️ Audio file may not contain valid audio data');
      }
      
      const modelPath = this.getModelPath(options.model || 'base');
      const actualModel = modelPath.includes('base') ? 'base' : options.model || 'base';
      console.log(`Using Whisper model: ${actualModel} (${modelPath})`);
      
      const args = [
        '-m', modelPath,
        '-f', audioFilePath,
        '--output-txt',
        '--print-progress'
      ];

      // Add language if specified
      if (options.language) {
        args.push('-l', options.language);
      }

      // Add thread count if specified
      if (options.threads) {
        args.push('-t', options.threads.toString());
      }

      // Add output format
      if (options.outputFormat === 'json') {
        args.push('--output-json');
      } else if (options.outputFormat === 'srt') {
        args.push('--output-srt');
      } else if (options.outputFormat === 'vtt') {
        args.push('--output-vtt');
      }

      console.log('Running whisper with args:', args);

      const result = await this.runWhisper(args);
      
      console.log('🗣️ Whisper execution result:', {
        success: result.success,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        stdout: result.stdout,
        stderr: result.stderr
      });
      
      if (result.success) {
        const transcribedText = result.stdout.trim();
        console.log('✅ Raw whisper output:', transcribedText);
        
        // If we got empty output, that might indicate an audio format issue
        if (transcribedText.length === 0) {
          console.log('⚠️  Empty transcription result - this might indicate an audio format issue');
        }
        
        return {
          text: transcribedText,
          success: true,
          duration: this.extractDuration(result.stdout)
        };
      } else {
        console.error('❌ Whisper failed:', result.stderr);
        return {
          text: '',
          success: false,
          error: result.stderr
        };
      }
    } catch (error) {
      console.error('Transcription error:', error);
      return {
        text: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transcribe audio in real-time (streaming)
   * @param audioFilePath Path to the audio file
   * @param onProgress Callback for partial results
   */
  async transcribeStream(
    audioFilePath: string,
    onProgress: (partialText: string) => void,
    options: {
      model?: string;
    } = {}
  ): Promise<TranscriptionResult> {
    try {
      const modelPath = this.getModelPath(options.model || 'base');
      const args = [
        '-m', modelPath,
        '-f', audioFilePath,
        '--output-txt',
        '--print-progress'
      ];

      const result = await this.runWhisperStream(args, onProgress);
      
      return {
        text: result.finalText,
        success: result.success,
        error: result.error
      };
    } catch (error) {
      console.error('Stream transcription error:', error);
      return {
        text: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if whisper.cpp is properly installed and accessible
   */
  async checkInstallation(): Promise<{ installed: boolean; error?: string }> {
    try {
      const result = await this.runWhisper(['--help']);
      return { installed: result.success };
    } catch (error) {
      return {
        installed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Run whisper.cpp command
   */
  private runWhisper(args: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const process = spawn(this.whisperPath, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr
        });
      });

      process.on('error', (error) => {
        resolve({
          success: false,
          stdout,
          stderr: error.message
        });
      });
    });
  }

  /**
   * Run whisper.cpp with streaming output
   */
  private runWhisperStream(
    args: string[],
    onProgress: (partialText: string) => void
  ): Promise<{ success: boolean; finalText: string; error?: string }> {
    return new Promise((resolve) => {
      const process = spawn(this.whisperPath, args);
      let finalText = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const output = data.toString();
        finalText += output;
        
        // Extract partial text and send progress updates
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim() && !line.includes('[') && !line.includes('whisper_')) {
            onProgress(line.trim());
          }
        }
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          finalText: finalText.trim(),
          error: code !== 0 ? stderr : undefined
        });
      });

      process.on('error', (error) => {
        resolve({
          success: false,
          finalText: '',
          error: error.message
        });
      });
    });
  }

  /**
   * Analyze audio file to check if it contains actual audio data
   */
  private async analyzeAudioFile(audioFilePath: string): Promise<{ hasAudio: boolean; info?: string }> {
    try {
      // Use FFmpeg to analyze the audio file if available
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        // Try to use ffmpeg to get audio info
        const ffmpeg = spawn('ffmpeg', ['-i', audioFilePath, '-f', 'null', '-'], {
          stdio: ['ignore', 'ignore', 'pipe']
        });
        
        let stderr = '';
        ffmpeg.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        ffmpeg.on('close', (code: number | null) => {
          // Parse ffmpeg output for audio info
          const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
          const bitrateMatch = stderr.match(/bitrate: (\d+) kb\/s/);
          const audioMatch = stderr.match(/Audio: ([^,]+)/);
          
          if (durationMatch && audioMatch) {
            const duration = parseFloat(durationMatch[1]) * 3600 + parseFloat(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
            const bitrate = bitrateMatch ? parseInt(bitrateMatch[1]) : 0;
            
            console.log(`🎵 Audio analysis: ${duration.toFixed(2)}s, ${audioMatch[1]}, ${bitrate} kb/s`);
            
            resolve({
              hasAudio: duration > 0.1 && bitrate > 0,
              info: `Duration: ${duration.toFixed(2)}s, Format: ${audioMatch[1]}, Bitrate: ${bitrate} kb/s`
            });
          } else {
            // Fallback: just check file size and assume it has audio
            resolve({
              hasAudio: true,
              info: 'Analysis failed, assuming audio present'
            });
          }
        });
        
        ffmpeg.on('error', () => {
          // FFmpeg not available, assume audio is present
          resolve({
            hasAudio: true,
            info: 'FFmpeg not available for analysis'
          });
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          ffmpeg.kill();
          resolve({
            hasAudio: true,
            info: 'Analysis timeout, assuming audio present'
          });
        }, 5000);
      });
    } catch (error) {
      return {
        hasAudio: true,
        info: 'Analysis error, assuming audio present'
      };
    }
  }

  /**
   * Extract duration from whisper output
   */
  private extractDuration(output: string): number | undefined {
    const durationMatch = output.match(/\[(\d+:\d+:\d+\.\d+) --> (\d+:\d+:\d+\.\d+)\]/);
    if (durationMatch) {
      const endTime = durationMatch[2];
      const parts = endTime.split(':');
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return undefined;
  }
}