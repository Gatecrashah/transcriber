// Audio file saving utilities

/**
 * Save audio blob to temporary file via Electron IPC
 */
export const saveAudioFile = async (audioBlob: Blob): Promise<string> => {
  const arrayBuffer = await audioBlob.arrayBuffer();
  
  if (window.electronAPI?.audio?.saveAudioFile) {
    const result = await window.electronAPI.audio.saveAudioFile(arrayBuffer);
    if (result.success) {
      return result.audioPath;
    }
  }
  
  // Fallback: create a local URL (won't work for transcription, but for debugging)
  return URL.createObjectURL(audioBlob);
};