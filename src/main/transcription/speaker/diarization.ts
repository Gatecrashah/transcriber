/**
 * Speaker diarization and segment parsing
 */

import type { SpeakerSegment, WhisperSegment } from '../../../types/transcription';

export class SpeakerDiarization {
  /**
   * Parse transcription output for multiple speakers (advanced diarization)
   */
  parseTranscriptionForMultipleSpeakers(
    transcriptionText: string,
    _streamType: 'system' | 'microphone'
  ): SpeakerSegment[] {
    const segments: SpeakerSegment[] = [];
    
    console.log('🚀 === parseTranscriptionForMultipleSpeakers CALLED ===');
    console.log(`📋 Input text length: ${transcriptionText.length} characters`);
    console.log(`🔍 Contains [SPEAKER_TURN]: ${transcriptionText.includes('[SPEAKER_TURN]')}`);
    console.log(`📋 Text preview: ${transcriptionText.substring(0, 300)}...`);
    
    // If we have [SPEAKER_TURN] markers, parse them directly without JSON
    if (transcriptionText.includes('[SPEAKER_TURN]')) {
      console.log('🎙️ Detected [SPEAKER_TURN] markers - using direct text parsing');
      const speakerSegments = this.parseTinydiarizeOutput(transcriptionText);
      return speakerSegments;
    }
    
    try {
      console.log('🔍 Attempting JSON parsing...');
      
      const jsonData = JSON.parse(transcriptionText);
      console.log('✅ JSON parsing successful');
      console.log(`📊 JSON structure keys: ${Object.keys(jsonData)}`);
      
      if (jsonData.segments && Array.isArray(jsonData.segments)) {
        console.log(`Found ${jsonData.segments.length} segments for multi-speaker analysis`);
        
        // Debug: Log first few segments to understand structure
        jsonData.segments.slice(0, 3).forEach((segment: WhisperSegment, _index: number) => {
          console.log(`🔍 Segment ${_index}:`, {
            speaker: segment.speaker,
            speaker_id: segment.speaker_id,
            text: segment.text?.substring(0, 50),
            start: segment.start,
            end: segment.end,
            allKeys: Object.keys(segment)
          });
        });
        
        // Track unique speakers and assign labels
        const speakerMap = new Map<number, string>();
        let speakerCounter = 0;
        
        jsonData.segments.forEach((segment: WhisperSegment) => {
          // whisper.cpp diarization typically provides speaker IDs as numbers
          const speakerId = segment.speaker_id ?? (segment.speaker ? parseInt(segment.speaker, 10) || 0 : 0);
          
          // Map speaker IDs to friendly names
          if (!speakerMap.has(speakerId)) {
            speakerCounter++;
            speakerMap.set(speakerId, `Speaker ${String.fromCharCode(64 + speakerCounter)}`); // A, B, C, etc.
          }
          
          const speakerName = speakerMap.get(speakerId) || 'Unknown Speaker';
          
          segments.push({
            speaker: speakerName,
            text: segment.text?.trim() || '',
            startTime: segment.start || 0,
            endTime: segment.end || 0,
            confidence: segment.confidence || segment.avg_logprob
          });
        });
        
        console.log(`✅ Identified ${speakerMap.size} unique speakers:`, Array.from(speakerMap.values()));
      } else if (jsonData.text) {
        // Handle tinydiarize output with [SPEAKER_TURN] markers
        console.log('🔄 Parsing tinydiarize output with [SPEAKER_TURN] markers...');
        const speakerSegments = this.parseTinydiarizeOutput(jsonData.text);
        segments.push(...speakerSegments);
      }
    } catch (error) {
      console.warn('⚠️ Failed to parse multi-speaker JSON, trying text parsing with [SPEAKER_TURN]');
      console.error('Parse error:', error);
      
      // Try to parse as text with [SPEAKER_TURN] markers
      const speakerSegments = this.parseTinydiarizeOutput(transcriptionText);
      if (speakerSegments.length > 0) {
        segments.push(...speakerSegments);
      } else {
        // Final fallback: treat as single speaker
        segments.push({
          speaker: 'Speaker A',
          text: transcriptionText.trim(),
          startTime: 0,
          endTime: 0
        });
      }
    }
    
    return segments;
  }

  /**
   * Parse tinydiarize output with [SPEAKER_TURN] markers
   */
  parseTinydiarizeOutput(text: string): SpeakerSegment[] {
    const segments: SpeakerSegment[] = [];
    
    console.log('🎙️ Parsing tinydiarize [SPEAKER_TURN] markers...');
    console.log('📋 Raw input text:', text.substring(0, 300) + '...');
    
    // Split text by [SPEAKER_TURN] markers
    const parts = text.split(/\[SPEAKER_TURN\]/gi); // Case-insensitive split
    
    console.log(`📊 Found ${parts.length} parts after splitting by [SPEAKER_TURN]`);
    
    let speakerIndex = 0;
    
    parts.forEach((part, _index) => {
      const cleanedText = part
        // Remove timestamp patterns
        .replace(/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\]/g, '')
        // Remove remaining brackets and artifacts
        .replace(/\[.*?\]/g, '')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim();
      
      // Only include parts with meaningful content (more than just a few words)
      if (cleanedText.length > 15) {
        const speakerLabel = `Speaker Turn ${speakerIndex + 1}`; // Turn 1, Turn 2, etc.
        
        segments.push({
          speaker: speakerLabel,
          text: cleanedText,
          startTime: 0, // tinydiarize doesn't provide precise timestamps per speaker
          endTime: 0,
          confidence: 0.6 // Lower confidence since we're not doing clustering
        });
        
        console.log(`✅ ${speakerLabel}: "${cleanedText.substring(0, 80)}${cleanedText.length > 80 ? '...' : ''}"`);
        speakerIndex++;
      } else if (cleanedText.length > 0) {
        console.log(`⚠️ Skipping short segment (${cleanedText.length} chars): "${cleanedText}"`);
      }
    });
    
    console.log(`🎙️ Extracted ${segments.length} speaker segments from tinydiarize output`);
    
    // If we didn't get any segments, create a fallback
    if (segments.length === 0 && text.trim().length > 0) {
      console.log('⚠️ No segments found, creating fallback single speaker');
      segments.push({
        speaker: 'Speaker A',
        text: text.replace(/\[SPEAKER_TURN\]/gi, '').replace(/\s+/g, ' ').trim(),
        startTime: 0,
        endTime: 0,
        confidence: 0.5
      });
    }
    
    return segments;
  }

  /**
   * Group speaker segments by speaker for organized output
   */
  groupSegmentsBySpeaker(segments: SpeakerSegment[]): Record<string, SpeakerSegment[]> {
    const grouped: Record<string, SpeakerSegment[]> = {};
    
    segments.forEach(segment => {
      if (!grouped[segment.speaker]) {
        grouped[segment.speaker] = [];
      }
      grouped[segment.speaker].push(segment);
    });
    
    // Sort segments within each speaker by start time
    Object.keys(grouped).forEach(speaker => {
      grouped[speaker].sort((a, b) => a.startTime - b.startTime);
    });
    
    return grouped;
  }

  /**
   * Parse transcription output to extract speaker segments
   */
  parseTranscriptionForSpeakers(
    transcriptionText: string,
    defaultSpeaker: string,
    _streamType: 'system' | 'microphone'
  ): SpeakerSegment[] {
    const segments: SpeakerSegment[] = [];
    
    try {
      // Try to parse as JSON first (if diarization was enabled)
      const jsonData = JSON.parse(transcriptionText);
      
      if (jsonData.segments && Array.isArray(jsonData.segments)) {
        // Whisper JSON format with segments
        jsonData.segments.forEach((segment: WhisperSegment) => {
          segments.push({
            speaker: segment.speaker || defaultSpeaker,
            text: segment.text?.trim() || '',
            startTime: segment.start || 0,
            endTime: segment.end || 0,
            confidence: segment.confidence
          });
        });
      } else {
        // Fallback: create single segment
        segments.push({
          speaker: defaultSpeaker,
          text: jsonData.text || transcriptionText,
          startTime: 0,
          endTime: 0
        });
      }
    } catch {
      // Not JSON, treat as plain text
      if (transcriptionText.trim()) {
        segments.push({
          speaker: defaultSpeaker,
          text: transcriptionText.trim(),
          startTime: 0,
          endTime: 0
        });
      }
    }
    
    return segments;
  }

  /**
   * Format speaker segments into a readable transcript
   */
  formatSpeakerTranscript(segments: SpeakerSegment[]): string {
    if (segments.length === 0) return '';
    
    let transcript = '';
    let currentSpeaker = '';
    
    segments.forEach((segment) => {
      if (segment.speaker !== currentSpeaker) {
        if (transcript) transcript += '\n\n';
        transcript += `**${segment.speaker}:**\n`;
        currentSpeaker = segment.speaker;
      }
      
      if (segment.text.trim()) {
        transcript += `${segment.text.trim()}\n`;
      }
    });
    
    return transcript.trim();
  }
}