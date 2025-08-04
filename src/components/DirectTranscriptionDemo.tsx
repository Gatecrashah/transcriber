import React, { useState } from 'react';
import { useDirectTranscription } from '../hooks/useDirectTranscription';

/**
 * Demo component showcasing ZERO FILE I/O transcription
 * This demonstrates the massive performance improvement from Phase 3B
 */
export const DirectTranscriptionDemo: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<string>('');
  
  const { transcribeAudioBlob, isTranscribing, error } = useDirectTranscription();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setResult(null);
    setPerformanceMetrics('');

    try {
      const startTime = performance.now();
      
      // Option 1: Use the direct transcription hook (client-side)
      // const transcriptionResult = await transcribeAudioBlob(file);
      
      // Option 2: Use the new processDirectly API (server-side)
      if (window.electronAPI?.audio?.processDirectly) {
        const arrayBuffer = await file.arrayBuffer();
        const directResult = await window.electronAPI.audio.processDirectly(arrayBuffer);
        
        const endTime = performance.now();
        const processingTime = endTime - startTime;
        
        setResult(directResult);
        setPerformanceMetrics(`
          🚀 Direct Processing Complete!
          ⚡ Total time: ${processingTime.toFixed(2)}ms
          📊 Audio: ${directResult.audioMetadata?.duration?.toFixed(2)}s @ ${directResult.audioMetadata?.sampleRate}Hz
          🎯 Samples: ${directResult.audioMetadata?.samples?.toLocaleString()}
          ✅ Zero temp files created!
        `);
        
        console.log('🎉 Direct transcription result:', directResult);
      }
    } catch (err) {
      console.error('Error processing audio:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f0f0', borderRadius: '8px', margin: '20px' }}>
      <h2>🚀 Direct Audio Processing Demo (Phase 3B)</h2>
      <p style={{ color: '#666' }}>
        Upload a WAV file to see the massive performance improvement from eliminating all file I/O!
      </p>
      
      <input
        type="file"
        accept="audio/wav"
        onChange={handleFileUpload}
        disabled={isProcessing || isTranscribing}
        style={{ margin: '10px 0' }}
      />
      
      {isProcessing && <div>⏳ Processing audio directly in memory...</div>}
      
      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          ❌ Error: {error}
        </div>
      )}
      
      {performanceMetrics && (
        <pre style={{ 
          backgroundColor: '#333', 
          color: '#0f0', 
          padding: '15px', 
          borderRadius: '5px',
          fontFamily: 'monospace',
          marginTop: '10px'
        }}>
          {performanceMetrics}
        </pre>
      )}
      
      {result?.transcription && (
        <div style={{ marginTop: '20px' }}>
          <h3>Transcription Result:</h3>
          <div style={{ 
            backgroundColor: 'white', 
            padding: '15px', 
            borderRadius: '5px',
            border: '1px solid #ddd'
          }}>
            {result.transcription.text || 'No text transcribed'}
          </div>
          
          {result.transcription.segments && (
            <details style={{ marginTop: '10px' }}>
              <summary>Speaker Segments ({result.transcription.segments.length})</summary>
              <pre style={{ fontSize: '12px' }}>
                {JSON.stringify(result.transcription.segments, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};