/**
 * Core transcription processing logic
 */

import * as fs from 'fs';
import { spawn } from 'child_process';
import type { TranscriptionResult, TranscriptionOptions } from '../../../types/transcription';
import { WhisperModelManager } from './models';
import { AudioAnalyzer } from '../audio/analyzer';

export class TranscriptionProcessor {
  private whisperPath: string;
  private modelManager: WhisperModelManager;
  private audioAnalyzer: AudioAnalyzer;

  constructor(whisperPath: string, modelManager: WhisperModelManager) {
    this.whisperPath = whisperPath;
    this.modelManager = modelManager;
    this.audioAnalyzer = new AudioAnalyzer(whisperPath, modelManager);
  }

  /**
   * Transcribe an audio file using whisper.cpp
   */
  async transcribeFile(
    audioFilePath: string,
    options: TranscriptionOptions = {}
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
      const audioAnalysis = await this.audioAnalyzer.analyzeAudioFile(audioFilePath);
      console.log(`🔍 Audio analysis: ${audioAnalysis.info}`);
      
      if (!audioAnalysis.hasAudio) {
        console.warn('⚠️ Audio file may not contain valid audio data');
      }
      
      const modelPath = this.modelManager.getModelPath(options.model || 'base');
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

      // Add diarization if enabled
      if (options.enableDiarization) {
        if (this.modelManager.hasTinydiarizeModel()) {
          // Use tinydiarize model for mono audio speaker diarization
          const tdrz1ModelPath = this.modelManager.getTinydiarizeModelPath();
          args[1] = tdrz1ModelPath; // Replace the model path with tinydiarize model
          args.push('--tinydiarize');
          console.log('🎙️ Speaker diarization enabled (tinydiarize for mono audio)');
          console.log(`📁 Using tinydiarize model: ${tdrz1ModelPath}`);
          console.log('🔧 Whisper args with tinydiarize:', args);
        } else {
          console.warn('⚠️ Tinydiarize model not found, diarization will be disabled');
          console.log('   Run download-tinydiarize-model.sh to enable speaker diarization');
          // Don't add diarization flags if model is missing
        }
      }

      // Add output format - prefer JSON for diarization to get speaker timestamps
      if ((options.enableDiarization && this.modelManager.hasTinydiarizeModel()) || options.outputFormat === 'json') {
        args.push('--output-json');
        console.log('📄 JSON output format enabled for diarization');
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
   */
  async transcribeStream(
    audioFilePath: string,
    onProgress: (partialText: string) => void,
    options: { model?: string } = {}
  ): Promise<TranscriptionResult> {
    try {
      const modelPath = this.modelManager.getModelPath(options.model || 'base');
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