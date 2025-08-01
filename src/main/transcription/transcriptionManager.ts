// MIGRATED TO SWIFT-NATIVE PROCESSING
// This file now uses the Swift-native WhisperKit + FluidAudio pipeline
// providing high-performance native audio transcription

import { TranscriptionManager as SwiftTranscriptionManager } from './transcriptionManagerSwift';

// Re-export types and the Swift implementation
export { TranscriptionResult, SpeakerSegment } from './transcriptionManagerSwift';

// Export the Swift-native implementation as the default TranscriptionManager
export class TranscriptionManager extends SwiftTranscriptionManager {
  constructor() {
    super();
    console.log('🚀 Using Swift-native TranscriptionManager with WhisperKit + FluidAudio');
  }
}