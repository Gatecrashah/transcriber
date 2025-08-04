import { TranscriptionResult } from '../types/transcription';
import type { SpeakerSegment } from '../types/transcription';
import { SwiftNativeBridge as SwiftProcessRunner } from '../utils/swiftNativeBridge';
import { mapLanguageCode } from '../constants/languageMappings';

// Swift processing result interfaces
interface SwiftSegment {
  speakerId?: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

interface SwiftProcessingResult {
  success: boolean;
  text?: string;
  duration?: number;
  language?: string;
  segments?: SwiftSegment[];
  error?: string;
  processingTime?: number;
  totalSpeakers?: number;
}


/**
 * Native Audio Processor - TypeScript wrapper for Swift audio processing pipeline
 * 
 * This class provides a clean TypeScript interface to the Swift-native WhisperKit + FluidAudio
 * processing system for high-performance audio transcription.
 * 
 * Uses child process communication instead of FFI for better Node.js compatibility
 */
export class NativeAudioProcessor {
  private isInitialized = false;

  constructor() {
    // Native Swift audio processor ready
  }

  /**
   * Initialize the Swift audio processing system
   * This must be called before any processing operations
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      const result = await SwiftProcessRunner.runCommand({
        command: ['init'],
        successPattern: 'SUCCESS: SwiftAudioBridge initialized'
      });

      this.isInitialized = result.success;
      if (result.success) {
        console.log('✅ Native audio processor initialized successfully');
      } else {
        console.warn('⚠️ Native audio processor initialization failed:', result.error);
      }
      return result.success;
    } catch (error) {
      console.error('❌ Error initializing native audio processor:', error);
      this.isInitialized = false;
      return false;
    }
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

    const result = await SwiftProcessRunner.runCommand({
      command: ['process', filePath],
      parseResult: (output) => this.convertSwiftResultToTranscriptionResult(JSON.parse(output))
    });

    if (!result.success) {
      throw new Error(result.error || 'Audio processing failed');
    }

    return result.data;
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
  public async processAudioBuffer(audioData: Float32Array, sampleRate: number, channels: number = 1): Promise<TranscriptionResult> {
    if (!this.isReady()) {
      throw new Error('Native audio processor not initialized or not ready');
    }

    // DIRECT NATIVE PROCESSING - No temporary files!
    const result = await SwiftProcessRunner.processAudioBuffer(audioData, sampleRate, channels);
    
    if (!result.success) {
      throw new Error(result.error || 'Native audio buffer processing failed');
    }

    return this.convertSwiftResultToTranscriptionResult(result.data);
  }


  /**
   * Get system information about the Swift processing pipeline
   */
  public async getSystemInfo(): Promise<{
    success: boolean;
    whisperVersion?: string;
    fluidAudioVersion?: string;
    metalSupport?: boolean;
    availableModels?: string[];
    error?: string;
  }> {
    const result = await SwiftProcessRunner.runCommand({
      command: ['system-info']
    });

    return result.success ? result.data : { success: false, error: result.error };
  }

  /**
   * Get available WhisperKit models
   */
  public async getAvailableModels(): Promise<{
    success: boolean;
    models?: Array<{
      name: string;
      size: string;
      description: string;
    }>;
    error?: string;
  }> {
    const result = await SwiftProcessRunner.runCommand({
      command: ['models']
    });

    return result.success ? result.data : { success: false, error: result.error };
  }


  /**
   * Convert Swift processing result to TypeScript TranscriptionResult format
   * Ensures compatibility with existing React UI components
   */
  private convertSwiftResultToTranscriptionResult(swiftResult: SwiftProcessingResult): TranscriptionResult {
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

    // Optionally log segments for debugging
    // Uncomment the following to debug speaker issues:
    // if (swiftResult.segments && swiftResult.segments.length > 0) {
    //   const uniqueSpeakerIds = [...new Set(swiftResult.segments.map((s: SwiftSegment) => s.speakerId))];
    //   console.log('🔍 Unique Swift speaker IDs:', uniqueSpeakerIds);
    // }
    
    // Convert Swift segments to our SpeakerSegment format
    const rawSpeakers = swiftResult.segments?.map((segment: SwiftSegment) => {
      // Map Swift speaker IDs to more readable names
      let speakerName = segment.speakerId || 'Unknown';
      
      // If Swift returns speaker IDs like "speaker_0", "speaker_1", convert to "Speaker A", "Speaker B"
      if (speakerName.match(/^speaker_\d+$/i)) {
        const speakerIndex = parseInt(speakerName.replace(/speaker_/i, ''));
        speakerName = `Speaker ${String.fromCharCode(65 + speakerIndex)}`; // A, B, C, etc.
      }
      // Keep "Unknown" as is - it's clearer than trying to number unknown speakers
      
      // Text will be cleaned in the frontend now
      const cleanText = (segment.text || '').trim();
      
      return {
        speaker: speakerName,
        text: cleanText,
        startTime: segment.startTime || 0,
        endTime: segment.endTime || 0,
        confidence: Math.min(1.0, Math.max(0.0, segment.confidence || 0.8)) // Clamp between 0-1
      };
    }) || [];
    
    // Filter out segments with empty text after cleaning
    const speakers = rawSpeakers.filter(segment => segment.text && segment.text.length > 0);

    // Calculate total duration from segments or use provided duration
    let calculatedDuration = 0;
    if (speakers.length > 0) {
      calculatedDuration = Math.max(...speakers.map(s => s.endTime));
    }
    
    // Use provided duration if available and reasonable, otherwise use calculated
    const finalDuration = swiftResult.processingTime 
      ? (swiftResult.processingTime / 1000) // Convert ms to seconds if needed
      : calculatedDuration;

    // Text will be cleaned in the frontend now
    const cleanedText = (swiftResult.text || '').trim();

    // Map detected language to standard 2-letter code
    const detectedLanguage = mapLanguageCode(swiftResult.language || 'en');

    const result: TranscriptionResult = {
      text: cleanedText,
      success: true,
      language: detectedLanguage,
      duration: finalDuration,
      speakers: speakers.length > 0 ? speakers : undefined
    };


    return result;
  }

  /**
   * Cleanup and release native resources
   */
  public cleanup(): void {
    this.isInitialized = false;
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