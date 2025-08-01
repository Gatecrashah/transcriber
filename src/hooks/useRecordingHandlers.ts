import { useCallback } from 'react';
import type { TranscriptionResult, TranscriptionOptions } from '../types/transcription';

interface RecordingResult {
  success: boolean;
  systemAudioPath?: string;
  microphoneAudioPath?: string;
  audioPath?: string;
  error?: string;
}

interface UseRecordingHandlersProps {
  isRecording: boolean;
  stopRecording: () => Promise<RecordingResult>;
  startDualAudioCapture: () => Promise<{ success: boolean }>;
  transcribeDualStreams: (
    systemAudioPath?: string,
    microphoneAudioPath?: string,
    options?: TranscriptionOptions & {
      systemSpeakerName?: string;
      microphoneSpeakerName?: string;
    }
  ) => Promise<TranscriptionResult>;
  transcribe: (audioPath: string, options?: TranscriptionOptions) => Promise<TranscriptionResult>;
  addTranscriptionToNote: (text: string, speakers?: Array<{ speaker: string; text: string; startTime: number; endTime: number; }>, model?: string) => boolean;
}

export const useRecordingHandlers = ({
  isRecording,
  stopRecording,
  startDualAudioCapture,
  transcribeDualStreams,
  transcribe,
  addTranscriptionToNote
}: UseRecordingHandlersProps) => {

  // Handle dual-stream transcription processing
  const processDualStreamTranscription = useCallback(async (
    systemAudioPath?: string,
    microphoneAudioPath?: string
  ) => {
    console.log('🎙️ Using dual-stream transcription with speaker diarization');
    
    try {
      const transcriptionResult = await transcribeDualStreams(
        systemAudioPath,
        microphoneAudioPath,
        {
          language: 'en',
          threads: 8,
          model: 'base',
          systemSpeakerName: 'Meeting Participants',
          microphoneSpeakerName: 'You',
        }
      );
      
      console.log('🗣️ Dual-stream transcription result:', transcriptionResult);
      
      if (transcriptionResult.success && transcriptionResult.text.trim()) {
        console.log('🗣️ Dual-stream transcription completed successfully');
        
        // Use structured speaker data if available
        if (transcriptionResult.speakers && transcriptionResult.speakers.length > 0) {
          console.log(`✅ Using structured speaker data: ${transcriptionResult.speakers.length} segments`);
          
          // Add transcription to current note with structured speaker segments
          addTranscriptionToNote(transcriptionResult.text, transcriptionResult.speakers, 'base');
        }
      } else {
        console.error('❌ Dual-stream transcription failed:', transcriptionResult);
      }
    } catch (error) {
      console.error('❌ Dual-stream transcription error:', error);
    }
  }, [transcribeDualStreams, addTranscriptionToNote]);

  // Handle single-stream fallback transcription
  const processSingleStreamTranscription = useCallback(async (audioPath: string) => {
    console.log('🔄 Fallback to single-stream transcription for:', audioPath);
    
    try {
      const transcriptionResult = await transcribe(audioPath, {
        language: 'en',
        threads: 8,
        model: 'base',
      });
      
      if (transcriptionResult.success && transcriptionResult.text.trim()) {
        const rawText = transcriptionResult.text.trim();
        
        // Add transcription to current note (no speaker segments for single stream)
        addTranscriptionToNote(rawText, undefined, 'base');
      }
    } catch (error) {
      console.error('❌ Single-stream transcription error:', error);
    }
  }, [transcribe, addTranscriptionToNote]);

  // Handle stopping recording and processing transcription
  const handleStopRecording = useCallback(async () => {
    const result = await stopRecording();
    console.log('🎤 Stop recording result:', result);
    
    if (result.success) {
      console.log('🔄 Starting transcription for dual streams');
      
      // Check if we have dual-stream recording results
      if (result.systemAudioPath || result.microphoneAudioPath) {
        await processDualStreamTranscription(result.systemAudioPath, result.microphoneAudioPath);
      } 
      // Fallback to single-stream transcription
      else if (result.audioPath) {
        await processSingleStreamTranscription(result.audioPath);
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