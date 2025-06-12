# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Transcriper** is a sophisticated Electron-based transcription application that captures system audio and provides real-time AI-powered transcription using whisper.cpp. Built with TypeScript, React, and native Swift components for optimal macOS performance.

### ✅ Current Status (v1.7 - Advanced Speaker Diarization Complete)
- **Dual-Stream Audio Capture**: Simultaneous system audio + microphone recording
- **Advanced Speaker Diarization**: Individual speaker identification using tinydiarize
- **Voice Activity Detection (VAD)**: Performance optimization with quality filtering
- **Local AI Transcription**: whisper.cpp with Apple Silicon GPU acceleration  
- **Intelligent Text Formatting**: Advanced post-processing for readable transcripts
- **Note Management System**: Local storage with CRUD operations
- **Modern React UI**: Responsive interface with transcription panel
- **Audio Format Optimization**: Automatic 16kHz resampling for Whisper compatibility

## Key Architecture

### Core Components
- **Main Process**: `src/index.ts` - Electron main process with security configurations
- **Renderer Process**: `src/renderer-react.tsx` - React application entry point
- **Preload Script**: `src/preload.ts` - Secure IPC bridge with contextIsolation
- **Swift Audio Capture**: `src/native/swift/` - Native macOS audio capture utility
- **Whisper Integration**: `src/native/whisper/whisper.cpp/` - Local AI transcription engine

### Audio Processing Pipeline
1. **Dual-Stream Audio Capture** (`src/hooks/useAudioRecording.ts`)
   - Simultaneous getDisplayMedia() + getUserMedia() capture
   - Synchronized MediaRecorder instances for system audio and microphone
   - Real-time audio level monitoring with Web Audio API AnalyserNodes
   - Automatic format conversion and 48kHz → 16kHz resampling

2. **Voice Activity Detection** (`src/main/transcription/transcriptionManager.ts`)
   - Pre-transcription VAD using whisper.cpp tiny model
   - Quality-based confidence scoring and silence detection
   - Hallucination pattern recognition and filtering
   - Performance optimization by skipping silent segments

3. **Advanced Speaker Diarization** (`src/main/transcription/transcriptionManager.ts`)
   - Tinydiarize model integration for mono audio speaker separation
   - [SPEAKER_TURN] marker parsing for speaker change detection
   - Individual speaker identification (Speaker A, B, C, etc.)
   - Robust fallback mechanisms with enhanced error handling

4. **AI Transcription Engine** (`src/main/transcription/transcriptionManager.ts`)
   - whisper.cpp integration with model validation
   - Apple Silicon Metal GPU acceleration
   - Multiple model support (tiny, base, small, medium, large-v3, tinydiarize)
   - Automatic model downloading and integrity validation

### State Management
- **Audio Recording**: `src/hooks/useAudioRecording.ts` - Recording state and controls
- **Transcription**: `src/hooks/useTranscription.ts` - AI processing and results
- **Note Management**: `src/hooks/useNoteManagement.ts` - Local storage operations

## Development Commands

- `npm start` - Start the application in development mode with hot reload
- `npm run lint` - Run ESLint on TypeScript files  
- `npm run package` - Package the application for distribution
- `npm run make` - Create distributable installers for the current platform
- `npm run publish` - Publish the application

### Build Requirements
- **macOS**: Required for Swift audio capture compilation
- **Node.js**: 18+ for Electron compatibility
- **Xcode**: For Swift compilation
- **CMake**: For whisper.cpp compilation
- **Tinydiarize Model**: 465MB model automatically downloaded via `download-tinydiarize-model.sh`

### Speaker Diarization Setup
To enable advanced speaker identification:
```bash
cd src/native/whisper/whisper.cpp/models
./download-tinydiarize-model.sh
```
This downloads the small.en-tdrz model (465MB) for mono audio speaker separation.

## Build Configuration

- **Electron Forge**: WebpackPlugin for bundling and distribution
- **TypeScript**: Strict compilation with ES2020 target
- **Security**: ASAR encryption, context isolation, node integration disabled
- **Multi-platform**: Support for macOS (primary), Windows, Linux
- **Native Dependencies**: Swift utilities, whisper.cpp C++ library

## Security Configuration

The application has several security features enabled via Electron Fuses:
- ASAR integrity validation
- Cookie encryption
- Node.js integration disabled in renderer
- App only loads from ASAR in production
- Context isolation enabled for IPC security
- Secure permission handling for media access

---

# 🚀 Development Roadmap & TODO List

## 🎯 Phase 1: Code Quality & Stability (Priority: HIGH)
**Timeline: 2-3 weeks**

### Technical Debt Resolution
- [ ] **Extract Text Formatting Logic** 
  - Move complex regex patterns from `App.tsx:18-120` to `src/utils/textFormatter.ts`
  - Create unit tests for all formatting rules
  - Add support for different formatting styles

- [ ] **Implement Comprehensive Error Handling**
  - Create error boundary components for React
  - Standardize IPC error handling patterns
  - Add retry mechanisms for failed transcriptions
  - Implement graceful degradation when models unavailable

- [ ] **Enhance TypeScript Type Safety**
  - Remove all `any` types from audio interfaces
  - Create proper type definitions for native audio responses  
  - Add strict typing for IPC communication
  - Implement runtime type validation

- [ ] **Memory Management Improvements**
  - Fix audio level monitoring cleanup
  - Implement garbage collection for old transcriptions
  - Add memory usage monitoring and warnings

### Configuration Management
- [ ] **Centralized Configuration System**
  - Create `src/config/` directory structure
  - Move hard-coded paths to configuration files
  - Add environment-specific configurations
  - Implement configuration validation

## ✅ Phase 2: Dual Audio Capture & Speaker Diarization (COMPLETED)
**Status: ✅ COMPLETED in v1.7**

### ✅ Dual-Stream Audio Capture Implementation
- [x] **Simultaneous Audio Capture**
  - [x] Implemented simultaneous `getDisplayMedia()` + `getUserMedia()` capture
  - [x] Created dual MediaRecorder instances with synchronized timestamps
  - [x] Added audio stream mixing for combined transcription output
  - [x] Maintained separate channels for speaker identification
  - [x] Added fallback handling when one stream fails
  - [x] Updated UI to show both audio sources are active

### ✅ Advanced Speaker Diarization Implementation
- [x] **Tinydiarize Integration**
  - [x] Downloaded and integrated tinydiarize model (small.en-tdrz, 465MB)
  - [x] Implemented `--tinydiarize` flag support for mono audio diarization
  - [x] Added [SPEAKER_TURN] marker parsing for speaker change detection
  - [x] Created speaker labeling system (Speaker A, Speaker B, Speaker C, etc.)

- [x] **Voice Activity Detection (VAD)**
  - [x] Implemented pre-transcription VAD using whisper.cpp tiny model
  - [x] Added quality-based confidence scoring and silence detection
  - [x] Created hallucination pattern recognition and filtering
  - [x] Optimized performance by skipping silent/low-quality segments

- [x] **Enhanced Error Handling**
  - [x] Added comprehensive fallback mechanisms
  - [x] Implemented robust model validation and integrity checking
  - [x] Created detailed diagnostic logging for troubleshooting
  - [x] Added automatic model downloading with download-tinydiarize-model.sh

### 🎯 Next Phase: Advanced Speaker Management
- [ ] **Enhanced Speaker Features**
  - [ ] Allow custom speaker names/labels (replace Speaker A/B/C with real names)
  - [ ] Implement speaker voice profile learning for better consistency
  - [ ] Add speaker timeline visualization in UI
  - [ ] Export speaker-separated transcriptions to different formats

- [ ] **UI Enhancements for Diarization**
  - [ ] Add speaker color coding in transcription display
  - [ ] Implement speaker filtering/hiding options
  - [ ] Create speaker statistics panel showing talk time
  - [ ] Add speaker confidence indicators

### Audio Quality Improvements
- [ ] **Audio Preprocessing Pipeline**
  - Implement noise reduction using Web Audio API
  - Add automatic gain control for consistent levels
  - Create audio quality indicators and warnings
  - Add support for different audio input sources

- [ ] **Advanced Audio Features**
  - Real-time audio visualization during recording
  - Audio waveform display for transcription segments
  - Support for multiple audio formats beyond WAV
  - Implement audio compression for storage efficiency

## ⚡ Phase 3: Performance & User Experience (Priority: MEDIUM)
**Timeline: 3-4 weeks**

### Performance Optimizations
- [ ] **Streaming Audio Processing**
  - Replace file-based processing with streaming
  - Implement real-time transcription as audio is captured
  - Add progressive transcription display
  - Optimize for long recording sessions

- [ ] **Background Processing System**
  - Create transcription queue system
  - Implement non-blocking UI during processing
  - Add progress indicators for long transcriptions
  - Enable concurrent transcription of multiple files

- [ ] **Model and Resource Optimization**
  - Implement model caching and preloading
  - Add model switching without app restart
  - Optimize whisper.cpp compilation for Apple Silicon
  - Create model download and management system

### User Experience Enhancements
- [ ] **Advanced Recording Controls**
  - Implement global keyboard shortcuts
  - Add system tray integration with quick controls
  - Create notification system for transcription completion
  - Add one-click recording start/stop from menu bar

- [ ] **Enhanced Note Management**
  - [ ] **Search and Organization**
    - Implement full-text search across all notes
    - Add tags and categories for notes
    - Create date-based filtering and sorting
    - Add note templates and formatting options
  
  - [ ] **Data Management**
    - Implement note backup and restore functionality
    - Add multiple export formats (PDF, Word, Markdown)
    - Create note sharing via secure links
    - Add version history for notes

## 🔒 Phase 4: Security & Data Protection (Priority: MEDIUM)
**Timeline: 2-3 weeks**

### Data Security
- [ ] **Audio Data Protection**
  - Implement encryption for stored audio files
  - Add secure deletion of temporary files
  - Create user-controlled data retention policies
  - Add option to disable audio file storage

- [ ] **Privacy Enhancements**
  - Implement local-only processing guarantees
  - Add privacy mode with automatic cleanup
  - Create data export tools for user control
  - Add opt-in analytics with privacy protection

### Enhanced Security
- [ ] **Process Isolation**
  - Enhanced sandboxing for audio processing
  - Secure IPC validation and sanitization
  - Limited file system access controls
  - Implement secure update mechanisms

## 🧪 Phase 5: Testing & Quality Assurance (Priority: HIGH)
**Timeline: 2-3 weeks**

### Test Infrastructure
- [ ] **Unit Testing Framework**
  - Set up Jest configuration for comprehensive testing
  - Create mock audio devices for testing
  - Implement audio processing pipeline tests
  - Add transcription accuracy validation tests

- [ ] **Integration Testing**
  - End-to-end audio capture and transcription tests
  - UI component integration testing with React Testing Library
  - Error handling scenario testing
  - Cross-platform compatibility testing

- [ ] **Performance Testing**
  - Memory leak detection and prevention
  - Long-running session stability tests
  - Audio quality degradation monitoring
  - Load testing for multiple concurrent transcriptions

## 📚 Phase 6: Documentation & Polish (Priority: MEDIUM)
**Timeline: 1-2 weeks**

### User Documentation
- [ ] **User Guides**
  - Complete installation and setup instructions
  - Create troubleshooting guides
  - Add privacy and security documentation
  - Write feature tutorials and best practices

### Developer Documentation
- [ ] **Technical Documentation**
  - Complete API documentation for IPC interfaces
  - Audio processing pipeline documentation
  - Architecture overview and design decisions
  - Contributing guidelines and development setup

---

# 🎨 Future Enhancement Ideas (Phase 7+)

## Advanced AI Features
- [ ] **Multi-language Support**: Automatic language detection and switching
- [ ] **Custom Vocabulary**: Domain-specific terminology training
- [ ] **Sentiment Analysis**: Emotion and tone detection in transcriptions
- [ ] **Meeting Insights**: Automatic action items and summary generation

## Collaboration Features  
- [ ] **Real-time Collaboration**: Multiple users in same transcription session
- [ ] **Comment System**: Annotations and discussions on transcriptions
- [ ] **Team Workspaces**: Shared note collections with permissions
- [ ] **Integration APIs**: Connect with popular productivity tools

## Mobile and Cross-platform
- [ ] **Mobile Companion App**: Remote control and basic transcription
- [ ] **Web Interface**: Browser-based access to notes and transcriptions
- [ ] **Cloud Sync**: Optional cloud storage with end-to-end encryption
- [ ] **API Ecosystem**: Third-party integrations and plugins

---

# 🔧 Development Guidelines

## Code Standards
- **TypeScript**: Strict mode enabled, no `any` types allowed
- **React**: Functional components with hooks, proper error boundaries
- **Security**: All IPC communication must be validated and sanitized
- **Performance**: Audio processing should not block UI thread
- **Testing**: All new features require corresponding tests

## Audio Processing Principles
- **16kHz Compatibility**: Ensure all audio is resampled for Whisper
- **Dual-Stream Architecture**: Maintain separate system and microphone channels
- **Speaker Diarization**: Use tinydiarize for mono audio speaker separation
- **Voice Activity Detection**: Pre-filter audio to optimize transcription performance
- **Quality Preservation**: Maintain audio fidelity during processing
- **Memory Efficiency**: Stream large audio files, avoid loading entirely
- **Error Recovery**: Graceful handling of audio device failures

## Privacy by Design
- **Local Processing**: All transcription happens locally by default
- **User Control**: Clear options for data retention and deletion
- **Transparency**: Users must understand what data is stored where
- **Minimal Data**: Only store what's necessary for functionality