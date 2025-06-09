import * as path from 'path';
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
  private modelPath: string;

  constructor() {
    const whisperDir = path.join(process.cwd(), 'src', 'native', 'whisper', 'whisper.cpp');
    this.whisperPath = path.join(whisperDir, 'build', 'bin', 'main');
    this.modelPath = path.join(whisperDir, 'models', 'ggml-base.bin');
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
      outputFormat?: 'txt' | 'json' | 'srt' | 'vtt';
    } = {}
  ): Promise<TranscriptionResult> {
    try {
      const args = [
        '-m', this.modelPath,
        '-f', audioFilePath,
        '--output-txt',
        '--print-colors'
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
      
      if (result.success) {
        return {
          text: result.stdout.trim(),
          success: true,
          duration: this.extractDuration(result.stdout)
        };
      } else {
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
    onProgress: (partialText: string) => void
  ): Promise<TranscriptionResult> {
    try {
      const args = [
        '-m', this.modelPath,
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