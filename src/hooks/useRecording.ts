import { useState, useEffect, useCallback } from 'react';
import { convertWebMToWav } from '../utils/audioConversion';
import { getAudioLevel } from '../utils/audioLevel';
import { processAudioDirectly } from '../utils/audioFileManager';
import type { TranscriptionResult, SpeakerSegment } from '../types/transcription';

// Extend Window interface for dual audio capture
declare global {
  interface Window {
    __audioCapture?: {
      isDualStream?: boolean;
      stop?: () => void;
      getSystemChunks?: () => Blob[];
      getMicrophoneChunks?: () => Blob[];
      systemAnalyser?: AnalyserNode;
      microphoneAnalyser?: AnalyserNode;
      audioContext?: AudioContext;
    };
  }
}

interface RecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  audioLevel: number;
  systemAudioLevel: number;
  microphoneAudioLevel: number;
  systemAudioActive: boolean;
  microphoneAudioActive: boolean;
  error: string | null;
}

interface RecordingResult {
  success: boolean;
  audioBlob?: Blob;
  systemAudioBlob?: Blob;
  microphoneAudioBlob?: Blob;
  error?: string;
}

interface UseRecordingProps {
  onTranscriptionComplete?: (
    text: string,
    speakers?: SpeakerSegment[],
    model?: string
  ) => void;
}

// Helper function to clean WhisperKit tokens from text
const cleanWhisperKitTokens = (text: string): string => {
  return text
    .replace(/<\|startoftranscript\|>/g, '')
    .replace(/<\|endoftext\|>/g, '')
    .replace(/<\|transcribe\|>/g, '')
    .replace(/<\|translate\|>/g, '')
    .replace(/<\|notimestamps\|>/g, '')
    .replace(/<\|[a-z]{2}\|>/g, '') // Language codes
    .replace(/<\|\d+\.\d+\|>/g, '') // Timestamps
    .replace(/\[BLANK_AUDIO\]/g, '')
    .replace(/\[\s*Silence\s*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const useRecording = ({ onTranscriptionComplete }: UseRecordingProps = {}) => {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isProcessing: false,
    audioLevel: 0,
    systemAudioLevel: 0,
    microphoneAudioLevel: 0,
    systemAudioActive: false,
    microphoneAudioActive: false,
    error: null,
  });

  const [levelUpdateInterval, setLevelUpdateInterval] = useState<NodeJS.Timeout | null>(null);

  // Audio level monitoring
  const updateAudioLevel = useCallback(() => {
    if (state.isRecording && window.__audioCapture) {
      const systemLevel = window.__audioCapture.systemAnalyser
        ? getAudioLevel(window.__audioCapture.systemAnalyser)
        : 0;
      const microphoneLevel = window.__audioCapture.microphoneAnalyser
        ? getAudioLevel(window.__audioCapture.microphoneAnalyser)
        : 0;

      setState(prev => ({
        ...prev,
        systemAudioLevel: systemLevel,
        microphoneAudioLevel: microphoneLevel,
        audioLevel: Math.max(systemLevel, microphoneLevel)
      }));
    }
  }, [state.isRecording]);

  // Audio level monitoring effect
  useEffect(() => {
    if (state.isRecording) {
      const interval = setInterval(updateAudioLevel, 100);
      setLevelUpdateInterval(interval);
    } else {
      if (levelUpdateInterval) {
        clearInterval(levelUpdateInterval);
        setLevelUpdateInterval(null);
      }
      setState(prev => ({
        ...prev,
        audioLevel: 0,
        systemAudioLevel: 0,
        microphoneAudioLevel: 0
      }));
    }

    return () => {
      if (levelUpdateInterval) {
        clearInterval(levelUpdateInterval);
      }
    };
  }, [state.isRecording, updateAudioLevel]);

  // Process dual-stream transcription
  const processDualStreamTranscription = useCallback(async (
    systemAudioBlob?: Blob,
    microphoneAudioBlob?: Blob
  ): Promise<void> => {
    console.log('🎙️ Processing dual-stream transcription...');
    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      let systemTranscription: TranscriptionResult | undefined;
      let micTranscription: TranscriptionResult | undefined;

      // Process system audio
      if (systemAudioBlob) {
        const systemResult = await processAudioDirectly(systemAudioBlob);
        if (systemResult.transcription) {
          systemTranscription = systemResult.transcription;
        }
      }

      // Process microphone audio
      if (microphoneAudioBlob) {
        const micResult = await processAudioDirectly(microphoneAudioBlob);
        if (micResult.transcription) {
          micTranscription = micResult.transcription;
        }
      }

      // Combine results
      const transcriptionResult: TranscriptionResult = {
        success: !!(systemTranscription || micTranscription),
        text: '',
        segments: []
      };

      // Merge segments from both streams
      const systemSegments = systemTranscription?.speakers || systemTranscription?.segments;
      const micSegments = micTranscription?.speakers || micTranscription?.segments;

      if (systemSegments) {
        transcriptionResult.segments!.push(...systemSegments.map(seg => ({
          ...seg,
          text: cleanWhisperKitTokens(seg.text),
          speaker: seg.speaker || 'Unknown Speaker'
        })));
      }

      if (micSegments) {
        transcriptionResult.segments!.push(...micSegments.map(seg => ({
          ...seg,
          text: cleanWhisperKitTokens(seg.text),
          speaker: 'You'
        })));
      }

      // Sort and deduplicate segments
      if (transcriptionResult.segments!.length > 0) {
        transcriptionResult.segments!.sort((a, b) => a.startTime - b.startTime);

        // Remove duplicates
        const uniqueSegments: SpeakerSegment[] = [];
        const timeThreshold = 2.0;

        for (const segment of transcriptionResult.segments!) {
          if (!segment.text || segment.text.trim().length === 0) continue;

          const isDuplicate = uniqueSegments.some(existing => {
            const timeDiff = Math.abs(existing.startTime - segment.startTime);
            const textSimilarity = existing.text.toLowerCase().trim() === 
                                  segment.text.toLowerCase().trim();
            return timeDiff < timeThreshold && textSimilarity;
          });

          if (!isDuplicate) {
            uniqueSegments.push(segment);
          }
        }

        transcriptionResult.segments = uniqueSegments;
        transcriptionResult.text = uniqueSegments.map(s => s.text).join(' ');
      }

      // Notify completion
      if (transcriptionResult.success && transcriptionResult.text.trim() && onTranscriptionComplete) {
        const speakers = transcriptionResult.segments?.map(seg => ({
          speaker: seg.speaker || 'Unknown',
          text: seg.text,
          startTime: seg.startTime,
          endTime: seg.endTime
        }));
        onTranscriptionComplete(transcriptionResult.text, speakers, 'base');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Transcription failed'
      }));
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [onTranscriptionComplete]);

  // Process single-stream transcription (fallback)
  const processSingleStreamTranscription = useCallback(async (audioBlob: Blob): Promise<void> => {
    console.log('🚀 Processing single-stream transcription...');
    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      const result = await processAudioDirectly(audioBlob);

      if (result.transcription?.success && result.transcription.text.trim() && onTranscriptionComplete) {
        const rawText = result.transcription.text.trim();
        onTranscriptionComplete(rawText, undefined, 'base');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Transcription failed'
      }));
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [onTranscriptionComplete]);

  // Stop recording and process transcription
  const stopRecording = useCallback(async (): Promise<RecordingResult> => {
    try {
      const audioCapture = window.__audioCapture;

      if (audioCapture) {
        // Stop recording
        if (audioCapture.stop) {
          audioCapture.stop();
        }

        // Wait for final data
        await new Promise(resolve => setTimeout(resolve, 500));

        // Handle dual stream recording
        if (audioCapture.isDualStream) {
          const systemChunks = audioCapture.getSystemChunks ? audioCapture.getSystemChunks() : [];
          const microphoneChunks = audioCapture.getMicrophoneChunks ? audioCapture.getMicrophoneChunks() : [];

          let systemAudioBlob: Blob | undefined;
          let microphoneAudioBlob: Blob | undefined;
          let combinedAudioBlob: Blob | undefined;

          // Process system audio
          if (systemChunks.length > 0) {
            const systemBlob = new Blob(systemChunks, { type: 'audio/webm' });
            systemAudioBlob = await convertWebMToWav(systemBlob);
          }

          // Process microphone audio
          if (microphoneChunks.length > 0) {
            const microphoneBlob = new Blob(microphoneChunks, { type: 'audio/webm' });
            microphoneAudioBlob = await convertWebMToWav(microphoneBlob);
          }

          // Create combined audio
          if (systemChunks.length > 0 || microphoneChunks.length > 0) {
            const combinedChunks = [...systemChunks, ...microphoneChunks];
            const combinedBlob = new Blob(combinedChunks, { type: 'audio/webm' });
            combinedAudioBlob = await convertWebMToWav(combinedBlob);
          }

          // Clean up
          delete window.__audioCapture;
          setState(prev => ({
            ...prev,
            isRecording: false,
            audioLevel: 0,
            systemAudioLevel: 0,
            microphoneAudioLevel: 0,
            systemAudioActive: false,
            microphoneAudioActive: false
          }));

          // Process transcription automatically
          if (systemAudioBlob || microphoneAudioBlob) {
            await processDualStreamTranscription(systemAudioBlob, microphoneAudioBlob);
          } else if (combinedAudioBlob) {
            await processSingleStreamTranscription(combinedAudioBlob);
          }

          return {
            success: true,
            audioBlob: combinedAudioBlob,
            systemAudioBlob,
            microphoneAudioBlob
          };
        }
      }

      // Fallback cleanup
      setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
      return { success: true };

    } catch (error) {
      setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [processDualStreamTranscription, processSingleStreamTranscription]);

  // Start dual audio capture
  const startRecording = useCallback(async (): Promise<RecordingResult> => {
    try {
      setState(prev => ({ ...prev, error: null }));

      let systemAudioStream: MediaStream | null = null;
      let microphoneStream: MediaStream | null = null;

      // Get system audio
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: false
        });

        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();

        if (audioTracks.length > 0) {
          systemAudioStream = new MediaStream(audioTracks);
          setState(prev => ({ ...prev, systemAudioActive: true }));
        }

        videoTracks.forEach(track => track.stop());

      } catch {
        // Try fallback desktop capturer
        try {
          if (window.electronAPI?.audio?.getDesktopSources) {
            const sourcesResult = await window.electronAPI.audio.getDesktopSources();
            if (sourcesResult.success && sourcesResult.sources) {
              const selectedSource = sourcesResult.sources.find(source =>
                source.name.includes('Screen') || source.name.includes('Desktop')
              ) || sourcesResult.sources[0];

              if (selectedSource) {
                const desktopStream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                    mandatory: {
                      chromeMediaSource: 'desktop',
                      chromeMediaSourceId: selectedSource.id,
                      echoCancellation: false,
                      noiseSuppression: false,
                      autoGainControl: false
                    }
                  } as MediaTrackConstraints,
                  video: false
                });

                systemAudioStream = desktopStream;
                setState(prev => ({ ...prev, systemAudioActive: true }));
              }
            }
          }
        } catch {
          // Continue without system audio
        }
      }

      // Get microphone stream
      try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        setState(prev => ({ ...prev, microphoneAudioActive: true }));
      } catch {
        // Continue without microphone
      }

      // Check if we got at least one stream
      if (!systemAudioStream && !microphoneStream) {
        throw new Error('Failed to capture any audio stream');
      }

      // Set up recorders
      const systemAudioChunks: Blob[] = [];
      const microphoneAudioChunks: Blob[] = [];
      let isRecording = true;

      let systemRecorder: MediaRecorder | null = null;
      let microphoneRecorder: MediaRecorder | null = null;

      // Set up Web Audio API for monitoring
      const audioContext = new AudioContext();
      let systemAnalyser: AnalyserNode | undefined;
      let microphoneAnalyser: AnalyserNode | undefined;

      // Setup system audio recorder
      if (systemAudioStream) {
        try {
          const systemSource = audioContext.createMediaStreamSource(systemAudioStream);
          systemAnalyser = audioContext.createAnalyser();
          systemAnalyser.fftSize = 256;
          systemAnalyser.smoothingTimeConstant = 0.8;
          systemSource.connect(systemAnalyser);

          systemRecorder = new MediaRecorder(systemAudioStream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 128000
          });

          systemRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && isRecording) {
              systemAudioChunks.push(event.data);
            }
          };

          systemRecorder.start(1000);
        } catch (error) {
          console.error('Failed to start system audio recorder:', error);
        }
      }

      // Setup microphone recorder
      if (microphoneStream) {
        try {
          const microphoneSource = audioContext.createMediaStreamSource(microphoneStream);
          microphoneAnalyser = audioContext.createAnalyser();
          microphoneAnalyser.fftSize = 256;
          microphoneAnalyser.smoothingTimeConstant = 0.8;
          microphoneSource.connect(microphoneAnalyser);

          microphoneRecorder = new MediaRecorder(microphoneStream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 128000
          });

          microphoneRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && isRecording) {
              microphoneAudioChunks.push(event.data);
            }
          };

          microphoneRecorder.start(1000);
        } catch (error) {
          console.error('Failed to start microphone recorder:', error);
        }
      }

      // Store recording data globally
      window.__audioCapture = {
        isDualStream: true,
        audioContext,
        systemAnalyser,
        microphoneAnalyser,
        stop: () => {
          isRecording = false;

          if (systemRecorder && systemRecorder.state === 'recording') {
            systemRecorder.stop();
          }
          if (microphoneRecorder && microphoneRecorder.state === 'recording') {
            microphoneRecorder.stop();
          }

          // Stop all tracks
          if (systemAudioStream) {
            systemAudioStream.getTracks().forEach(track => track.stop());
          }
          if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
          }

          // Clean up audio context
          if (audioContext.state !== 'closed') {
            audioContext.close();
          }
        },
        getSystemChunks: () => systemAudioChunks,
        getMicrophoneChunks: () => microphoneAudioChunks
      };

      setState(prev => ({
        ...prev,
        isRecording: true,
        systemAudioActive: !!systemAudioStream,
        microphoneAudioActive: !!microphoneStream
      }));

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        error: `Audio capture failed: ${errorMessage}`,
        systemAudioActive: false,
        microphoneAudioActive: false
      }));
      return { success: false, error: errorMessage };
    }
  }, []);

  // Toggle recording
  const toggleRecording = useCallback(async () => {
    if (state.isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [state.isRecording, startRecording, stopRecording]);

  return {
    // State
    isRecording: state.isRecording,
    isProcessing: state.isProcessing,
    audioLevel: state.audioLevel,
    systemAudioLevel: state.systemAudioLevel,
    microphoneAudioLevel: state.microphoneAudioLevel,
    systemAudioActive: state.systemAudioActive,
    microphoneAudioActive: state.microphoneAudioActive,
    error: state.error,
    // Actions
    startRecording,
    stopRecording,
    toggleRecording,
  };
};