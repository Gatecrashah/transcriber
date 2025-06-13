/**
 * Refactored TranscriptionManager using modular architecture
 */

import * as path from 'path';
import * as fs from 'fs';
import type { TranscriptionResult, TranscriptionOptions, SpeakerSegment } from '../../types/transcription';
import { WhisperModelManager } from './core/models';
import { TranscriptionProcessor } from './core/processor';
import { AudioAnalyzer } from './audio/analyzer';
import { SpeakerDiarization } from './speaker/diarization';

export class TranscriptionManager {
  private whisperPath: string;
  private modelManager: WhisperModelManager;
  private processor: TranscriptionProcessor;
  private audioAnalyzer: AudioAnalyzer;
  private speakerDiarization: SpeakerDiarization;

  constructor() {
    const whisperDir = path.join(process.cwd(), 'src', 'native', 'whisper', 'whisper.cpp');
    this.whisperPath = path.join(whisperDir, 'build', 'bin', 'main');
    
    // Initialize modular components
    this.modelManager = new WhisperModelManager(whisperDir);
    this.processor = new TranscriptionProcessor(this.whisperPath, this.modelManager);
    this.audioAnalyzer = new AudioAnalyzer(this.whisperPath, this.modelManager);
    this.speakerDiarization = new SpeakerDiarization();
  }

  /**
   * Transcribe an audio file using whisper.cpp
   */
  async transcribeFile(
    audioFilePath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    return this.processor.transcribeFile(audioFilePath, options);
  }

  /**
   * Transcribe dual audio streams with speaker identification
   */
  async transcribeDualStreams(
    systemAudioPath?: string,
    microphoneAudioPath?: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    try {
      const results: SpeakerSegment[] = [];
      let combinedText = '';
      
      // Default speaker names
      const systemSpeaker = options.systemSpeakerName || 'Meeting Participants';
      const microphoneSpeaker = options.microphoneSpeakerName || 'You';
      
      console.log('🎙️ Starting dual-stream transcription with speaker identification');
      
      // Transcribe system audio with multi-speaker diarization
      if (systemAudioPath && fs.existsSync(systemAudioPath)) {
        const systemStats = fs.statSync(systemAudioPath);
        console.log(`🔊 Transcribing system audio with multi-speaker diarization`);
        console.log(`   📁 System audio file: ${systemAudioPath} (${systemStats.size} bytes)`);
        
        // Perform VAD on system audio first
        console.log('🎙️ Performing VAD on system audio...');
        const systemVAD = await this.audioAnalyzer.performVAD(systemAudioPath);
        
        if (!systemVAD.hasVoice) {
          console.warn(`⚠️ No voice activity detected in system audio (confidence: ${systemVAD.confidence.toFixed(2)}) - skipping transcription`);
        } else {
          console.log(`✅ Voice activity detected in system audio (confidence: ${systemVAD.confidence.toFixed(2)})`);
          
          const systemResult = await this.processor.transcribeFile(systemAudioPath, {
            ...options,
            enableDiarization: true,
            outputFormat: 'txt',
            speakerLabel: systemSpeaker
          });
          
          if (systemResult.success && systemResult.text) {
            console.log('✅ System audio diarization successful');
            
            const systemSegments = this.speakerDiarization.parseTranscriptionForMultipleSpeakers(
              systemResult.text, 
              'system'
            );
            
            results.push(...systemSegments);
            
            // Format multi-speaker output
            const groupedBySpeaker = this.speakerDiarization.groupSegmentsBySpeaker(systemSegments);
            for (const [speaker, segments] of Object.entries(groupedBySpeaker)) {
              const speakerText = segments.map(s => s.text).join(' ').trim();
              if (speakerText) {
                combinedText += `**${speaker}:**\n${speakerText}\n\n`;
              }
            }
          } else {
            console.warn(`⚠️ System audio diarization failed: ${systemResult.error}`);
            
            // Fallback to basic transcription without diarization
            const fallbackResult = await this.processor.transcribeFile(systemAudioPath, {
              ...options,
              enableDiarization: false,
              outputFormat: 'txt',
              speakerLabel: systemSpeaker
            });
            
            if (fallbackResult.success && fallbackResult.text) {
              const fallbackSegments = this.speakerDiarization.parseTranscriptionForSpeakers(
                fallbackResult.text, 
                systemSpeaker,
                'system'
              );
              results.push(...fallbackSegments);
              combinedText += `**${systemSpeaker}:**\n${fallbackResult.text.trim()}\n\n`;
            }
          }
        }
      }
      
      // Transcribe microphone audio (user) with quality detection
      if (microphoneAudioPath && fs.existsSync(microphoneAudioPath)) {
        const micStats = fs.statSync(microphoneAudioPath);
        console.log(`🎤 Transcribing microphone audio: ${microphoneSpeaker}`);
        console.log(`   📁 Microphone audio file: ${microphoneAudioPath} (${micStats.size} bytes)`);
        
        const minAudioSize = 50000; // 50KB minimum for meaningful audio
        if (micStats.size < minAudioSize) {
          console.warn(`⚠️ Microphone audio file too small (${micStats.size} bytes), likely silent - skipping transcription`);
        } else {
          // Perform VAD on microphone audio first
          console.log('🎙️ Performing VAD on microphone audio...');
          const microphoneVAD = await this.audioAnalyzer.performVAD(microphoneAudioPath);
          
          if (!microphoneVAD.hasVoice) {
            console.warn(`⚠️ No voice activity detected in microphone audio (confidence: ${microphoneVAD.confidence.toFixed(2)}) - skipping transcription`);
          } else {
            console.log(`✅ Voice activity detected in microphone audio (confidence: ${microphoneVAD.confidence.toFixed(2)})`);
            
            const micResult = await this.processor.transcribeFile(microphoneAudioPath, {
              ...options,
              enableDiarization: false,
              outputFormat: 'txt',
              speakerLabel: microphoneSpeaker
            });
            
            if (micResult.success && micResult.text) {
              const cleanedText = micResult.text.trim();
              if (this.audioAnalyzer.isLikelyHallucination(cleanedText)) {
                console.warn(`⚠️ Microphone transcription appears to be hallucination - skipping`);
                console.log(`   Detected pattern: ${cleanedText.substring(0, 100)}...`);
              } else {
                const micSegments = this.speakerDiarization.parseTranscriptionForSpeakers(
                  cleanedText,
                  microphoneSpeaker,
                  'microphone'
                );
                results.push(...micSegments);
                combinedText += `**${microphoneSpeaker}:**\n${cleanedText}\n\n`;
              }
            } else {
              console.warn(`⚠️ Microphone audio transcription failed: ${micResult.error}`);
            }
          }
        }
      }
      
      // Sort segments by timestamp to create a chronological conversation
      results.sort((a, b) => a.startTime - b.startTime);
      
      const formattedTranscript = combinedText.trim();
      
      if (formattedTranscript.length === 0) {
        console.warn('⚠️ No transcription results from individual streams');
        return {
          text: '(No speech detected in individual audio streams. You may want to check audio levels and try again.)',
          success: true,
          speakers: results
        };
      }
      
      console.log(`✅ Dual-stream transcription complete: ${results.length} segments`);
      console.log(`📝 Combined transcript length: ${formattedTranscript.length} characters`);
      
      return {
        text: formattedTranscript,
        success: true,
        speakers: results
      };
      
    } catch (error) {
      console.error('❌ Dual-stream transcription error:', error);
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
    return this.processor.transcribeStream(audioFilePath, onProgress, options);
  }

  /**
   * Check if whisper.cpp is properly installed and accessible
   */
  async checkInstallation(): Promise<{ installed: boolean; error?: string }> {
    return this.processor.checkInstallation();
  }

  /**
   * Get model cache statistics (useful for debugging)
   */
  getModelCacheStats(): { size: number; models: string[] } {
    return this.modelManager.getCacheStats();
  }

  /**
   * Clear model cache (useful for testing or troubleshooting)
   */
  clearModelCache(): void {
    this.modelManager.clearCache();
  }
}

// Export the same interfaces for compatibility
export type { TranscriptionResult, SpeakerSegment } from '../../types/transcription';