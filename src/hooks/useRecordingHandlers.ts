import { useCallback } from 'react';
import type { TranscriptionResult, TranscriptionOptions } from '../types/transcription';
import { processAudioDirectly } from '../utils/audioFileManager';

interface RecordingResult {
  success: boolean;
  systemAudioBlob?: Blob;
  microphoneAudioBlob?: Blob;
  audioBlob?: Blob;
  error?: string;
}

interface UseRecordingHandlersProps {
  isRecording: boolean;
  stopRecording: () => Promise<RecordingResult>;
  startDualAudioCapture: () => Promise<{ success: boolean }>;
  addTranscriptionToNote: (text: string, speakers?: Array<{ speaker: string; text: string; startTime: number; endTime: number; }>, model?: string) => boolean;
}

// Helper function to clean WhisperKit tokens from text
const cleanWhisperKitTokens = (text: string): string => {
  let cleaned = text
    .replace(/<\|startoftranscript\|>/g, '')
    .replace(/<\|endoftext\|>/g, '')
    .replace(/<\|transcribe\|>/g, '')
    .replace(/<\|translate\|>/g, '')
    .replace(/<\|notimestamps\|>/g, '')
    .replace(/<\|[a-z]{2}\|>/g, '') // Language codes like <|en|>
    .replace(/<\|\d+\.\d+\|>/g, '') // Timestamps like <|0.00|>
    .replace(/\[BLANK_AUDIO\]/g, '') // Remove blank audio markers
    .replace(/\[\s*Silence\s*\]/gi, '') // Remove silence markers
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return cleaned;
};

export const useRecordingHandlers = ({
  isRecording,
  stopRecording,
  startDualAudioCapture,
  addTranscriptionToNote
}: UseRecordingHandlersProps) => {

  // Handle dual-stream transcription processing with ZERO FILE I/O!
  const processDualStreamTranscription = useCallback(async (
    systemAudioBlob?: Blob,
    microphoneAudioBlob?: Blob
  ) => {
    console.log('🎙️ Using DIRECT dual-stream transcription - NO FILES!');
    
    try {
      // Process system audio directly
      let systemTranscription: TranscriptionResult | undefined;
      if (systemAudioBlob) {
        console.log('🚀 Processing system audio directly...');
        const systemResult = await processAudioDirectly(systemAudioBlob);
        console.log('📊 System audio result:', systemResult);
        if (systemResult.transcription) {
          systemTranscription = systemResult.transcription;
          console.log('✅ System transcription:', systemTranscription.text?.substring(0, 100));
        }
      }
      
      // Process microphone audio directly
      let micTranscription: TranscriptionResult | undefined;
      if (microphoneAudioBlob) {
        console.log('🚀 Processing microphone audio directly...');
        const micResult = await processAudioDirectly(microphoneAudioBlob);
        if (micResult.transcription) {
          micTranscription = micResult.transcription;
          console.log('✅ Microphone transcription:', micTranscription.text?.substring(0, 100));
        }
      }
      
      // Combine results
      const transcriptionResult: TranscriptionResult = {
        success: !!(systemTranscription || micTranscription),
        text: '',
        segments: []
      };
      
      // Check for both 'speakers' (new format) and 'segments' (legacy format)
      const systemSegments = systemTranscription?.speakers || systemTranscription?.segments;
      const micSegments = micTranscription?.speakers || micTranscription?.segments;
      
      if (systemSegments) {
        transcriptionResult.segments!.push(...systemSegments.map(seg => {
          // For system audio, preserve the diarization speaker labels
          // Don't override with "Meeting Participants" - that's causing confusion
          const speaker = seg.speaker || 'Unknown Speaker';
          
          return {
            ...seg,
            text: cleanWhisperKitTokens(seg.text),
            speaker: speaker
          };
        }));
      }
      
      if (micSegments) {
        transcriptionResult.segments!.push(...micSegments.map(seg => ({
          ...seg,
          text: cleanWhisperKitTokens(seg.text),
          speaker: 'You' // Microphone is always "You"
        })));
      }
      
      // Sort segments by time
      transcriptionResult.segments!.sort((a, b) => a.startTime - b.startTime);
      
      // Filter out empty segments and remove duplicates
      const uniqueSegments: typeof transcriptionResult.segments = [];
      const timeThreshold = 2.0; // 2 seconds
      
      for (const segment of transcriptionResult.segments!) {
        // Skip empty segments after cleaning
        if (!segment.text || segment.text.trim().length === 0) {
          console.log('🚫 Skipping empty segment after cleaning');
          continue;
        }
        
        const isDuplicate = uniqueSegments.some(existing => {
          const timeDiff = Math.abs(existing.startTime - segment.startTime);
          const textSimilarity = existing.text.toLowerCase().trim() === segment.text.toLowerCase().trim();
          return timeDiff < timeThreshold && textSimilarity;
        });
        
        if (!isDuplicate) {
          uniqueSegments.push(segment);
        } else {
          console.log('🔄 Skipping duplicate segment:', segment.text.substring(0, 50));
        }
      }
      
      transcriptionResult.segments = uniqueSegments;
      transcriptionResult.text = uniqueSegments.map(s => s.text).join(' ');
      
      console.log('🗣️ Dual-stream transcription result:', {
        success: transcriptionResult.success,
        textLength: transcriptionResult.text.length,
        segments: transcriptionResult.segments?.length,
        textPreview: transcriptionResult.text.substring(0, 100)
      });
      
      
      if (transcriptionResult.success && transcriptionResult.text.trim()) {
        console.log('🗣️ Dual-stream transcription completed successfully');
        
        // Use structured speaker data if available - segments ARE the speaker data
        if (transcriptionResult.segments && transcriptionResult.segments.length > 0) {
          console.log(`✅ Using structured speaker data: ${transcriptionResult.segments.length} segments`);
          
          // Convert segments to the expected format
          const speakers = transcriptionResult.segments.map(seg => ({
            speaker: seg.speaker || 'Unknown',
            text: seg.text,
            startTime: seg.startTime,
            endTime: seg.endTime
          }));
          
          // Add transcription to current note with structured speaker segments
          addTranscriptionToNote(transcriptionResult.text, speakers, 'base');
        } else {
          // Fallback: add without speaker data
          console.log('⚠️ No speaker segments available, adding raw text');
          addTranscriptionToNote(transcriptionResult.text, undefined, 'base');
        }
      } else {
        console.error('❌ Dual-stream transcription failed:', transcriptionResult);
      }
    } catch (error) {
      console.error('❌ Dual-stream transcription error:', error);
    }
  }, [addTranscriptionToNote]);

  // Handle single-stream fallback transcription with ZERO FILE I/O!
  const processSingleStreamTranscription = useCallback(async (audioBlob: Blob) => {
    console.log('🚀 Direct single-stream transcription - NO FILES!');
    
    try {
      const result = await processAudioDirectly(audioBlob);
      
      if (result.transcription?.success && result.transcription.text.trim()) {
        const rawText = result.transcription.text.trim();
        
        // Add transcription to current note (no speaker segments for single stream)
        addTranscriptionToNote(rawText, undefined, 'base');
        
        console.log(`⚡ Direct transcription completed!`);
        console.log(`   Duration: ${result.audioMetadata?.duration?.toFixed(2)}s`);
        console.log(`   Sample rate: ${result.audioMetadata?.sampleRate}Hz`);
      }
    } catch (error) {
      console.error('❌ Single-stream transcription error:', error);
    }
  }, [addTranscriptionToNote]);

  // Handle stopping recording and processing transcription
  const handleStopRecording = useCallback(async () => {
    const result = await stopRecording();
    console.log('🎤 Stop recording result:', result);
    
    if (result.success) {
      console.log('🔄 Starting transcription for dual streams');
      
      // Check if we have dual-stream recording results
      if (result.systemAudioBlob || result.microphoneAudioBlob) {
        await processDualStreamTranscription(result.systemAudioBlob, result.microphoneAudioBlob);
      } 
      // Fallback to single-stream transcription
      else if (result.audioBlob) {
        await processSingleStreamTranscription(result.audioBlob);
      } else {
        console.error('❌ No audio data available for transcription');
      }
    } else {
      console.error('❌ Recording failed:', result);
    }
  }, [stopRecording, processDualStreamTranscription, processSingleStreamTranscription]);

  // Handle starting recording
  const handleStartRecording = useCallback(async () => {
    // Use dual audio capture for both system audio AND microphone simultaneously
    const recordingResult = await startDualAudioCapture();
    
    // Start realtime transcription if recording was successful
    if (recordingResult.success) {
      console.log('✅ Recording started successfully');
    }
  }, [startDualAudioCapture]);

  // Main toggle handler - simplified orchestrator
  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      await handleStopRecording();
    } else {
      await handleStartRecording();
    }
  }, [isRecording, handleStopRecording, handleStartRecording]);

  return {
    handleToggleRecording,
    handleStartRecording,
    handleStopRecording,
    processDualStreamTranscription,
    processSingleStreamTranscription
  };
};