/**
 * Audio analysis and Voice Activity Detection (VAD)
 */

import { spawn } from 'child_process';
import type { VADResult, AudioAnalysis } from '../../../types/transcription';
import type { WhisperModelManager } from '../core/models';

export class AudioAnalyzer {
  private whisperPath: string;
  private modelManager: WhisperModelManager;

  constructor(whisperPath: string, modelManager: WhisperModelManager) {
    this.whisperPath = whisperPath;
    this.modelManager = modelManager;
  }

  /**
   * Perform Voice Activity Detection on audio file
   */
  async performVAD(audioFilePath: string): Promise<VADResult> {
    try {
      // TEMPORARILY DISABLE VAD - working version didn't have it
      console.log('🎙️ VAD temporarily disabled (working version had no VAD)');
      return { hasVoice: true, confidence: 0.9 };
      
      // Use whisper.cpp with very short duration to quickly check for voice activity
      const vadArgs = [
        '-m', this.modelManager.getModelPath('tiny'), // Use tiny model for fast VAD
        '-f', audioFilePath,
        '-d', '10000', // Process first 10 seconds for better accuracy
        '--language', 'en', // Specify language for better accuracy
        '--output-txt'
      ];

      console.log('🎙️ Performing Voice Activity Detection with enhanced parameters...');
      const result = await this.runWhisper(vadArgs);
      
      if (result.success && result.stdout) {
        const text = result.stdout.trim();
        console.log(`🔍 VAD raw output: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
        
        // Enhanced VAD logic
        const hasMinimalText = text.length > 5;
        const hasNonHallucination = !this.isLikelyHallucination(text);
        const hasReasonableContent = !/^\s*$/.test(text) && !/^[.,-\s]*$/.test(text);
        
        // Calculate confidence based on multiple factors
        let confidence = 0;
        if (hasMinimalText) confidence += 0.3;
        if (hasNonHallucination) confidence += 0.4;
        if (hasReasonableContent) confidence += 0.3;
        
        // Bonus for longer transcriptions (up to 100 chars)
        confidence += Math.min(text.length / 100, 0.2);
        
        const hasVoice = hasMinimalText && hasNonHallucination && hasReasonableContent;
        
        console.log(`📊 VAD Analysis:`);
        console.log(`   - Text length: ${text.length} chars`);
        console.log(`   - Has minimal text: ${hasMinimalText}`);
        console.log(`   - Non-hallucination: ${hasNonHallucination}`);
        console.log(`   - Reasonable content: ${hasReasonableContent}`);
        console.log(`   - Final result: ${hasVoice ? 'Voice detected' : 'No voice'} (confidence: ${confidence.toFixed(2)})`);
        
        return { hasVoice, confidence };
      }
      
      console.warn('⚠️ VAD got empty result from whisper.cpp');
      return { hasVoice: false, confidence: 0 };
    } catch (error) {
      console.warn('⚠️ VAD failed, assuming voice present:', error);
      return { hasVoice: true, confidence: 0.5 }; // Default to transcribing if VAD fails
    }
  }

  /**
   * Analyze audio file to check if it contains actual audio data
   */
  async analyzeAudioFile(audioFilePath: string): Promise<AudioAnalysis> {
    try {
      return new Promise((resolve) => {
        // Try to use ffmpeg to get audio info
        const ffmpeg = spawn('ffmpeg', ['-i', audioFilePath, '-f', 'null', '-'], {
          stdio: ['ignore', 'ignore', 'pipe']
        });
        
        let stderr = '';
        ffmpeg.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        ffmpeg.on('close', (_code: number | null) => {
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
              duration,
              bitrate,
              format: audioMatch[1],
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
   * Detect likely hallucinations in transcription output
   */
  isLikelyHallucination(text: string): boolean {
    if (!text || text.length < 10) return true;
    
    // Common hallucination patterns
    const hallucinations = [
      // Repetitive phrases
      /(.{10,})\1{3,}/g, // Same phrase repeated 3+ times
      // Common whisper artifacts
      /\[no speech detected\]/gi,
      /\[BLANK_AUDIO\]/gi,
      /\[inaudible\]/gi,
      // Very repetitive words
      /([\w\s]{1,20})\s+\1\s+\1/gi, // Same short phrase repeated 3+ times
      // Nonsensical repetition
      /thank you\s+(thank you\s+){2,}/gi,
      /(?:the same way that|in the same way that|we're going to help each other).+(?:the same way that|in the same way that|we're going to help each other)/gi
    ];
    
    for (const pattern of hallucinations) {
      if (pattern.test(text)) {
        console.log(`🚫 Detected hallucination pattern: ${pattern}`);
        return true;
      }
    }
    
    // Check for excessive repetition ratio
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = words.length / uniqueWords.size;
    
    if (repetitionRatio > 3) {
      console.log(`🚫 Excessive word repetition detected (ratio: ${repetitionRatio.toFixed(2)})`);
      return true;
    }
    
    return false;
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
}