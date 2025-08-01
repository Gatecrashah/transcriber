import { useState, useEffect, useCallback } from 'react';
import { convertWebMToWav } from '../utils/audioConversion';
import { getAudioLevel } from '../utils/audioLevel';
import { saveAudioFile } from '../utils/audioFileManager';

// Extend Window interface for dual audio capture object
declare global {
  interface Window {
    __audioCapture?: {
      isDualStream?: boolean;
      stop?: () => void;
      getSystemChunks?: () => Blob[];
      getMicrophoneChunks?: () => Blob[];
      // Audio level monitoring
      systemAnalyser?: AnalyserNode;
      microphoneAnalyser?: AnalyserNode;
      audioContext?: AudioContext;
    };
  }
}

interface AudioRecordingState {
  isRecording: boolean;
  audioLevel: number;
  systemAudioLevel: number;
  microphoneAudioLevel: number;
  systemAudioActive: boolean;
  microphoneAudioActive: boolean;
  error: string | null;
}

interface AudioRecordingResult {
  success: boolean;
  audioPath?: string;
  systemAudioPath?: string;
  microphoneAudioPath?: string;
  error?: string;
  message?: string;
}


export const useAudioRecording = () => {
  const [state, setState] = useState<AudioRecordingState>({
    isRecording: false,
    audioLevel: 0,
    systemAudioLevel: 0,
    microphoneAudioLevel: 0,
    systemAudioActive: false,
    microphoneAudioActive: false,
    error: null,
  });

  const [levelUpdateInterval, setLevelUpdateInterval] = useState<NodeJS.Timeout | null>(null);


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


  const stopRecording = useCallback(async (): Promise<AudioRecordingResult> => {
    try {
      // Check if we have browser-based recording active
      const audioCapture = window.__audioCapture;
      
      if (audioCapture) {
        // Stop the recording
        if (audioCapture.stop) {
          audioCapture.stop();
        }
        
        // Wait for final data
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Handle dual stream recording
        if (audioCapture.isDualStream) {
          const systemChunks = audioCapture.getSystemChunks ? audioCapture.getSystemChunks() : [];
          const microphoneChunks = audioCapture.getMicrophoneChunks ? audioCapture.getMicrophoneChunks() : [];
          
          let systemAudioPath: string | undefined;
          let microphoneAudioPath: string | undefined;
          let combinedAudioPath: string | undefined;
          
          // Process system audio
          if (systemChunks.length > 0) {
            const systemBlob = new Blob(systemChunks, { type: 'audio/webm' });
            const systemWav = await convertWebMToWav(systemBlob);
            systemAudioPath = await saveAudioFile(systemWav);
          }
          
          // Process microphone audio
          if (microphoneChunks.length > 0) {
            const microphoneBlob = new Blob(microphoneChunks, { type: 'audio/webm' });
            const microphoneWav = await convertWebMToWav(microphoneBlob);
            microphoneAudioPath = await saveAudioFile(microphoneWav);
          }
          
          // Create combined audio for transcription
          if (systemChunks.length > 0 || microphoneChunks.length > 0) {
            const combinedChunks = [...systemChunks, ...microphoneChunks];
            const combinedBlob = new Blob(combinedChunks, { type: 'audio/webm' });
            const combinedWav = await convertWebMToWav(combinedBlob);
            combinedAudioPath = await saveAudioFile(combinedWav);
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
          
          if (systemAudioPath || microphoneAudioPath || combinedAudioPath) {
            return { 
              success: true, 
              audioPath: combinedAudioPath, // Primary path for transcription
              systemAudioPath,
              microphoneAudioPath
            };
          } else {
            return { success: false, error: 'No audio data recorded in either stream' };
          }
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
  }, []);


  const startDualAudioCapture = useCallback(async (): Promise<AudioRecordingResult> => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      let systemAudioStream: MediaStream | null = null;
      let microphoneStream: MediaStream | null = null;
      
      // Get system audio via getDisplayMedia
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
        
        // Stop video tracks immediately
        videoTracks.forEach(track => track.stop());
        
      } catch {
        // Fallback to desktop capturer approach
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
      
      // Start dual recording
      const systemAudioChunks: Blob[] = [];
      const microphoneAudioChunks: Blob[] = [];
      let isRecording = true;
      
      let systemRecorder: MediaRecorder | null = null;
      let microphoneRecorder: MediaRecorder | null = null;
      
      // Set up Web Audio API for real-time level monitoring
      const audioContext = new AudioContext();
      let systemAnalyser: AnalyserNode | undefined;
      let microphoneAnalyser: AnalyserNode | undefined;
      
      // Setup system audio recorder
      if (systemAudioStream) {
        try {
          // Set up Web Audio analysis for system audio
          const systemSource = audioContext.createMediaStreamSource(systemAudioStream);
          systemAnalyser = audioContext.createAnalyser();
          systemAnalyser.fftSize = 256;
          systemAnalyser.smoothingTimeConstant = 0.8;
          systemSource.connect(systemAnalyser);
          
          // Configure MediaRecorder for system audio
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
          // Set up Web Audio analysis for microphone
          const microphoneSource = audioContext.createMediaStreamSource(microphoneStream);
          microphoneAnalyser = audioContext.createAnalyser();
          microphoneAnalyser.fftSize = 256;
          microphoneAnalyser.smoothingTimeConstant = 0.8;
          microphoneSource.connect(microphoneAnalyser);
          
          // Configure MediaRecorder for microphone audio
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
      
      // Store dual recording data globally
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
      
      // Update state to reflect which streams are active
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
        error: `Dual audio capture failed: ${errorMessage}`,
        systemAudioActive: false,
        microphoneAudioActive: false
      }));
      return { success: false, error: errorMessage };
    }
  }, []);





  return {
    isRecording: state.isRecording,
    audioLevel: state.audioLevel,
    systemAudioLevel: state.systemAudioLevel,
    microphoneAudioLevel: state.microphoneAudioLevel,
    systemAudioActive: state.systemAudioActive,
    microphoneAudioActive: state.microphoneAudioActive,
    error: state.error,
    startDualAudioCapture,
    stopRecording,
  };
};