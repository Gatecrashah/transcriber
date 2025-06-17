import { useState, useEffect, useCallback } from 'react';

// Extend Window interface for global dual audio capture object
declare global {
  interface Window {
    __audioCapture?: {
      browserBasedRecording?: boolean;
      isActive?: boolean;
      isDualStream?: boolean;
      stop?: () => void;
      getSystemChunks?: () => Blob[];
      getMicrophoneChunks?: () => Blob[];
      // Legacy single stream support
      getChunks?: () => Blob[];
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

  // Helper function to calculate audio level from AnalyserNode
  const getAudioLevel = useCallback((analyser: AnalyserNode): number => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate RMS (Root Mean Square) for more accurate level detection
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    
    // Convert to percentage (0-100) and apply some scaling for better visualization
    return Math.min(100, (rms / 255) * 100 * 2);
  }, []);

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
      // For browser-based recording, use real Web Audio API analysis
      if (window.__audioCapture?.isDualStream) {
        const systemLevel = window.__audioCapture?.systemAnalyser 
          ? getAudioLevel(window.__audioCapture.systemAnalyser) 
          : 0;
        const microphoneLevel = window.__audioCapture?.microphoneAnalyser 
          ? getAudioLevel(window.__audioCapture.microphoneAnalyser) 
          : 0;
        
        setState(prev => ({ 
          ...prev, 
          systemAudioLevel: systemLevel,
          microphoneAudioLevel: microphoneLevel,
          audioLevel: Math.max(systemLevel, microphoneLevel) // Combined level is the higher of the two
        }));
      } else {
        // Single stream fallback - could use single analyser if available
        setState(prev => ({ ...prev, audioLevel: Math.random() * 50 + 25 }));
      }
    }
  }, [state.isRecording, getAudioLevel]);

  useEffect(() => {
    // Enable real-time audio level monitoring
    if (state.isRecording) {
      const interval = setInterval(updateAudioLevel, 100);
      setLevelUpdateInterval(interval);
      console.log('Recording started - real-time audio level monitoring enabled');
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
        console.log('🛑 Stopping browser-based audio capture...');
        
        // Stop the recording using the simplified interface
        if (audioCapture.stop) {
          audioCapture.stop();
        }
        
        // Wait a bit for final data
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Handle dual stream recording
        if (audioCapture.isDualStream) {
          console.log('📁 Processing dual audio streams...');
          
          const systemChunks = audioCapture.getSystemChunks ? audioCapture.getSystemChunks() : [];
          const microphoneChunks = audioCapture.getMicrophoneChunks ? audioCapture.getMicrophoneChunks() : [];
          
          console.log(`🔊 System audio chunks: ${systemChunks.length}`);
          console.log(`🎤 Microphone audio chunks: ${microphoneChunks.length}`);
          
          let systemAudioPath: string | undefined;
          let microphoneAudioPath: string | undefined;
          let combinedAudioPath: string | undefined;
          
          // Process system audio
          if (systemChunks.length > 0) {
            const systemBlob = new Blob(systemChunks, { type: 'audio/webm' });
            const systemWav = await convertWebMToWav(systemBlob);
            systemAudioPath = await saveAudioFile(systemWav, 'system');
            console.log('✅ System audio saved to:', systemAudioPath);
          }
          
          // Process microphone audio
          if (microphoneChunks.length > 0) {
            const microphoneBlob = new Blob(microphoneChunks, { type: 'audio/webm' });
            const microphoneWav = await convertWebMToWav(microphoneBlob);
            microphoneAudioPath = await saveAudioFile(microphoneWav, 'microphone');
            console.log('✅ Microphone audio saved to:', microphoneAudioPath);
          }
          
          // Create combined audio for transcription
          if (systemChunks.length > 0 || microphoneChunks.length > 0) {
            const combinedChunks = [...systemChunks, ...microphoneChunks];
            const combinedBlob = new Blob(combinedChunks, { type: 'audio/webm' });
            const combinedWav = await convertWebMToWav(combinedBlob);
            combinedAudioPath = await saveAudioFile(combinedWav, 'combined');
            console.log('✅ Combined audio saved to:', combinedAudioPath);
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
        
        // Handle legacy single stream recording
        else {
          const chunks = audioCapture.getChunks ? audioCapture.getChunks() : [];
          
          if (chunks && chunks.length > 0) {
            console.log('📁 Processing', chunks.length, 'single-stream audio chunks...');
            
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
      }
      
      // Check if we're using native dual capture (no browser recording active)
      if (!audioCapture && window.electronAPI?.audio) {
        console.log('🛑 Stopping native dual capture...');
        
        try {
          const nativeResult = await window.electronAPI.audio.stopRecording();
          
          setState(prev => ({ 
            ...prev, 
            isRecording: false, 
            audioLevel: 0,
            systemAudioLevel: 0,
            microphoneAudioLevel: 0,
            systemAudioActive: false,
            microphoneAudioActive: false
          }));
          
          if (nativeResult.success && nativeResult.audioPath) {
            console.log('✅ Native dual capture stopped:', nativeResult.audioPath);
            
            // The Swift utility captures both system and microphone in one file
            // We'll treat this as the combined audio for transcription
            return {
              success: true,
              audioPath: nativeResult.audioPath,
              systemAudioPath: nativeResult.audioPath, // Same file contains both
              microphoneAudioPath: nativeResult.audioPath, // Same file contains both  
              message: 'Native dual capture (system + microphone) completed'
            };
          } else {
            console.log('❌ Native dual capture stop failed:', nativeResult.error);
            return { success: false, error: nativeResult.error || 'Failed to stop native recording' };
          }
        } catch (nativeError) {
          console.log('❌ Error stopping native dual capture:', nativeError);
          setState(prev => ({ 
            ...prev, 
            isRecording: false, 
            systemAudioActive: false,
            microphoneAudioActive: false
          }));
          return { success: false, error: 'Failed to stop native recording' };
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

  // Helper function to save audio file with stream type
  const saveAudioFile = async (audioBlob: Blob, streamType?: string): Promise<string> => {
    // Convert blob to array buffer
    const arrayBuffer = await audioBlob.arrayBuffer();
    
    console.log(`Saving audio file for stream: ${streamType || 'default'}`);
    
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

  const startDualAudioCapture = useCallback(async (): Promise<AudioRecordingResult> => {
    console.log('🚀 startDualAudioCapture function called');
    
    try {
      setState(prev => ({ ...prev, error: null }));
      
      console.log('🎵🎤 Starting dual audio capture (system + microphone)...');
      
      // Step 0: Request proper system audio permissions first (like Granola does)
      console.log('📋 Checking for permission request API...');
      if (window.electronAPI?.audio?.requestSystemAudioPermission) {
        console.log('✅ Permission API available, requesting permissions...');
        try {
          console.log('🔐 Requesting Screen & System Audio Recording permission (required for headphones)...');
          const permissionResult = await window.electronAPI.audio.requestSystemAudioPermission();
          
          if (permissionResult.success) {
            console.log('✅ Screen & System Audio Recording permission granted!');
            console.log(`💡 ${permissionResult.message || 'System audio capture now available'}`);
          } else if (permissionResult.needsManualPermission) {
            console.warn('⚠️ Please manually enable Screen Recording permission in System Preferences');
            console.log('📋 Go to: System Preferences > Privacy & Security > Screen & System Audio Recording');
            console.log('💡 Then add and enable this app to capture system audio with headphones');
          } else if (permissionResult.userDenied) {
            console.warn('❌ User denied system audio permission - falling back to microphone only');
          }
        } catch (permissionError) {
          console.log('Permission request failed, continuing with available methods:', permissionError);
        }
      } else {
        console.log('⚠️ Permission API not available, continuing without permission check');
      }
      
      // Implement proper dual-stream browser-based capture as per CLAUDE.md
      console.log('🎵 Starting synchronized dual-stream audio capture (CLAUDE.md spec)...');
      console.log('🌐 Using browser-based MediaDevices API for dual capture');
      
      let systemAudioStream: MediaStream | null = null;
      let microphoneStream: MediaStream | null = null;
      
      // Step 1: Get system audio - use getDisplayMedia like working version (Electron 36.x)
      try {
        console.log('🔊 Attempting system audio capture via getDisplayMedia (Electron 36.x)...');
        console.log('🔊 Using constraints: { audio: true, video: false }');
        
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: false
        });
        
        console.log('🎵 getDisplayMedia returned stream:', stream);
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();
        console.log('🎵 Audio tracks found:', audioTracks.length);
        console.log('🎵 Video tracks found:', videoTracks.length);
        
        if (audioTracks.length > 0) {
          systemAudioStream = new MediaStream(audioTracks);
          console.log('✅ System audio stream obtained via browser');
          console.log('🎵 System audio track details:', audioTracks[0].getSettings());
          console.log('🎵 System audio track constraints:', audioTracks[0].getConstraints());
          console.log('🎵 System audio track capabilities:', audioTracks[0].getCapabilities());
          console.log('🎵 System audio track label:', audioTracks[0].label);
          console.log('🎵 System audio track kind:', audioTracks[0].kind);
          console.log('🎵 System audio track enabled:', audioTracks[0].enabled);
          console.log('🎵 System audio track muted:', audioTracks[0].muted);
          console.log('🎵 System audio track ready state:', audioTracks[0].readyState);
          setState(prev => ({ ...prev, systemAudioActive: true }));
        } else {
          console.log('❌ No audio tracks in getDisplayMedia stream');
        }
        
        // Stop video tracks immediately to avoid unnecessary video capture
        videoTracks.forEach(track => track.stop());
        
      } catch (systemError) {
        console.log('⚠️ Browser system audio capture failed:', systemError);
        console.log('⚠️ Error details:', systemError.name, systemError.message);
        console.log('⚠️ Trying desktop capturer fallback (like working version)...');
        
        // Fallback to desktop capturer approach (like working version)
        try {
          if (!window.electronAPI?.audio?.getDesktopSources) {
            throw new Error('Desktop capturer API not available');
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
          
          console.log('📱 Selected desktop source:', selectedSource.name);
          
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
          console.log('✅ System audio stream obtained via desktop capturer fallback');
          setState(prev => ({ ...prev, systemAudioActive: true }));
          
        } catch (fallbackError) {
          console.log('❌ Desktop capturer fallback also failed:', fallbackError);
          console.log('💡 Continuing with microphone-only capture');
        }
      }
      
      // Step 2: Get microphone stream with proper audio constraints
      try {
        console.log('🎤 Attempting microphone audio capture...');
        console.log('🎤 Using constraints like working version: { audio: { echo/noise/gain }, video: false }');
        microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        console.log('✅ Microphone audio stream obtained');
        const micTrack = microphoneStream.getAudioTracks()[0];
        if (micTrack) {
          console.log('🎤 Microphone track details:', micTrack.getSettings());
          console.log('🎤 Microphone track constraints:', micTrack.getConstraints());
          console.log('🎤 Microphone track capabilities:', micTrack.getCapabilities());
          console.log('🎤 Microphone track label:', micTrack.label);
          console.log('🎤 Microphone track enabled:', micTrack.enabled);
          console.log('🎤 Microphone track muted:', micTrack.muted);
          console.log('🎤 Microphone track ready state:', micTrack.readyState);
        }
        setState(prev => ({ ...prev, microphoneAudioActive: true }));
      } catch (micError) {
        console.warn('⚠️ Microphone audio capture failed:', micError);
        console.warn('⚠️ Microphone error details:', micError.name, micError.message);
        // Continue without microphone - we might have system audio
      }
      
      // Check if we got at least one stream (microphone is sufficient)
      if (!systemAudioStream && !microphoneStream) {
        throw new Error('Failed to capture any audio stream');
      }
      
      // Log what we successfully captured
      if (systemAudioStream && microphoneStream) {
        console.log('✅ Got both system audio and microphone - full dual capture');
      } else if (microphoneStream) {
        console.log('✅ Got microphone only - this is normal with headphones');
      } else if (systemAudioStream) {
        console.log('✅ Got system audio only - unusual but workable');
      }
      
      // Step 3: Start dual recording
      return await startDualRecording(systemAudioStream, microphoneStream);
      
    } catch (error) {
      console.error('❌ Dual audio capture failed:', error);
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

  // Legacy single-stream capture for fallback
  const startSystemAudioCapture = useCallback(async (): Promise<AudioRecordingResult> => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      console.log('🎵 Starting single-stream system audio capture...');
      
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
          } as MediaTrackConstraints,
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

  // Helper function to start dual recording with synchronized streams
  const startDualRecording = async (
    systemStream: MediaStream | null, 
    microphoneStream: MediaStream | null
  ): Promise<AudioRecordingResult> => {
    console.log('🎬 Starting dual recording with synchronized streams');
    
    const systemAudioChunks: Blob[] = [];
    const microphoneAudioChunks: Blob[] = [];
    let isRecording = true;
    
    let systemRecorder: MediaRecorder | null = null;
    let microphoneRecorder: MediaRecorder | null = null;
    
    // Create synchronized timestamp for both streams
    const startTime = Date.now();
    console.log('🕐 Dual recording started at:', new Date(startTime).toISOString());
    
    // Set up Web Audio API for real-time level monitoring
    const audioContext = new AudioContext();
    let systemAnalyser: AnalyserNode | undefined;
    let microphoneAnalyser: AnalyserNode | undefined;
    
    // Setup system audio recorder
    if (systemStream) {
      try {
        // Set up Web Audio analysis for system audio
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        systemAnalyser = audioContext.createAnalyser();
        systemAnalyser.fftSize = 256;
        systemAnalyser.smoothingTimeConstant = 0.8;
        systemSource.connect(systemAnalyser);
        console.log('📊 System audio analyser connected');
        
        // Configure MediaRecorder for system audio (like working version)
        systemRecorder = new MediaRecorder(systemStream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 128000  // Like working version
        });
        
        systemRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && isRecording) {
            console.log('🔊 System audio data received:', event.data.size, 'bytes');
            systemAudioChunks.push(event.data);
          }
        };
        
        systemRecorder.start(1000); // Record in 1-second chunks
        console.log('✅ System audio recording started');
      } catch (error) {
        console.error('❌ Failed to start system audio recorder:', error);
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
        console.log('📊 Microphone audio analyser connected');
        
        // Configure MediaRecorder for microphone audio (like working version)
        microphoneRecorder = new MediaRecorder(microphoneStream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 128000  // Like working version
        });
        
        microphoneRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && isRecording) {
            console.log('🎤 Microphone audio data received:', event.data.size, 'bytes');
            microphoneAudioChunks.push(event.data);
          }
        };
        
        microphoneRecorder.start(1000); // Record in 1-second chunks  
        console.log('✅ Microphone audio recording started');
      } catch (error) {
        console.error('❌ Failed to start microphone recorder:', error);
      }
    }
    
    // Store dual recording data globally
    window.__audioCapture = {
      isActive: true,
      browserBasedRecording: true,
      isDualStream: true,
      audioContext,
      systemAnalyser,
      microphoneAnalyser,
      stop: () => {
        console.log('🛑 Stopping dual audio recording...');
        isRecording = false;
        
        if (systemRecorder && systemRecorder.state === 'recording') {
          systemRecorder.stop();
        }
        if (microphoneRecorder && microphoneRecorder.state === 'recording') {
          microphoneRecorder.stop();
        }
        
        // Stop all tracks
        if (systemStream) {
          systemStream.getTracks().forEach(track => track.stop());
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
      getMicrophoneChunks: () => microphoneAudioChunks,
      // Legacy support - return mixed chunks
      getChunks: () => [...systemAudioChunks, ...microphoneAudioChunks]
    };
    
    // Update state to reflect which streams are active
    setState(prev => ({ 
      ...prev, 
      isRecording: true,
      systemAudioActive: !!systemStream,
      microphoneAudioActive: !!microphoneStream
    }));
    
    const activeStreams = [];
    if (systemStream) activeStreams.push('system audio');
    if (microphoneStream) activeStreams.push('microphone');
    
    console.log(`✅ Dual recording setup complete: ${activeStreams.join(' + ')}`);
    
    return { 
      success: true,
      message: `Dual audio capture started: ${activeStreams.join(' + ')}`
    };
  };

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
    systemAudioLevel: state.systemAudioLevel,
    microphoneAudioLevel: state.microphoneAudioLevel,
    systemAudioActive: state.systemAudioActive,
    microphoneAudioActive: state.microphoneAudioActive,
    error: state.error,
    startRecording,
    startSystemAudioCapture,
    startDualAudioCapture,
    stopRecording,
  };
};