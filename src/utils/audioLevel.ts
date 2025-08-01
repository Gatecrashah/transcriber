// Audio level monitoring utilities

/**
 * Calculate audio level from AnalyserNode for real-time visualization
 */
export const getAudioLevel = (analyser: AnalyserNode): number => {
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
};