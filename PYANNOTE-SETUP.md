# Pyannote Speaker Diarization Setup

This document explains how to set up and use the enhanced speaker diarization capabilities with pyannote.audio.

## 🎯 Benefits Over Tinydiarize

- **Advanced Speaker Clustering**: Actual speaker identification and consistent labeling
- **Higher Accuracy**: State-of-the-art neural models with better speaker separation
- **Rich Metadata**: Confidence scores, precise timestamps, speaker embeddings
- **Multilingual Support**: Works with any language (not just English)
- **Active Development**: Regular updates and improvements

## 📋 Prerequisites

### 1. Python Dependencies

Install the required Python packages:

```bash
pip install pyannote.audio torch
```

### 2. Hugging Face Authentication

1. Create a Hugging Face account at https://huggingface.co/
2. Get your access token from https://huggingface.co/settings/tokens
3. Copy `.env.example` to `.env` and add your token:

```bash
cp .env.example .env
# Edit .env and add your token:
HUGGINGFACE_TOKEN=your_token_here
```

### 3. Test Installation

Run the test script to verify everything is set up correctly:

```bash
node test-pyannote.js
```

## 🚀 Usage

### Enable Pyannote in Transcription

The pyannote integration works alongside the existing tinydiarize system. To use pyannote:

1. Ensure all prerequisites are met
2. Set `usePyannote: true` in transcription options
3. The system will automatically fall back to tinydiarize if pyannote fails

### Code Example

```typescript
const result = await transcriptionManager.transcribeFile(audioPath, {
  enableDiarization: true,
  usePyannote: true, // Enable pyannote
  language: 'en'
});

// Result will include enhanced speaker segments
if (result.speakers) {
  result.speakers.forEach(segment => {
    console.log(`${segment.speaker}: ${segment.text}`);
  });
}
```

## 🔧 How It Works

### Integration Architecture

1. **Dual Processing**: Pyannote runs speaker diarization while Whisper transcribes
2. **Timing Alignment**: Transcription segments are matched to speaker segments by time overlap
3. **Graceful Fallback**: If pyannote fails, the system falls back to tinydiarize
4. **Enhanced Output**: Better speaker identification with consistent labeling

### Processing Pipeline

```
Audio File → Pyannote Diarization → Speaker Segments
           → Whisper Transcription → Text Segments
                                  ↓
                            Timing Alignment
                                  ↓
                          Enhanced Speaker Text
```

## 🔍 Troubleshooting

### Common Issues

1. **"pyannote.audio not available"**
   - Install with: `pip install pyannote.audio`

2. **"PyTorch not available"**
   - Install with: `pip install torch`

3. **"Auth token not configured"**
   - Create `.env` file with `HUGGINGFACE_TOKEN=your_token`

4. **"Processing timeout"**
   - Large audio files may take several minutes
   - Default timeout is 5 minutes

### Debug Information

The system provides detailed logging:
- `🎙️ Starting pyannote.audio speaker diarization...`
- `✅ Pyannote identified X speakers in Y segments`
- `🔗 Combining pyannote segments with transcription`

## 📊 Performance Considerations

- **GPU Acceleration**: Pyannote can use CUDA/MPS for faster processing
- **Memory Usage**: Larger models require more RAM
- **Processing Time**: 2-5x slower than tinydiarize but much more accurate
- **File Size**: Works best with audio files under 100MB

## 🔄 Fallback Strategy

The system uses a robust fallback hierarchy:

1. **Primary**: Pyannote speaker diarization + Whisper transcription
2. **Secondary**: Tinydiarize parsing if pyannote fails
3. **Tertiary**: Single speaker mode if all diarization fails

This ensures transcription always works, even if advanced features fail.

## 🛠️ Development Branch

This feature is currently on the `feature/pyannote-speaker-diarization` branch.

### Files Added/Modified

- `src/main/transcription/speaker/pyannote-diarization.py` - Python script
- `src/main/transcription/speaker/pyannote-integration.ts` - Node.js integration
- `src/main/transcription/speaker/diarization.ts` - Enhanced with pyannote
- `src/main/transcription/transcriptionManager.ts` - Added pyannote support
- `.env.example` - Environment template
- `test-pyannote.js` - Test script

### Testing

To test the integration:

1. Run `node test-pyannote.js` to check setup
2. Use the enhanced transcription with `usePyannote: true`
3. Monitor console logs for detailed processing information

## 🎯 Next Steps

1. **Install Dependencies**: Follow the prerequisites section
2. **Test Setup**: Run the test script
3. **Configure Authentication**: Add your Hugging Face token
4. **Test with Audio**: Try transcribing a multi-speaker audio file
5. **Monitor Performance**: Check processing times and accuracy