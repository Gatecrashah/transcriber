import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  success: boolean;
  error?: string;
  speakers?: SpeakerSegment[];
}

export interface SpeakerSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export class TranscriptionManager {
  private whisperPath: string;
  private modelsDir: string;

  constructor() {
    const whisperDir = path.join(process.cwd(), 'src', 'native', 'whisper', 'whisper.cpp');
    this.whisperPath = path.join(whisperDir, 'build', 'bin', 'main');
    this.modelsDir = path.join(whisperDir, 'models');
  }

  private getModelPath(model = 'base'): string {
    // Map 'large' to 'large-v3' since that's what we're downloading
    if (model === 'large') {
      model = 'large-v3';
    }
    
    const modelPath = path.join(this.modelsDir, `ggml-${model}.bin`);
    const fallbackPath = path.join(this.modelsDir, 'ggml-base.bin');
    
    // Check if the model file exists and is valid
    if (!this.isValidModelFile(modelPath, model)) {
      console.log(`Model ${model} not found or invalid, falling back to base model`);
      return fallbackPath;
    }
    
    return modelPath;
  }

  private getTinydiarizeModelPath(): string {
    const tdrz1ModelPath = path.join(this.modelsDir, 'ggml-small.en-tdrz.bin');
    
    // Check if tinydiarize model exists
    if (fs.existsSync(tdrz1ModelPath)) {
      const stats = fs.statSync(tdrz1ModelPath);
      if (stats.size > 400000000) { // Should be ~465MB
        return tdrz1ModelPath;
      }
    }
    
    return '';
  }

  private hasTinydiarizeModel(): boolean {
    return this.getTinydiarizeModelPath() !== '';
  }

  private isValidModelFile(modelPath: string, modelName: string): boolean {
    try {
      const stats = fs.statSync(modelPath);
      
      // Define expected minimum sizes for different models (in bytes)
      const expectedSizes: { [key: string]: number } = {
        'tiny': 30 * 1024 * 1024,      // ~30MB
        'base': 100 * 1024 * 1024,     // ~100MB
        'small': 400 * 1024 * 1024,    // ~400MB
        'medium': 1200 * 1024 * 1024,  // ~1.2GB
        'large-v1': 2500 * 1024 * 1024,  // ~2.5GB
        'large-v2': 2500 * 1024 * 1024,  // ~2.5GB
        'large-v3': 2800 * 1024 * 1024,  // ~2.8GB
      };
      
      const expectedSize = expectedSizes[modelName] || 1000; // Default minimum size
      
      if (stats.size < expectedSize) {
        console.log(`Model ${modelName} file is too small (${stats.size} bytes, expected at least ${expectedSize} bytes)`);
        return false;
      }
      
      // Additional check: try to read the file header to verify it's a valid GGML file
      try {
        const fd = fs.openSync(modelPath, 'r');
        const buffer = Buffer.alloc(8);
        fs.readSync(fd, buffer, 0, 8, 0);
        fs.closeSync(fd);
        
        // Check for GGML magic number
        const magic = buffer.toString('ascii', 0, 4);
        if (magic !== 'ggml') {
          console.log(`Model ${modelName} has invalid magic number: ${magic}`);
          return false;
        }
      } catch (readError) {
        console.log(`Cannot read model file ${modelName}: ${readError}`);
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Transcribe an audio file using whisper.cpp
   * @param audioFilePath Path to the audio file to transcribe
   * @param options Additional options for transcription
   */
  async transcribeFile(
    audioFilePath: string,
    options: {
      language?: string;
      threads?: number;
      model?: string;
      outputFormat?: 'txt' | 'json' | 'srt' | 'vtt';
      enableDiarization?: boolean;
      speakerLabel?: string;
    } = {}
  ): Promise<TranscriptionResult> {
    try {
      // Validate audio file exists and has reasonable size
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }
      
      const stats = fs.statSync(audioFilePath);
      console.log(`📁 Audio file: ${audioFilePath} (${stats.size} bytes)`);
      
      if (stats.size < 1000) {
        throw new Error(`Audio file too small: ${stats.size} bytes`);
      }
      
      if (stats.size > 100 * 1024 * 1024) {
        console.warn(`⚠️ Large audio file: ${stats.size} bytes`);
      }
      
      // Analyze audio file to check if it contains actual audio data
      const audioAnalysis = await this.analyzeAudioFile(audioFilePath);
      console.log(`🔍 Audio analysis: ${audioAnalysis.info}`);
      
      if (!audioAnalysis.hasAudio) {
        console.warn('⚠️ Audio file may not contain valid audio data');
      }
      
      const modelPath = this.getModelPath(options.model || 'base');
      const actualModel = modelPath.includes('base') ? 'base' : options.model || 'base';
      console.log(`Using Whisper model: ${actualModel} (${modelPath})`);
      
      const args = [
        '-m', modelPath,
        '-f', audioFilePath,
        '--output-txt',
        '--print-progress'
      ];

      // Add language if specified
      if (options.language) {
        args.push('-l', options.language);
      }

      // Add thread count if specified
      if (options.threads) {
        args.push('-t', options.threads.toString());
      }

      // Add diarization if enabled
      if (options.enableDiarization) {
        if (this.hasTinydiarizeModel()) {
          // Use tinydiarize model for mono audio speaker diarization
          const tdrz1ModelPath = this.getTinydiarizeModelPath();
          args[1] = tdrz1ModelPath; // Replace the model path with tinydiarize model
          args.push('--tinydiarize');
          console.log('🎙️ Speaker diarization enabled (tinydiarize for mono audio)');
          console.log(`📁 Using tinydiarize model: ${tdrz1ModelPath}`);
          console.log('🔧 Whisper args with tinydiarize:', args);
        } else {
          console.warn('⚠️ Tinydiarize model not found, diarization will be disabled');
          console.log('   Run download-tinydiarize-model.sh to enable speaker diarization');
          // Don't add diarization flags if model is missing
        }
      }

      // Add output format - prefer JSON for diarization to get speaker timestamps
      if ((options.enableDiarization && this.hasTinydiarizeModel()) || options.outputFormat === 'json') {
        args.push('--output-json');
        console.log('📄 JSON output format enabled for diarization');
      } else if (options.outputFormat === 'srt') {
        args.push('--output-srt');
      } else if (options.outputFormat === 'vtt') {
        args.push('--output-vtt');
      }

      console.log('Running whisper with args:', args);

      const result = await this.runWhisper(args);
      
      console.log('🗣️ Whisper execution result:', {
        success: result.success,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        stdout: result.stdout,
        stderr: result.stderr
      });
      
      if (result.success) {
        const transcribedText = result.stdout.trim();
        console.log('✅ Raw whisper output:', transcribedText);
        
        // If we got empty output, that might indicate an audio format issue
        if (transcribedText.length === 0) {
          console.log('⚠️  Empty transcription result - this might indicate an audio format issue');
        }
        
        return {
          text: transcribedText,
          success: true,
          duration: this.extractDuration(result.stdout)
        };
      } else {
        console.error('❌ Whisper failed:', result.stderr);
        return {
          text: '',
          success: false,
          error: result.stderr
        };
      }
    } catch (error) {
      console.error('Transcription error:', error);
      return {
        text: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transcribe dual audio streams with speaker identification
   * @param systemAudioPath Path to system audio file (meeting participants)
   * @param microphoneAudioPath Path to microphone audio file (user)
   * @param options Transcription options
   */
  async transcribeDualStreams(
    systemAudioPath?: string,
    microphoneAudioPath?: string,
    options: {
      language?: string;
      threads?: number;
      model?: string;
      systemSpeakerName?: string;
      microphoneSpeakerName?: string;
    } = {}
  ): Promise<TranscriptionResult> {
    try {
      const results: SpeakerSegment[] = [];
      let combinedText = '';
      
      // Default speaker names
      const systemSpeaker = options.systemSpeakerName || 'Meeting Participants';
      const microphoneSpeaker = options.microphoneSpeakerName || 'You';
      
      console.log('🎙️ Starting dual-stream transcription with speaker identification');
      
      // Transcribe system audio with multi-speaker diarization
      if (systemAudioPath && fs.existsSync(systemAudioPath)) {
        const systemStats = fs.statSync(systemAudioPath);
        console.log(`🔊 Transcribing system audio with multi-speaker diarization`);
        console.log(`   📁 System audio file: ${systemAudioPath} (${systemStats.size} bytes)`);
        
        // Perform VAD on system audio first
        console.log('🎙️ Performing VAD on system audio...');
        const systemVAD = await this.performVAD(systemAudioPath);
        
        if (!systemVAD.hasVoice) {
          console.warn(`⚠️ No voice activity detected in system audio (confidence: ${systemVAD.confidence.toFixed(2)}) - skipping transcription`);
        } else {
          console.log(`✅ Voice activity detected in system audio (confidence: ${systemVAD.confidence.toFixed(2)})`);
          
          // First try with diarization to detect multiple speakers
          console.log('🎙️ Attempting multi-speaker diarization within system audio...');
          if (this.hasTinydiarizeModel()) {
            console.log('✅ Using tinydiarize model for mono audio speaker diarization');
          } else {
            console.log('ℹ️ Note: tinydiarize model not found');
            console.log('   - Run download-tinydiarize-model.sh to enable speaker diarization');
            console.log('   - Or consider implementing pyannote-audio for best results');
          }
          
          const systemResult = await this.transcribeFile(systemAudioPath, {
            ...options,
            enableDiarization: true, // Enable diarization for multi-speaker detection
            outputFormat: 'json', // JSON needed for speaker segments
            speakerLabel: systemSpeaker
          });
          
          console.log('🔍 System diarization result:', {
            success: systemResult.success,
            textLength: systemResult.text?.length || 0,
            error: systemResult.error,
            textPreview: systemResult.text?.substring(0, 200) + '...'
          });
          
          if (systemResult.success && systemResult.text) {
            console.log('✅ System audio diarization successful');
            console.log('📄 Raw diarization output length:', systemResult.text.length);
            console.log('📄 Raw diarization output preview:', systemResult.text.substring(0, 200) + '...');
            console.log('🚨 CRITICAL DEBUG: Raw systemResult.text:', JSON.stringify(systemResult.text.substring(0, 500)));
            
            console.log('🔍 About to parse system audio for multiple speakers...');
            console.log('📋 System result text contains [SPEAKER_TURN]:', systemResult.text.includes('[SPEAKER_TURN]'));
            console.log('📋 System result text length:', systemResult.text.length);
            console.log('🚨 ENTERING parseTranscriptionForMultipleSpeakers NOW...');
            
            const systemSegments = this.parseTranscriptionForMultipleSpeakers(
              systemResult.text, 
              'system'
            );
            
            console.log('🎙️ Parsed system segments:', systemSegments.length);
            systemSegments.forEach((seg, i) => {
              console.log(`   ${i}: ${seg.speaker} - "${seg.text.substring(0, 50)}..."`);
            });
            
            results.push(...systemSegments);
            
            // Check if we actually got multiple speakers
            const uniqueSpeakers = new Set(systemSegments.map(s => s.speaker));
            console.log(`🎙️ Detected ${uniqueSpeakers.size} unique speakers:`, Array.from(uniqueSpeakers));
            
            // Format multi-speaker output
            const groupedBySpeaker = this.groupSegmentsBySpeaker(systemSegments);
            for (const [speaker, segments] of Object.entries(groupedBySpeaker)) {
              const speakerText = segments.map(s => s.text).join(' ').trim();
              if (speakerText) {
                combinedText += `**${speaker}:**\n${speakerText}\n\n`;
              }
            }
          } else {
            console.warn(`⚠️ System audio diarization failed: ${systemResult.error}`);
            console.log('🔄 Falling back to single-speaker system audio transcription...');
            console.log('🚨 FALLBACK PATH: This is why we\'re getting single speaker output!');
            
            // Fallback to basic transcription without diarization
            const fallbackResult = await this.transcribeFile(systemAudioPath, {
              ...options,
              enableDiarization: false,
              outputFormat: 'txt',
              speakerLabel: systemSpeaker
            });
            
            console.log('🔍 Fallback transcription result:', {
              success: fallbackResult.success,
              textLength: fallbackResult.text?.length || 0,
              textPreview: fallbackResult.text?.substring(0, 200) + '...'
            });
            
            if (fallbackResult.success && fallbackResult.text) {
              console.log('📝 USING FALLBACK RESULT - this creates single speaker output');
              const fallbackSegments = this.parseTranscriptionForSpeakers(
                fallbackResult.text, 
                systemSpeaker,
                'system'
              );
              results.push(...fallbackSegments);
              combinedText += `**${systemSpeaker}:**\n${fallbackResult.text.trim()}\n\n`;
            }
          }
        }
      }
      
      // Transcribe microphone audio (user) with quality detection
      if (microphoneAudioPath && fs.existsSync(microphoneAudioPath)) {
        const micStats = fs.statSync(microphoneAudioPath);
        console.log(`🎤 Transcribing microphone audio: ${microphoneSpeaker}`);
        console.log(`   📁 Microphone audio file: ${microphoneAudioPath} (${micStats.size} bytes)`);
        
        // Check if microphone audio file is too small (likely empty/silent)
        const minAudioSize = 50000; // 50KB minimum for meaningful audio
        if (micStats.size < minAudioSize) {
          console.warn(`⚠️ Microphone audio file too small (${micStats.size} bytes), likely silent - skipping transcription`);
        } else {
          // Perform VAD on microphone audio first
          console.log('🎙️ Performing VAD on microphone audio...');
          const microphoneVAD = await this.performVAD(microphoneAudioPath);
          
          if (!microphoneVAD.hasVoice) {
            console.warn(`⚠️ No voice activity detected in microphone audio (confidence: ${microphoneVAD.confidence.toFixed(2)}) - skipping transcription`);
          } else {
            console.log(`✅ Voice activity detected in microphone audio (confidence: ${microphoneVAD.confidence.toFixed(2)})`);
            
            // Proceed with transcription since VAD passed
            const micResult = await this.transcribeFile(microphoneAudioPath, {
              ...options,
              enableDiarization: false,
              outputFormat: 'txt',
              speakerLabel: microphoneSpeaker
            });
            
            if (micResult.success && micResult.text) {
              // Check for hallucination patterns (repetitive text, common whisper artifacts)
              const cleanedText = micResult.text.trim();
              if (this.isLikelyHallucination(cleanedText)) {
                console.warn(`⚠️ Microphone transcription appears to be hallucination - skipping`);
                console.log(`   Detected pattern: ${cleanedText.substring(0, 100)}...`);
              } else {
                const micSegments = this.parseTranscriptionForSpeakers(
                  cleanedText,
                  microphoneSpeaker,
                  'microphone'
                );
                results.push(...micSegments);
                combinedText += `**${microphoneSpeaker}:**\n${cleanedText}\n\n`;
              }
            } else {
              console.warn(`⚠️ Microphone audio transcription failed: ${micResult.error}`);
            }
          }
        }
      }
      
      // Sort segments by timestamp to create a chronological conversation
      results.sort((a, b) => a.startTime - b.startTime);
      
      // Generate formatted transcript with speaker labels
      const formattedTranscript = combinedText.trim();
      
      // If we didn't get any results from individual streams, provide helpful feedback
      if (formattedTranscript.length === 0) {
        console.warn('⚠️ No transcription results from individual streams');
        console.log('   This could be due to:');
        console.log('   1. Audio files contain no speech');
        console.log('   2. Audio format incompatibility');
        console.log('   3. Very quiet audio levels');
        
        return {
          text: '(No speech detected in individual audio streams. You may want to check audio levels and try again.)',
          success: true,
          speakers: results
        };
      }
      
      console.log(`✅ Dual-stream transcription complete: ${results.length} segments`);
      console.log(`📝 Combined transcript length: ${formattedTranscript.length} characters`);
      
      return {
        text: formattedTranscript,
        success: true,
        speakers: results
      };
      
    } catch (error) {
      console.error('❌ Dual-stream transcription error:', error);
      return {
        text: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Parse transcription output for multiple speakers (advanced diarization)
   */
  private parseTranscriptionForMultipleSpeakers(
    transcriptionText: string,
    streamType: 'system' | 'microphone'
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
        jsonData.segments.slice(0, 3).forEach((segment: any, index: number) => {
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
        
        jsonData.segments.forEach((segment: any) => {
          // whisper.cpp diarization typically provides speaker IDs as numbers
          const speakerId = segment.speaker ?? segment.speaker_id ?? 0;
          
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
  private parseTinydiarizeOutput(text: string): SpeakerSegment[] {
    const segments: SpeakerSegment[] = [];
    
    console.log('🎙️ Parsing tinydiarize [SPEAKER_TURN] markers...');
    
    // Split text by [SPEAKER_TURN] markers
    const parts = text.split(/\[SPEAKER_TURN\]/g);
    
    console.log(`📊 Found ${parts.length} speaker segments from [SPEAKER_TURN] markers`);
    
    parts.forEach((part, index) => {
      const cleanedText = part
        // Remove timestamp patterns
        .replace(/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\]/g, '')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        .trim();
      
      if (cleanedText.length > 10) { // Only include substantial content
        const speakerLabel = `Speaker ${String.fromCharCode(65 + index)}`; // A, B, C, etc.
        
        segments.push({
          speaker: speakerLabel,
          text: cleanedText,
          startTime: 0, // tinydiarize doesn't provide precise timestamps per speaker
          endTime: 0,
          confidence: 0.8 // Assume reasonable confidence for tinydiarize
        });
        
        console.log(`✅ ${speakerLabel}: "${cleanedText.substring(0, 60)}${cleanedText.length > 60 ? '...' : ''}"`);
      }
    });
    
    console.log(`🎙️ Extracted ${segments.length} speaker segments from tinydiarize output`);
    return segments;
  }

  /**
   * Group speaker segments by speaker for organized output
   */
  private groupSegmentsBySpeaker(segments: SpeakerSegment[]): Record<string, SpeakerSegment[]> {
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
  private parseTranscriptionForSpeakers(
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
        jsonData.segments.forEach((segment: any) => {
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
   * Detect likely hallucinations in transcription output
   */
  private isLikelyHallucination(text: string): boolean {
    if (!text || text.length < 10) return true;
    
    // Common hallucination patterns
    const hallucinations = [
      // Repetitive phrases
      /(.{10,})\1{3,}/g, // Same phrase repeated 3+ times
      // Common whisper artifacts
      /\[no speech detected\]/gi,
      /\[BLANK_AUDIO\]/gi,
      /\[inaudible\]/gi,
      // Very repetitive words
      /([\w\s]{1,20})\s+\1\s+\1/gi, // Same short phrase repeated 3+ times
      // Nonsensical repetition
      /thank you\s+(thank you\s+){2,}/gi,
      /(?:the same way that|in the same way that|we're going to help each other).+(?:the same way that|in the same way that|we're going to help each other)/gi
    ];
    
    for (const pattern of hallucinations) {
      if (pattern.test(text)) {
        console.log(`🚫 Detected hallucination pattern: ${pattern}`);
        return true;
      }
    }
    
    // Check for excessive repetition ratio
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = words.length / uniqueWords.size;
    
    if (repetitionRatio > 3) {
      console.log(`🚫 Excessive word repetition detected (ratio: ${repetitionRatio.toFixed(2)})`);
      return true;
    }
    
    return false;
  }

  /**
   * Perform Voice Activity Detection on audio file
   */
  private async performVAD(audioFilePath: string): Promise<{ hasVoice: boolean; confidence: number }> {
    try {
      // Use whisper.cpp with very short duration to quickly check for voice activity
      const vadArgs = [
        '-m', this.getModelPath('tiny'), // Use tiny model for fast VAD
        '-f', audioFilePath,
        '-d', '10000', // Process first 10 seconds for better accuracy
        '--language', 'en', // Specify language for better accuracy
        '--output-txt'
      ];

      console.log('🎙️ Performing Voice Activity Detection with enhanced parameters...');
      const result = await this.runWhisper(vadArgs);
      
      if (result.success && result.stdout) {
        const text = result.stdout.trim();
        console.log(`🔍 VAD raw output: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
        
        // Enhanced VAD logic
        const hasMinimalText = text.length > 5;
        const hasNonHallucination = !this.isLikelyHallucination(text);
        const hasReasonableContent = !/^\s*$/.test(text) && !/^[.,-\s]*$/.test(text);
        
        // Calculate confidence based on multiple factors
        let confidence = 0;
        if (hasMinimalText) confidence += 0.3;
        if (hasNonHallucination) confidence += 0.4;
        if (hasReasonableContent) confidence += 0.3;
        
        // Bonus for longer transcriptions (up to 100 chars)
        confidence += Math.min(text.length / 100, 0.2);
        
        const hasVoice = hasMinimalText && hasNonHallucination && hasReasonableContent;
        
        console.log(`📊 VAD Analysis:`);
        console.log(`   - Text length: ${text.length} chars`);
        console.log(`   - Has minimal text: ${hasMinimalText}`);
        console.log(`   - Non-hallucination: ${hasNonHallucination}`);
        console.log(`   - Reasonable content: ${hasReasonableContent}`);
        console.log(`   - Final result: ${hasVoice ? 'Voice detected' : 'No voice'} (confidence: ${confidence.toFixed(2)})`);
        
        return { hasVoice, confidence };
      }
      
      console.warn('⚠️ VAD got empty result from whisper.cpp');
      return { hasVoice: false, confidence: 0 };
    } catch (error) {
      console.warn('⚠️ VAD failed, assuming voice present:', error);
      return { hasVoice: true, confidence: 0.5 }; // Default to transcribing if VAD fails
    }
  }

  /**
   * Format speaker segments into a readable transcript
   */
  private formatSpeakerTranscript(segments: SpeakerSegment[]): string {
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

  /**
   * Transcribe audio in real-time (streaming)
   * @param audioFilePath Path to the audio file
   * @param onProgress Callback for partial results
   */
  async transcribeStream(
    audioFilePath: string,
    onProgress: (partialText: string) => void,
    options: {
      model?: string;
    } = {}
  ): Promise<TranscriptionResult> {
    try {
      const modelPath = this.getModelPath(options.model || 'base');
      const args = [
        '-m', modelPath,
        '-f', audioFilePath,
        '--output-txt',
        '--print-progress'
      ];

      const result = await this.runWhisperStream(args, onProgress);
      
      return {
        text: result.finalText,
        success: result.success,
        error: result.error
      };
    } catch (error) {
      console.error('Stream transcription error:', error);
      return {
        text: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if whisper.cpp is properly installed and accessible
   */
  async checkInstallation(): Promise<{ installed: boolean; error?: string }> {
    try {
      const result = await this.runWhisper(['--help']);
      return { installed: result.success };
    } catch (error) {
      return {
        installed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Run whisper.cpp command
   */
  private runWhisper(args: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const process = spawn(this.whisperPath, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr
        });
      });

      process.on('error', (error) => {
        resolve({
          success: false,
          stdout,
          stderr: error.message
        });
      });
    });
  }

  /**
   * Run whisper.cpp with streaming output
   */
  private runWhisperStream(
    args: string[],
    onProgress: (partialText: string) => void
  ): Promise<{ success: boolean; finalText: string; error?: string }> {
    return new Promise((resolve) => {
      const process = spawn(this.whisperPath, args);
      let finalText = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const output = data.toString();
        finalText += output;
        
        // Extract partial text and send progress updates
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim() && !line.includes('[') && !line.includes('whisper_')) {
            onProgress(line.trim());
          }
        }
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          finalText: finalText.trim(),
          error: code !== 0 ? stderr : undefined
        });
      });

      process.on('error', (error) => {
        resolve({
          success: false,
          finalText: '',
          error: error.message
        });
      });
    });
  }

  /**
   * Analyze audio file to check if it contains actual audio data
   */
  private async analyzeAudioFile(audioFilePath: string): Promise<{ hasAudio: boolean; info?: string }> {
    try {
      // Use FFmpeg to analyze the audio file if available
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        // Try to use ffmpeg to get audio info
        const ffmpeg = spawn('ffmpeg', ['-i', audioFilePath, '-f', 'null', '-'], {
          stdio: ['ignore', 'ignore', 'pipe']
        });
        
        let stderr = '';
        ffmpeg.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        ffmpeg.on('close', (code: number | null) => {
          // Parse ffmpeg output for audio info
          const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
          const bitrateMatch = stderr.match(/bitrate: (\d+) kb\/s/);
          const audioMatch = stderr.match(/Audio: ([^,]+)/);
          
          if (durationMatch && audioMatch) {
            const duration = parseFloat(durationMatch[1]) * 3600 + parseFloat(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
            const bitrate = bitrateMatch ? parseInt(bitrateMatch[1]) : 0;
            
            console.log(`🎵 Audio analysis: ${duration.toFixed(2)}s, ${audioMatch[1]}, ${bitrate} kb/s`);
            
            resolve({
              hasAudio: duration > 0.1 && bitrate > 0,
              info: `Duration: ${duration.toFixed(2)}s, Format: ${audioMatch[1]}, Bitrate: ${bitrate} kb/s`
            });
          } else {
            // Fallback: just check file size and assume it has audio
            resolve({
              hasAudio: true,
              info: 'Analysis failed, assuming audio present'
            });
          }
        });
        
        ffmpeg.on('error', () => {
          // FFmpeg not available, assume audio is present
          resolve({
            hasAudio: true,
            info: 'FFmpeg not available for analysis'
          });
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          ffmpeg.kill();
          resolve({
            hasAudio: true,
            info: 'Analysis timeout, assuming audio present'
          });
        }, 5000);
      });
    } catch (error) {
      return {
        hasAudio: true,
        info: 'Analysis error, assuming audio present'
      };
    }
  }

  /**
   * Extract duration from whisper output
   */
  private extractDuration(output: string): number | undefined {
    const durationMatch = output.match(/\[(\d+:\d+:\d+\.\d+) --> (\d+:\d+:\d+\.\d+)\]/);
    if (durationMatch) {
      const endTime = durationMatch[2];
      const parts = endTime.split(':');
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return undefined;
  }
}