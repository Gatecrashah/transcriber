/**
 * Speaker diarization and segment parsing
 */

import type { SpeakerSegment, WhisperSegment } from '../../../types/transcription';
import { PyannoteIntegration, type PyannoteResult, type PyannoteSegment } from './pyannote-integration';

export class SpeakerDiarization {
  private pyannoteIntegration: PyannoteIntegration;

  constructor() {
    this.pyannoteIntegration = new PyannoteIntegration();
  }

  /**
   * Enhanced diarization using pyannote.audio for speaker clustering
   */
  async diarizeWithPyannote(audioPath: string): Promise<SpeakerSegment[]> {
    console.log('🎙️ Starting pyannote.audio speaker diarization...');
    
    // Check if pyannote is available and configured
    const dependencyCheck = await this.pyannoteIntegration.checkDependencies();
    if (!dependencyCheck.available) {
      console.warn('⚠️ Pyannote not available:', dependencyCheck.message);
      return [];
    }

    if (!this.pyannoteIntegration.isConfigured()) {
      console.warn('⚠️ Pyannote not configured - missing HUGGINGFACE_TOKEN');
      return [];
    }

    try {
      const result: PyannoteResult = await this.pyannoteIntegration.diarizeAudio(audioPath);
      
      if (!result.success) {
        console.error('❌ Pyannote diarization failed:', result.error);
        return [];
      }

      if (!result.speakers || result.speakers.length === 0) {
        console.warn('⚠️ No speakers detected by pyannote');
        return [];
      }

      console.log(`✅ Pyannote identified ${result.total_speakers} speakers in ${result.total_segments} segments`);
      
      // Convert pyannote segments to our format
      const speakerSegments: SpeakerSegment[] = result.speakers.map((segment: PyannoteSegment) => ({
        speaker: segment.speaker,
        text: '', // Text will be filled by transcription
        startTime: segment.start_time,
        endTime: segment.end_time,
        confidence: segment.confidence
      }));

      return speakerSegments;
    } catch (error) {
      console.error('❌ Error during pyannote diarization:', error);
      return [];
    }
  }

  /**
   * Combine pyannote speaker segments with transcription text
   */
  combineWithTranscription(
    pyannoteSegments: SpeakerSegment[],
    transcriptionText: string
  ): SpeakerSegment[] {
    if (pyannoteSegments.length === 0) {
      // Fallback to existing logic
      return this.parseTranscriptionForMultipleSpeakers(transcriptionText);
    }

    console.log(`🔗 Combining ${pyannoteSegments.length} pyannote segments with transcription`);
    
    try {
      const jsonData = JSON.parse(transcriptionText);
      
      if (jsonData.segments && Array.isArray(jsonData.segments)) {
        // Map transcription segments to speaker segments based on timing
        const combinedSegments: SpeakerSegment[] = [];
        
        jsonData.segments.forEach((transcriptSegment: WhisperSegment) => {
          const segmentStart = transcriptSegment.start || 0;
          const segmentEnd = transcriptSegment.end || 0;
          
          // Find the best matching pyannote segment based on timing overlap
          const matchingSpeaker = this.findBestSpeakerMatch(
            segmentStart,
            segmentEnd,
            pyannoteSegments
          );
          
          combinedSegments.push({
            speaker: matchingSpeaker?.speaker || 'Unknown Speaker',
            text: transcriptSegment.text?.trim() || '',
            startTime: segmentStart,
            endTime: segmentEnd,
            confidence: matchingSpeaker?.confidence || 0.5
          });
        });
        
        console.log(`✅ Successfully combined segments: ${combinedSegments.length} final segments`);
        return combinedSegments;
      }
    } catch {
      console.warn('⚠️ Failed to parse transcription JSON, trying plain text parsing');
      
      // Try to parse plain text format with timestamps
      const textSegments = this.parseTimestampedText(transcriptionText);
      if (textSegments.length > 0) {
        console.log(`📝 Parsed ${textSegments.length} text segments from plain format`);
        
        // Combine with pyannote segments
        const combinedSegments: SpeakerSegment[] = [];
        
        textSegments.forEach((textSegment) => {
          const matchingSpeaker = this.findBestSpeakerMatch(
            textSegment.startTime,
            textSegment.endTime,
            pyannoteSegments
          );
          
          combinedSegments.push({
            speaker: matchingSpeaker?.speaker || 'Unknown Speaker',
            text: textSegment.text,
            startTime: textSegment.startTime,
            endTime: textSegment.endTime,
            confidence: matchingSpeaker?.confidence || 0.5
          });
        });
        
        console.log(`✅ Successfully combined ${textSegments.length} text segments with pyannote speakers`);
        return combinedSegments;
      }
    }
    
    // Final fallback: return pyannote segments (without text)
    console.warn('⚠️ Could not parse transcription text, returning pyannote segments without text');
    return pyannoteSegments;
  }

  /**
   * Parse plain text format with timestamps like [00:00:00.000 --> 00:00:16.200] text
   */
  private parseTimestampedText(text: string): Array<{startTime: number, endTime: number, text: string}> {
    const segments: Array<{startTime: number, endTime: number, text: string}> = [];
    
    // Regex to match timestamp format: [00:00:00.000 --> 00:00:16.200]
    const timestampRegex = /\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\s*([\s\S]+?)(?=\[|$)/g;
    
    let match;
    while ((match = timestampRegex.exec(text)) !== null) {
      const [, startH, startM, startS, startMs, endH, endM, endS, endMs, content] = match;
      
      // Convert to seconds
      const startTime = parseInt(startH) * 3600 + parseInt(startM) * 60 + parseInt(startS) + parseInt(startMs) / 1000;
      const endTime = parseInt(endH) * 3600 + parseInt(endM) * 60 + parseInt(endS) + parseInt(endMs) / 1000;
      
      const cleanText = content.trim().replace(/\n+/g, ' ');
      
      if (cleanText.length > 0) {
        segments.push({
          startTime,
          endTime,
          text: cleanText
        });
      }
    }
    
    console.log(`📝 Parsed ${segments.length} timestamped segments from plain text`);
    segments.forEach((seg, i) => {
      console.log(`   ${i}: ${seg.startTime.toFixed(1)}s-${seg.endTime.toFixed(1)}s: "${seg.text.substring(0, 50)}..."`);
    });
    
    return segments;
  }

  /**
   * Find the best speaker match based on timing overlap
   */
  private findBestSpeakerMatch(
    startTime: number,
    endTime: number,
    speakerSegments: SpeakerSegment[]
  ): SpeakerSegment | null {
    let bestMatch: SpeakerSegment | null = null;
    let bestOverlap = 0;
    
    const segmentDuration = endTime - startTime;
    
    speakerSegments.forEach(speaker => {
      // Calculate overlap between transcription segment and speaker segment
      const overlapStart = Math.max(startTime, speaker.startTime);
      const overlapEnd = Math.min(endTime, speaker.endTime);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      
      // Calculate overlap ratio relative to transcription segment duration
      const overlapRatio = segmentDuration > 0 ? overlap / segmentDuration : 0;
      
      if (overlapRatio > bestOverlap) {
        bestOverlap = overlapRatio;
        bestMatch = speaker;
      }
    });
    
    return bestMatch;
  }

  /**
   * Parse transcription output for multiple speakers (advanced diarization)
   */
  parseTranscriptionForMultipleSpeakers(
    transcriptionText: string
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
        jsonData.segments.slice(0, 3).forEach((segment: WhisperSegment, index: number) => {
          console.log(`🔍 Segment ${index}:`, {
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
        // Final fallback: treat as single speaker (but check for hallucination)
        const cleanText = transcriptionText.trim();
        
        // Skip if it looks like hallucination
        if (this.isLikelyHallucination(cleanText)) {
          console.warn('⚠️ Skipping fallback segment - appears to be hallucination');
        } else if (cleanText.length > 0) {
          segments.push({
            speaker: 'Speaker A',
            text: cleanText,
            startTime: 0,
            endTime: 0
          });
        }
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
    
    // Check if text contains [SPEAKER_TURN] markers
    const hasSpeakerTurns = /\[SPEAKER_TURN\]/gi.test(text);
    
    if (!hasSpeakerTurns) {
      // No speaker turns found, create a single segment with default speaker
      const cleanedText = text.trim();
      if (cleanedText.length > 0) {
        console.log('📋 No [SPEAKER_TURN] markers found, creating single Speaker A segment');
        segments.push({
          speaker: 'Speaker A',
          text: cleanedText,
          startTime: 0,
          endTime: 0,
          confidence: 0.5
        });
      }
      return segments;
    }
    
    // Split text by [SPEAKER_TURN] markers
    const parts = text.split(/\[SPEAKER_TURN\]/gi); // Case-insensitive split
    
    console.log(`📊 Found ${parts.length} parts after splitting by [SPEAKER_TURN]`);
    
    let speakerIndex = 0;
    
    parts.forEach((part) => {
      const cleanedText = part
        // Remove timestamp patterns
        .replace(/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\]/g, '')
        // Remove remaining brackets and artifacts
        .replace(/\[.*?\]/g, '')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim();
      
      // Only include parts with meaningful content (more than just a few characters)
      if (cleanedText.length > 3) {
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
    defaultSpeaker: string
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
   * Check if text is likely a hallucination pattern
   */
  private isLikelyHallucination(text: string): boolean {
    if (!text || text.trim().length === 0) return true;
    
    const hallucinations = [
      /\[BLANK_AUDIO\]/gi,
      /\[PAUSE\]/gi,
      /\[COUGH\]/gi,
      /^\s*\[.*\]\s*$/,  // Only brackets content
      /^(.{1,10})\1{3,}$/,  // Repetitive short text
      /\b(um|uh|er|ah)\b.*\1.*\1/gi,  // Repetitive filler words
    ];
    
    return hallucinations.some(pattern => pattern.test(text));
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