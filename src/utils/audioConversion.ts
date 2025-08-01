// Audio conversion utilities for WebM to WAV processing

/**
 * Converts WebM audio blob to WAV format with 16kHz resampling for Whisper compatibility
 */
export const convertWebMToWav = async (webmBlob: Blob): Promise<Blob> => {
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

/**
 * Converts AudioBuffer to WAV Blob
 */
export const audioBufferToWav = async (audioBuffer: AudioBuffer): Promise<Blob> => {
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