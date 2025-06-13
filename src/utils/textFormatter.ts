/**
 * Text formatting utilities for transcription processing
 * Extracted from App.tsx for better maintainability and testing
 */

export interface FormattingOptions {
  preserveSpeakerLabels?: boolean;
  enableParagraphBreaks?: boolean;
  maxSentencesPerParagraph?: number;
}

/**
 * Format speaker-identified transcribed text while preserving speaker labels
 */
export const formatSpeakerTranscribedText = (text: string): string => {
  if (!text) return '';
  
  console.log('Formatting speaker transcription:', text);
  
  // Split by speaker sections (marked with **Speaker Name:**)
  const sections = text.split(/(\*\*[^*]+:\*\*)/);
  
  let formattedText = '';
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    
    // Check if this is a speaker label
    if (section.match(/^\*\*[^*]+:\*\*$/)) {
      if (formattedText) formattedText += '\n\n';
      formattedText += section + '\n';
    } else if (section.trim()) {
      // This is content for the current speaker - clean it up
      const cleanedContent = section
        // Remove timestamp patterns
        .replace(/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\]/g, '')
        // Remove BLANK_AUDIO markers
        .replace(/\[BLANK_AUDIO\]/gi, '')
        // Remove [inaudible] markers  
        .replace(/\[inaudible\]/gi, '')
        // Remove excessive whitespace
        .replace(/\s+/g, ' ')
        .trim();
        
      if (cleanedContent) {
        formattedText += cleanedContent + '\n';
      }
    }
  }
  
  return formattedText.trim();
};

/**
 * Format transcribed text for better readability
 */
export const formatTranscribedText = (text: string, options: FormattingOptions = {}): string => {
  if (!text) return '';
  
  const {
    enableParagraphBreaks = true,
    maxSentencesPerParagraph = 3
  } = options;
  
  console.log('Original transcription:', text);
  
  // First pass: Remove ANSI color codes and timestamp artifacts
  let formatted = text
    // Remove ANSI color codes like [38;5;160m, [0m, [38;5;227m, etc.
    .replace(/\[[0-9;]+m/g, '')                          // All ANSI color codes
    
    // Remove ALL number-bracket timestamp patterns more aggressively
    .replace(/\b[0-9]+\s+[0-9]+\]\s*/g, '')              // "000 880]", "880 240]", etc.
    .replace(/[0-9]{2,}\s+[0-9]{2,}\]\s*/g, '')          // 2+ digit numbers with brackets
    .replace(/^[0-9]+\s+[0-9]+\]\s*/gm, '')              // At start of line
    .replace(/\s*[0-9]+\s+[0-9]+\]\s*/g, ' ')            // In middle of text with cleanup
    .replace(/^\s*[0-9]+\s+[0-9]+\]/gm, '')              // Start of line without trailing space
    
    // Remove subtitle-style timestamps completely
    .replace(/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\]/g, '') // Complete pattern
    .replace(/\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}/g, '') // Without closing bracket
    .replace(/[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}/g, '') // Without brackets 
    
    // Remove common transcription artifacts  
    .replace(/\[\s*BLANK_AUDIO\s*\]/gi, '')              // "[BLANK_AUDIO]"
    .replace(/\[\s*LANK_UDIO\s*\]?/gi, '')               // Partial "[LANK_UDIO" fragments
    .replace(/\[\s*B?LANK_?A?UDIO\s*\]?/gi, '')          // Various fragments like [LANK_UDIO
    .replace(/\[\s*inaudible\s*\]/gi, '')                // "[inaudible]"
    .replace(/\(speaking in foreign language\)/gi, '')
    .replace(/SPEAKER_[0-9A-Z]+:\s*/gi, '')
    .replace(/Speaker\s*[0-9A-Z]*:\s*/gi, '')
    
    // Clean up isolated dashes and punctuation artifacts
    .replace(/\s*-\.\s*/g, ' ')                          // "- ." patterns
    .replace(/^\s*[.[\]-]+\s*/g, '')                  // Leading punctuation
    .replace(/\s*[.[\]-]+\s*$/g, '')                  // Trailing punctuation  
    .replace(/\s*[.-]+\s+/g, ' ')                      // Isolated dots and dashes
    .replace(/\[\s*\]/g, '')                             // Empty brackets
    
    // Aggressive whitespace cleanup
    .replace(/[\t\r\n\f\v]+/g, ' ')                      // All whitespace types to space
    .replace(/\s{2,}/g, ' ')                             // Multiple spaces to single space  
    .replace(/\u00A0+/g, ' ')                            // Non-breaking spaces
    .replace(/\u2000-\u200B/g, ' ')                      // Various Unicode spaces
    .trim();

  // Second pass: Improve sentence structure and punctuation
  formatted = formatted
    // Fix missing periods between sentences (lowercase followed by capital)
    .replace(/([a-z])\s+([A-Z][a-z])/g, '$1. $2')
    // Fix periods followed by lowercase
    .replace(/\.\s*([a-z])/g, (_, letter) => '. ' + letter.toUpperCase())
    // Add periods to sentences that end without punctuation
    .replace(/([a-z])\s+(And|But|So|Then|Now|Well|Actually|However|Therefore)\s/g, '$1. $2 ')
    .replace(/([a-z])\s+(The|This|That|We|I|You|They|He|She|It)\s/g, '$1. $2 ')
    // Clean up multiple punctuation
    .replace(/[.]{2,}/g, '.')
    .replace(/[,]{2,}/g, ',')
    .replace(/[!]{2,}/g, '!')
    .replace(/[?]{2,}/g, '?')
    // Fix spacing around punctuation
    .replace(/\s+([.!?])/g, '$1')
    .replace(/([.!?])\s*([a-zA-Z])/g, '$1 $2')
    // Remove trailing punctuation artifacts
    .replace(/^[^\w]*/, '')
    .replace(/[^\w.!?]*$/, '');

  // Third pass: Split into proper sentences and format as readable paragraphs
  if (enableParagraphBreaks && formatted.length > 0) {
    // Ensure first letter is capitalized
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    
    // Split into sentences
    const sentences = formatted.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Group sentences into paragraphs
    const paragraphs = [];
    for (let i = 0; i < sentences.length; i += maxSentencesPerParagraph) {
      const paragraphSentences = sentences.slice(i, i + maxSentencesPerParagraph);
      const paragraph = paragraphSentences
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join('. ') + '.';
      
      if (paragraph.length > 1) {
        paragraphs.push(paragraph);
      }
    }
    
    // Join paragraphs with double line breaks for better readability
    formatted = paragraphs.join('\n\n');
  }
  
  // Final aggressive cleanup - remove any remaining multiple spaces
  formatted = formatted
    .replace(/\s{3,}/g, ' ')  // Replace 3+ spaces with single space first
    .replace(/\s{2,}/g, ' ')  // Then replace 2+ spaces with single space
    .replace(/\s+/g, ' ')     // Final cleanup for any remaining multiple spaces
    .replace(/\u00A0+/g, ' ') // Remove non-breaking spaces at the end too
    .trim();
  
  console.log('Formatted transcription:', formatted);
  return formatted;
};

/**
 * Remove common transcription artifacts and noise
 */
export const cleanTranscriptionArtifacts = (text: string): string => {
  return text
    .replace(/\[BLANK_AUDIO\]/gi, '')
    .replace(/\[inaudible\]/gi, '')
    .replace(/\(speaking in foreign language\)/gi, '')
    .replace(/SPEAKER_[0-9A-Z]+:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Extract timestamps from transcription text
 */
export const extractTimestamps = (text: string): string[] => {
  const timestampPattern = /\[[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\s*-->\s*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}\]/g;
  return text.match(timestampPattern) || [];
};

/**
 * Count words in cleaned text
 */
export const countWords = (text: string): number => {
  const cleaned = cleanTranscriptionArtifacts(text);
  return cleaned.split(/\s+/).filter(word => word.length > 0).length;
};