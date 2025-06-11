import { useState, useEffect, useCallback } from 'react';

// Extend Window interface for global audio capture object
declare global {
  interface Window {
    __audioCapture?: {
      browserBasedRecording?: boolean;
      isActive?: boolean;
      stop?: () => void;
      getChunks?: () => Blob[];
    };
  }
}

interface AudioRecordingState {
  isRecording: boolean;
  audioLevel: number;
  error: string | null;
}

interface AudioRecordingResult {
  success: boolean;
  audioPath?: string;
  error?: string;
  message?: string;
}

export const useAudioRecording = () => {
  const [state, setState] = useState<AudioRecordingState>({
    isRecording: false,
    audioLevel: 0,
    error: null,
  });

  const [levelUpdateInterval, setLevelUpdateInterval] = useState<NodeJS.Timeout | null>(null);

  const updateAudioLevel = useCallback(async () => {
    // Only check Electron-based recording for audio levels
    if (state.isRecording && !window.__audioCapture?.browserBasedRecording && window.electronAPI?.audio?.getLevel) {
      try {
        const result = await window.electronAPI.audio.getLevel();
        if (result.success && result.level !== undefined) {
          setState(prev => ({ ...prev, audioLevel: result.level }));
        }
      } catch (error) {
        // Silently handle level monitoring errors to prevent IPC crashes
        console.debug('Audio level monitoring error:', error);
      }
    } else if (state.isRecording && window.__audioCapture?.browserBasedRecording) {
      // For browser-based recording, simulate audio level or use WebAudio API
      setState(prev => ({ ...prev, audioLevel: Math.random() * 50 + 25 }));
    }
  }, [state.isRecording]);

  useEffect(() => {
    // Temporarily disable audio level monitoring to debug IPC issue
    if (state.isRecording) {
      // const interval = setInterval(updateAudioLevel, 100);
      // setLevelUpdateInterval(interval);
      console.log('Recording started - audio level monitoring disabled for debugging');
    } else {
      if (levelUpdateInterval) {
        clearInterval(levelUpdateInterval);
        setLevelUpdateInterval(null);
      }
      setState(prev => ({ ...prev, audioLevel: 0 }));
    }

    return () => {
      if (levelUpdateInterval) {
        clearInterval(levelUpdateInterval);
      }
    };
  }, [state.isRecording, updateAudioLevel]);

  const startRecording = useCallback(async (): Promise<AudioRecordingResult> => {
    if (!window.electronAPI?.audio) {
      const error = 'Audio API not available';
      setState(prev => ({ ...prev, error }));
      return { success: false, error };
    }

    try {
      setState(prev => ({ ...prev, error: null }));
      
      // Check if audio system is initialized
      const initResult = await window.electronAPI.audio.initialize();
      if (!initResult.success) {
        const error = `Audio system not ready: ${initResult.error}`;
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }
      
      const result = await window.electronAPI.audio.startRecording();
      
      if (result.success) {
        setState(prev => ({ ...prev, isRecording: true }));
        return { success: true };
      } else {
        setState(prev => ({ ...prev, error: result.error || 'Failed to start recording' }));
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<AudioRecordingResult> => {
    try {
      // Check if we have browser-based recording active
      const audioCapture = window.__audioCapture;
      
      if (audioCapture) {
        console.log('🛑 Stopping system audio capture...');
        
        // Stop the recording using the simplified interface
        if (audioCapture.stop) {
          audioCapture.stop();
        }
        
        // Wait a bit for final data
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get the recorded audio chunks
        const chunks = audioCapture.getChunks ? audioCapture.getChunks() : [];
        
        if (chunks && chunks.length > 0) {
          console.log('📁 Processing', chunks.length, 'audio chunks...');
          
          // Combine all audio chunks into a single blob
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          
          // Convert to WAV format for Whisper compatibility
          const audioFile = await convertWebMToWav(audioBlob);
          
          // Save to temporary file for transcription
          const audioPath = await saveAudioFile(audioFile);
          
          console.log('✅ Audio saved to:', audioPath);
          
          // Clean up
          delete window.__audioCapture;
          
          setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
          return { success: true, audioPath };
        } else {
          console.warn('No audio data recorded');
          delete window.__audioCapture;
          setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
          return { success: false, error: 'No audio data recorded' };
        }
      }
      
      // Fall back to Electron API if no browser recording
      if (window.electronAPI?.audio) {
        const result = await window.electronAPI.audio.stopRecording();
        setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
        
        if (result.success) {
          return { success: true, audioPath: result.audioPath };
        } else {
          setState(prev => ({ ...prev, error: result.error || 'Failed to stop recording' }));
          return { success: false, error: result.error };
        }
      }
      
      // No recording method available
      setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
      return { success: true };
      
    } catch (error) {
      setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, []);

  // Helper function to convert WebM to WAV
  const convertWebMToWav = async (webmBlob: Blob): Promise<Blob> => {
    try {
      console.log('🔄 Converting WebM to WAV...');
      
      // Create audio context
      const audioContext = new AudioContext();
      
      // Convert blob to array buffer
      const arrayBuffer = await webmBlob.arrayBuffer();
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      console.log('✅ Audio decoded successfully:', {
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        duration: audioBuffer.duration
      });
      
      // Resample to 16kHz for Whisper compatibility
      const targetSampleRate = 16000;
      let finalAudioBuffer = audioBuffer;
      
      if (audioBuffer.sampleRate !== targetSampleRate) {
        console.log(`🔄 Resampling audio from ${audioBuffer.sampleRate}Hz to ${targetSampleRate}Hz for Whisper compatibility`);
        
        // Create offline context for resampling
        const offlineContext = new OfflineAudioContext(
          1, // mono
          Math.floor(audioBuffer.duration * targetSampleRate), // length in samples at target rate
          targetSampleRate
        );
        
        // Create source node
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Connect to destination
        source.connect(offlineContext.destination);
        source.start(0);
        
        // Render the resampled audio
        finalAudioBuffer = await offlineContext.startRendering();
        
        console.log('✅ Audio resampled successfully:', {
          originalSampleRate: audioBuffer.sampleRate,
          newSampleRate: finalAudioBuffer.sampleRate,
          originalDuration: audioBuffer.duration,
          newDuration: finalAudioBuffer.duration
        });
      }
      
      // Convert to WAV format
      const wavBlob = await audioBufferToWav(finalAudioBuffer);
      
      // Close audio context to free resources
      audioContext.close();
      
      console.log('✅ WebM to WAV conversion completed');
      return wavBlob;
      
    } catch (error) {
      console.error('❌ WebM to WAV conversion failed:', error);
      console.log('📁 Returning original WebM blob');
      return webmBlob;
    }
  };

  // Helper function to convert AudioBuffer to WAV Blob
  const audioBufferToWav = async (audioBuffer: AudioBuffer): Promise<Blob> => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2;
    
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    let offset = 0;
    writeString(offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + length, true); offset += 4;
    writeString(offset, 'WAVE'); offset += 4;
    writeString(offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numberOfChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numberOfChannels * 2, true); offset += 4;
    view.setUint16(offset, numberOfChannels * 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString(offset, 'data'); offset += 4;
    view.setUint32(offset, length, true); offset += 4;
    
    // Convert audio data
    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }
    
    let index = offset;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(index, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        index += 2;
      }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  };

  // Helper function to save audio file
  const saveAudioFile = async (audioBlob: Blob): Promise<string> => {
    // Convert blob to array buffer
    const arrayBuffer = await audioBlob.arrayBuffer();
    
    // If we have Electron API, use it to save the file
    if (window.electronAPI?.audio?.saveAudioFile) {
      const result = await window.electronAPI.audio.saveAudioFile(arrayBuffer);
      if (result.success) {
        return result.audioPath;
      }
    }
    
    // Fallback: create a local URL (won't work for transcription, but for debugging)
    return URL.createObjectURL(audioBlob);
  };

  const startSystemAudioCapture = useCallback(async (): Promise<AudioRecordingResult> => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      console.log('🎵 Starting system audio capture...');
      
      // Try getDisplayMedia first (simpler approach)
      try {
        console.log('Attempting getDisplayMedia approach...');
        const systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: false
        });
        
        console.log('✅ System audio stream obtained via getDisplayMedia');
        return await startRecordingWithStream(systemAudioStream, 'getDisplayMedia');
        
      } catch (displayError) {
        console.log('getDisplayMedia failed, trying desktop capturer...', displayError);
        
        // Fallback to desktop capturer approach
        if (!window.electronAPI?.audio?.getDesktopSources) {
          throw new Error('No audio capture methods available');
        }
        
        const sourcesResult = await window.electronAPI.audio.getDesktopSources();
        if (!sourcesResult.success || !sourcesResult.sources) {
          throw new Error(sourcesResult.error || 'Failed to get desktop sources');
        }
        
        console.log('✅ Found', sourcesResult.sources.length, 'desktop sources');
        
        const screenSource = sourcesResult.sources.find(source => 
          source.name.includes('Screen') || source.name.includes('Desktop')
        );
        const selectedSource = screenSource || sourcesResult.sources[0];
        
        if (!selectedSource) {
          throw new Error('No suitable desktop source found');
        }
        
        console.log('📱 Selected source:', selectedSource.name);
        
        const systemAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSource.id,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          } as any,
          video: false
        });
        
        console.log('✅ System audio stream obtained via desktop capturer');
        return await startRecordingWithStream(systemAudioStream, 'desktopCapturer');
      }
      
    } catch (error) {
      console.error('❌ System audio capture failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: `System audio capture failed: ${errorMessage}` }));
      return { success: false, error: errorMessage };
    }
  }, []);

  // Helper function to start recording with any MediaStream
  const startRecordingWithStream = async (stream: MediaStream, method: string): Promise<AudioRecordingResult> => {
    console.log(`Starting recording with ${method}`);
    
    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000
    });
    
    const audioChunks: Blob[] = [];
    let isRecording = true;
    
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && isRecording) {
        console.log('📊 Audio data received:', event.data.size, 'bytes');
        audioChunks.push(event.data);
      }
    };
    
    recorder.start(1000);
    console.log('🎬 Recording started');
    
    // Store only essential data
    window.__audioCapture = {
      isActive: true,
      browserBasedRecording: true,
      stop: () => {
        isRecording = false;
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        stream.getTracks().forEach(track => track.stop());
      },
      getChunks: () => audioChunks
    };
    
    setState(prev => ({ ...prev, isRecording: true }));
    
    return { 
      success: true,
      message: `System audio capture started using ${method}`
    };
  };

  return {
    isRecording: state.isRecording,
    audioLevel: state.audioLevel,
    error: state.error,
    startRecording,
    startSystemAudioCapture,
    stopRecording,
  };
};