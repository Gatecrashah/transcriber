export const LANGUAGE_MAPPINGS: Record<string, string> = {
  'english': 'en',
  'spanish': 'es', 
  'french': 'fr',
  'german': 'de',
  'italian': 'it',
  'portuguese': 'pt',
  'russian': 'ru',
  'japanese': 'ja',
  'chinese': 'zh',
  'korean': 'ko'
};

export function mapLanguageCode(detectedLanguage: string): string {
  return LANGUAGE_MAPPINGS[detectedLanguage.toLowerCase()] || detectedLanguage || 'en';
}