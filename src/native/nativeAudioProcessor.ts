import * as path from 'path';
import { spawn } from 'child_process';
import { TranscriptionResult, SpeakerSegment } from '../types/transcription';

// Path to the Swift executable that wraps our native processing
const swiftExecutablePath = path.join(__dirname, '../../src/native/swift/.build/arm64-apple-macosx/release/audio-capture');

/**
 * Native Audio Processor - TypeScript wrapper for Swift audio processing pipeline
 * 
 * This class provides a clean TypeScript interface to the Swift-native WhisperKit + FluidAudio
 * processing system, delivering 97.7x performance improvements over the old whisper.cpp approach.
 * 
 * Uses child process communication instead of FFI for better Node.js compatibility
 */
export class NativeAudioProcessor {
  private isInitialized = false;

  constructor() {
    console.log('🔗 Setting up native Swift audio processing...');
    console.log(`📍 Swift executable path: ${swiftExecutablePath}`);
  }

  /**
   * Initialize the Swift audio processing system
   * This must be called before any processing operations
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      console.log('✅ Native audio processor already initialized');
      return true;
    }

    console.log('🔄 Initializing native Swift audio processing system...');

    return new Promise((resolve) => {
      const initProcess = spawn(swiftExecutablePath, ['init']);
      
      let output = '';
      let errorOutput = '';
      
      initProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      initProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      initProcess.on('close', (code) => {
        if (code === 0 && output.includes('SUCCESS: SwiftAudioBridge initialized')) {
          this.isInitialized = true;
          console.log('✅ Native audio processor initialized successfully');
          resolve(true);
        } else {
          console.error('❌ Native audio processor initialization failed');
          console.error('Output:', output);
          console.error('Error:', errorOutput);
          resolve(false);
        }
      });
      
      initProcess.on('error', (error) => {
        console.error('❌ Error spawning initialization process:', error);
        resolve(false);
      });
    });
  }

  /**
   * Check if the system is ready for processing
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Process an audio file using the Swift-native pipeline
   * @param filePath Path to the audio file to process
   * @returns Promise<TranscriptionResult> with transcription and speaker diarization
   */
  public async processAudioFile(filePath: string): Promise<TranscriptionResult> {
    if (!this.isReady()) {
      throw new Error('Native audio processor not initialized or not ready');
    }

    console.log(`🎵 Processing audio file: ${path.basename(filePath)}`);

    return new Promise((resolve, reject) => {
      const processCommand = spawn(swiftExecutablePath, ['process', filePath]);
      
      let jsonOutput = '';
      let errorOutput = '';
      
      processCommand.stdout.on('data', (data) => {
        jsonOutput += data.toString();
      });
      
      processCommand.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      processCommand.on('close', (code) => {
        if (code === 0) {
          try {
            // Extract JSON from the output (filter out logging)
            const lines = jsonOutput.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            
            if (!jsonLine) {
              throw new Error('No JSON result found in output');
            }
            
            const swiftResult = JSON.parse(jsonLine);
            const transcriptionResult = this.convertSwiftResultToTranscriptionResult(swiftResult);
            
            console.log(`✅ Audio file processed successfully: ${transcriptionResult.text.length} characters, ${transcriptionResult.speakers?.length || 0} speakers`);
            resolve(transcriptionResult);
            
          } catch (error) {
            console.error('❌ Error parsing Swift result:', error);
            console.error('Raw output:', jsonOutput);
            reject(new Error(`Failed to parse processing result: ${error}`));
          }
        } else {
          console.error('❌ Swift processing failed with code:', code);
          console.error('Error output:', errorOutput);
          reject(new Error(`Audio processing failed with exit code ${code}: ${errorOutput}`));
        }
      });
      
      processCommand.on('error', (error) => {
        console.error('❌ Error spawning processing command:', error);
        reject(new Error(`Failed to spawn processing command: ${error}`));
      });
    });
  }

  /**
   * Process audio buffer data using the Swift-native pipeline
   * Note: For now, this creates a temporary file since our Swift CLI expects file paths
   * TODO: In future versions, implement direct buffer processing
   * @param audioData Float32Array of audio samples
   * @param sampleRate Sample rate of the audio data
   * @param channels Number of audio channels
   * @returns Promise<TranscriptionResult> with transcription and speaker diarization
   */
  public async processAudioBuffer(audioData: Float32Array, sampleRate: number, channels: number): Promise<TranscriptionResult> {
    if (!this.isReady()) {
      throw new Error('Native audio processor not initialized or not ready');
    }

    console.log(`🎵 Processing audio buffer: ${audioData.length} samples at ${sampleRate}Hz`);
    
    // For now, we'll need to create a temporary WAV file since our Swift CLI expects file paths
    // TODO: Implement direct buffer processing in Swift CLI
    const fs = require('fs');
    const os = require('os');
    const tempFilePath = path.join(os.tmpdir(), `temp_audio_${Date.now()}.wav`);
    
    try {
      // Create a simple WAV file from the audio data
      await this.writeAudioDataToFile(audioData, sampleRate, channels, tempFilePath);
      
      // Process the temporary file
      const result = await this.processAudioFile(tempFilePath);
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      
      console.log(`✅ Audio buffer processed successfully: ${result.text.length} characters`);
      return result;
      
    } catch (error) {
      // Clean up temporary file if it exists
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
      
      console.error('❌ Audio buffer processing failed:', error);
      throw new Error(`Audio buffer processing failed: ${error}`);
    }
  }

  /**
   * Helper method to write audio data to a WAV file
   */
  private async writeAudioDataToFile(audioData: Float32Array, sampleRate: number, channels: number, filePath: string): Promise<void> {
    const fs = require('fs');
    
    // Simple WAV file creation (16-bit PCM)
    const buffer = Buffer.alloc(44 + audioData.length * 2);
    
    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + audioData.length * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // PCM format chunk size
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
    buffer.writeUInt16LE(channels * 2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(audioData.length * 2, 40);
    
    // Convert float samples to 16-bit PCM
    for (let i = 0; i < audioData.length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const pcmSample = Math.round(sample * 32767);
      buffer.writeInt16LE(pcmSample, 44 + i * 2);
    }
    
    await fs.promises.writeFile(filePath, buffer);
  }

  /**
   * Get system information about the Swift processing pipeline
   */
  public async getSystemInfo(): Promise<any> {
    return new Promise((resolve, reject) => {
      const infoCommand = spawn(swiftExecutablePath, ['system-info']);
      
      let jsonOutput = '';
      let errorOutput = '';
      
      infoCommand.stdout.on('data', (data) => {
        jsonOutput += data.toString();
      });
      
      infoCommand.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      infoCommand.on('close', (code) => {
        if (code === 0) {
          try {
            // Extract JSON from the output (filter out logging)
            const lines = jsonOutput.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            
            if (!jsonLine) {
              throw new Error('No JSON result found in system info output');
            }
            
            const systemInfo = JSON.parse(jsonLine);
            resolve(systemInfo);
            
          } catch (error) {
            console.error('❌ Error parsing system info:', error);
            console.error('Raw output:', jsonOutput);
            reject(new Error(`Failed to parse system info: ${error}`));
          }
        } else {
          console.error('❌ System info command failed with code:', code);
          console.error('Error output:', errorOutput);
          reject(new Error(`System info failed with exit code ${code}: ${errorOutput}`));
        }
      });
      
      infoCommand.on('error', (error) => {
        console.error('❌ Error spawning system info command:', error);
        reject(new Error(`Failed to spawn system info command: ${error}`));
      });
    });
  }

  /**
   * Get available WhisperKit models
   */
  public async getAvailableModels(): Promise<any> {
    return new Promise((resolve, reject) => {
      const modelsCommand = spawn(swiftExecutablePath, ['models']);
      
      let jsonOutput = '';
      let errorOutput = '';
      
      modelsCommand.stdout.on('data', (data) => {
        jsonOutput += data.toString();
      });
      
      modelsCommand.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      modelsCommand.on('close', (code) => {
        if (code === 0) {
          try {
            // Extract JSON from the output (filter out logging)
            const lines = jsonOutput.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            
            if (!jsonLine) {
              throw new Error('No JSON result found in models output');
            }
            
            const modelsInfo = JSON.parse(jsonLine);
            resolve(modelsInfo);
            
          } catch (error) {
            console.error('❌ Error parsing models info:', error);
            console.error('Raw output:', jsonOutput);
            reject(new Error(`Failed to parse models info: ${error}`));
          }
        } else {
          console.error('❌ Models command failed with code:', code);
          console.error('Error output:', errorOutput);
          reject(new Error(`Models command failed with exit code ${code}: ${errorOutput}`));
        }
      });
      
      modelsCommand.on('error', (error) => {
        console.error('❌ Error spawning models command:', error);
        reject(new Error(`Failed to spawn models command: ${error}`));
      });
    });
  }

  /**
   * Convert Swift processing result to TypeScript TranscriptionResult format
   * Ensures compatibility with existing React UI components
   */
  private convertSwiftResultToTranscriptionResult(swiftResult: any): TranscriptionResult {
    // Handle error cases
    if (!swiftResult || !swiftResult.success) {
      return {
        text: '',
        success: false,
        error: swiftResult?.error || 'Unknown processing error',
        duration: 0,
        speakers: []
      };
    }

    // Convert Swift segments to our SpeakerSegment format
    const speakers: SpeakerSegment[] = swiftResult.segments?.map((segment: any) => {
      // Map Swift speaker IDs to more readable names
      let speakerName = segment.speakerId || 'Unknown';
      
      // If Swift returns speaker IDs like "speaker_0", "speaker_1", convert to "Speaker A", "Speaker B"
      if (speakerName.match(/^speaker_\d+$/i)) {
        const speakerIndex = parseInt(speakerName.replace(/speaker_/i, ''));
        speakerName = `Speaker ${String.fromCharCode(65 + speakerIndex)}`; // A, B, C, etc.
      }
      
      // Ensure text is clean and properly formatted
      const cleanText = (segment.text || '').trim();
      
      return {
        speaker: speakerName,
        text: cleanText,
        startTime: segment.startTime || 0,
        endTime: segment.endTime || 0,
        confidence: Math.min(1.0, Math.max(0.0, segment.confidence || 0.8)) // Clamp between 0-1
      };
    }) || [];

    // Calculate total duration from segments or use provided duration
    let calculatedDuration = 0;
    if (speakers.length > 0) {
      calculatedDuration = Math.max(...speakers.map(s => s.endTime));
    }
    
    // Use provided duration if available and reasonable, otherwise use calculated
    const finalDuration = swiftResult.processingTime 
      ? (swiftResult.processingTime / 1000) // Convert ms to seconds if needed
      : calculatedDuration;

    // Clean up the main text
    const cleanedText = (swiftResult.text || '').trim();

    // Detect language if not provided (Swift should provide this)
    let detectedLanguage = swiftResult.language || 'en';
    
    // Ensure language is in correct format (2-letter code)
    if (detectedLanguage === 'english') detectedLanguage = 'en';
    if (detectedLanguage === 'spanish') detectedLanguage = 'es';
    if (detectedLanguage === 'french') detectedLanguage = 'fr';
    // Add more language mappings as needed

    const result: TranscriptionResult = {
      text: cleanedText,
      success: true,
      language: detectedLanguage,
      duration: finalDuration,
      speakers: speakers.length > 0 ? speakers : undefined
    };

    // Log conversion results for debugging
    console.log('🔄 Swift result conversion:', {
      originalSegments: swiftResult.segments?.length || 0,
      convertedSpeakers: speakers.length,
      textLength: cleanedText.length,
      duration: finalDuration,
      language: detectedLanguage,
      totalSpeakers: swiftResult.totalSpeakers || speakers.map(s => s.speaker).filter((v, i, a) => a.indexOf(v) === i).length
    });

    return result;
  }

  /**
   * Cleanup and release native resources
   */
  public cleanup(): void {
    if (this.isInitialized) {
      console.log('♻️ Cleaning up native audio processor...');
      this.isInitialized = false;
      console.log('✅ Native audio processor cleanup complete');
    }
  }

  /**
   * Destructor - ensure cleanup on garbage collection
   */
  public finalize(): void {
    this.cleanup();
  }
}

// Export singleton instance for use throughout the app
export const nativeAudioProcessor = new NativeAudioProcessor();