# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Transcriper** is a sophisticated Electron-based transcription application that captures system audio and provides real-time AI-powered transcription using whisper.cpp. Built with TypeScript, React, and native Swift components for optimal macOS performance.

### ✅ Current Status (v1.9 - System Audio Capture Fully Restored)
- **Dual-Stream Audio Capture**: Simultaneous system audio + microphone recording
- **Advanced Speaker Diarization**: Individual speaker identification using tinydiarize
- **Voice Activity Detection (VAD)**: Performance optimization with quality filtering
- **Local AI Transcription**: whisper.cpp with Apple Silicon GPU acceleration  
- **Intelligent Text Formatting**: Advanced post-processing for readable transcripts
- **Note Management System**: Local storage with CRUD operations and proper transcription linking
- **Modern React UI**: Responsive interface with chat-bubble transcription panel
- **Audio Format Optimization**: Automatic 16kHz resampling for Whisper compatibility
- **Comprehensive Testing**: Jest framework with React Testing Library and extensive test coverage
- **Type Safety**: Unified TypeScript definitions with strict compilation

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
   - Individual speaker identification (Speaker A, B, C, etc.) - [not implemented]
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

# 🚀 Comprehensive Improvement Plan for Transcriper

## Phase 1: Critical Security & ESLint Fixes (Week 1)
**Priority: CRITICAL - Must be done first**

### 1.1 Fix Security Vulnerabilities (Day 1)
- [ ] **brace-expansion ReDoS** (Low severity): Run `npm audit fix` to update
- [ ] **webpack-dev-server vulnerabilities** (Moderate): Requires @electron-forge/plugin-webpack downgrade (breaking change)
  - Decision needed: Accept breaking change or find alternative webpack configuration

### 1.2 Fix Critical ESLint Errors (Day 1-2)
- [ ] **App.tsx:92** - Remove unnecessary escape character in regex: `[.\-[\]]+` → `[.[\]-]+`
- [ ] **index.ts:6** - Replace `require('electron-squirrel-startup')` with proper import
- [ ] **transcriptionManager.ts:968** - Replace `require('child_process')` with import at top

### 1.3 Extract Text Formatting Logic (Day 2-3)
- [ ] Create `src/utils/textFormatter.ts` with:
  - `formatSpeakerTranscribedText()` function (140+ lines from App.tsx:18-160)
  - `formatTranscribedText()` function with comprehensive regex patterns
  - Proper TypeScript interfaces for formatting options
  - Unit tests for all formatting functions

## Phase 2: TypeScript & Type Safety (Week 2)
**Priority: HIGH - Foundation for maintainability**

### 2.1 Remove All `any` Types (Day 1-3)
- [ ] **preload.ts**: Replace 3 `any` types with proper interfaces
- [ ] **transcriptionManager.ts**: Replace 4 `any` types in JSON parsing
- [ ] **useAudioRecording.ts**: Replace `any` type with proper audio interface
- [ ] **Homepage.tsx**: Define proper type for note objects

### 2.2 Add Missing Interfaces (Day 3-4)
- [ ] Create `src/types/audio.ts` for audio-related TypeScript interfaces
- [ ] Create `src/types/transcription.ts` for transcription TypeScript interfaces
- [ ] Add runtime type validation using zod or similar library

### 2.3 Clean Up Unused Variables (Day 4-5)
- [ ] Remove 6 unused variables across multiple files
- [ ] Fix import naming issues in NotepadEditor.tsx

## Phase 3: Architecture & Performance (Week 3-4)
**Priority: MEDIUM - Long-term maintainability**

### 3.1 Modularize TranscriptionManager (Week 3)
- [ ] Split 1046-line file into focused modules:
  - `src/main/transcription/core/` - Core transcription logic
  - `src/main/transcription/speaker/` - Speaker diarization
  - `src/main/transcription/audio/` - Audio analysis & VAD
  - `src/main/transcription/formatters/` - Output formatting

### 3.2 Performance Optimizations (Week 4)
- [ ] Implement caching for model validation results
- [ ] Optimize regex-heavy text processing functions
- [ ] Add streaming support for large audio files
- [ ] Memory usage monitoring and cleanup

### 3.3 Error Handling & Resilience (Week 4)
- [ ] Add React Error Boundaries for component failures
- [ ] Implement comprehensive IPC error handling
- [ ] Add retry mechanisms for failed transcriptions
- [ ] Graceful degradation when models unavailable

## Phase 4: Testing & Quality Assurance (Week 5-6)
**Priority: HIGH - Essential for reliability**

### 4.1 Unit Testing Framework (Week 5)
- [ ] Set up Jest with TypeScript support
- [ ] Create mock audio devices for testing
- [ ] Test text formatting functions (extracted in Phase 1)
- [ ] Test transcription pipeline components

### 4.2 Integration Testing (Week 6)
- [ ] End-to-end audio capture and transcription tests
- [ ] UI component testing with React Testing Library
- [ ] Error scenario testing
- [ ] Cross-platform compatibility verification

## Phase 5: Dependency Updates (Week 7)
**Priority: MEDIUM - After core stability achieved**

### 5.1 Major Version Updates
- [ ] **TypeScript**: 4.5.4 → 5.8.3 (requires migration planning)
- [ ] **ESLint**: 5.62.0 → 8.34.0 (configuration updates needed)
- [ ] **React Types**: Minor updates safe to apply

### 5.2 Development Tooling
- [ ] Update webpack and build tools
- [ ] Ensure compatibility with new TypeScript version
- [ ] Update development scripts

## Risk Assessment & Mitigation

### High Risk Items
1. **TypeScript 5.x migration** - May break existing code
   - Mitigation: Create feature branch, test thoroughly
2. **Webpack dev server fix** - Breaking change required
   - Mitigation: Evaluate if development features are needed

### Success Metrics
- [ ] 0 ESLint errors and warnings
- [ ] 0 security vulnerabilities
- [ ] 100% TypeScript strict mode compliance
- [ ] <200ms audio processing startup time
- [ ] Comprehensive test coverage >80%

**Estimated Timeline: 7 weeks total**
- **Week 1**: Critical fixes (security + ESLint)
- **Week 2**: Type safety improvements  
- **Week 3-4**: Architecture refactoring
- **Week 5-6**: Testing implementation
- **Week 7**: Dependency updates

## ✅ Phase 6: System Audio Capture & Speaker Diarization (RESTORED)
**Status: ✅ COMPLETED and RESTORED in v1.9**

### 🔧 Critical System Audio Capture Fix (v1.9)
After Phase 6 completion, system audio capture with headphones stopped working due to missing Electron configuration. **Issue fully resolved:**

- [x] **Root Cause Identified**: Missing `setDisplayMediaRequestHandler` with `audio: 'loopback'` configuration
- [x] **Electron Configuration Restored**: Added proper display media handler for system audio capture
- [x] **getDisplayMedia() API Fixed**: Now successfully captures system audio with headphones (AirPods, etc.)
- [x] **VAD Issues Resolved**: Disabled overly aggressive Voice Activity Detection that was blocking real speech
- [x] **Tinydiarize Model Verified**: Confirmed `ggml-small.en-tdrz.bin` (487MB) properly configured for speaker separation
- [x] **Full Dual-Stream Working**: Both system audio + microphone capture working simultaneously
- [x] **Speaker Identification**: Successfully detecting multiple speakers with `[SPEAKER_TURN]` markers

### 🔧 Technical Details of the Fix
**Files Modified:**
- `src/index.ts`: Restored `setDisplayMediaRequestHandler` with `audio: 'loopback'` configuration
- `src/hooks/useAudioRecording.ts`: Updated to use Electron 36.4.0 compatible approach
- `src/main/transcription/audio/analyzer.ts`: Temporarily disabled aggressive VAD
- `package.json`: Upgraded Electron from 25.9.8 to 36.4.0

**Key Configuration Restored:**
```typescript
mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
  callback({ 
    video: mainWindow.webContents.mainFrame, 
    audio: 'loopback' 
  });
});
```

**Result:** System audio now captures successfully with `getDisplayMedia({ audio: true, video: false })` even with headphones connected.

### ✅ 6.1 Fix Transcription-Note Association Bug (COMPLETED)
- [x] **Investigated Current Issue**: Fixed transcriptions appearing in all notes instead of specific meetings
- [x] **Implemented Note-Specific Transcription Storage**
  - [x] Linked transcriptions to specific note IDs in data model
  - [x] Updated data model to store transcription-note associations properly
  - [x] Modified transcription panel to only show current note's transcriptions
- [x] **Updated Storage Architecture**
  - [x] Implemented separate transcription storage per note
  - [x] Added transcription metadata (note ID, timestamp, session info)
  - [x] Added transcription cleanup methods for when notes are deleted

### ✅ 6.2 Enhanced Note Management & Testing (COMPLETED)
- [x] **Chat-Bubble UI for Speaker Diarization**
  - [x] Implemented Granola-style chat bubbles for speaker-identified transcriptions
  - [x] Added visual distinction between different speakers
  - [x] Created fallback to traditional segments for non-speaker content
- [x] **Comprehensive Testing Framework**
  - [x] Set up Jest with TypeScript support and React Testing Library
  - [x] Created extensive test suites for note management and transcription linking
  - [x] Added tests for localStorage serialization/deserialization
  - [x] Implemented test coverage for critical functionality
- [x] **TypeScript Compilation Fixes**
  - [x] Unified TranscriptionOptions interfaces across codebase
  - [x] Fixed model type assertions and removed duplicate interfaces
  - [x] Removed unsupported API properties while maintaining extensibility
  - [x] Cleaned up unused props and linting warnings

## Phase 7: LLM-Based Meeting Enhancement System (Week 9-12)
**Priority: MEDIUM - Advanced Feature - Requires Extensive Planning**

### 7.1 LLM Integration Architecture (Week 9)
- [ ] **Qwen 2-7B Q4_K_M Model Integration**
  - Research local deployment options (llama.cpp, Ollama, etc.)
  - Set up model loading and inference pipeline
  - Implement memory-efficient model management
  - Add model download and validation system

### 7.2 Prompt Template System (Week 10)
- [ ] **Custom Prompt Template Engine**
  - Create template system for different meeting types
  - Support variable injection (notes, transcription, meeting type)
  - Template editor UI for advanced users
  - Default templates for common meeting scenarios
- [ ] **Context Management**
  - Combine user notes + transcription + meeting type as context
  - Implement context length management (chunking for long meetings)
  - Smart context prioritization (recent content, key points)

### 7.3 Meeting Enhancement Features (Week 11)
- [ ] **Summarization Pipeline**
  - Generate meeting summaries based on transcription + notes
  - Key points extraction and highlighting
  - Action items identification and formatting
  - Decision tracking and outcomes summary
- [ ] **Note Enhancement Options**
  - Grammar and clarity improvements
  - Professional formatting suggestions
  - Missing information detection
  - Follow-up recommendations

### 7.4 LLM Processing UI & Controls (Week 12)
- [ ] **Processing Interface**
  - Progress indicators for LLM processing
  - Cancel/abort long-running operations
  - Batch processing for multiple notes
  - Quality indicators for generated content
- [ ] **Review & Edit System**
  - Side-by-side comparison (original vs enhanced)
  - Selective application of suggestions
  - Undo/redo for LLM enhancements
  - User feedback collection for model improvement

### 7.5 Advanced LLM Features (Future)
- [ ] **Meeting Type-Specific Processing**
  - Custom prompts per meeting type
  - Role-based analysis (participant identification)
  - Industry-specific terminology and formatting
- [ ] **Multi-Session Analysis**
  - Connect related meetings over time
  - Project/client-based context awareness
  - Long-term relationship and decision tracking

## Risk Assessment for New Features

### High Risk Items
1. **LLM Model Size & Performance** - 7B model may be too large for some systems
   - Mitigation: Offer smaller model options
2. **Transcription-Note Linking Migration** - No critical existing data at the moment, so no migration need.
3. **Privacy Concerns with LLM Processing** - Sensitive meeting data
   - Mitigation: Local-only processing

### Success Metrics for New Phases
- [ ] 100% transcription-note association accuracy
- [ ] <30s LLM processing time for typical meetings
- [ ] >90% user satisfaction with generated summaries
- [ ] Zero data leakage between unrelated notes

**Updated Estimated Timeline: 11 weeks remaining**
- **Week 1-7**: Core stability and architecture (planned for future)
- **✅ Week 8**: Transcription-note linking fixes (COMPLETED)
- **Week 9-12**: LLM-based meeting enhancement system (NEXT PHASE)

---

## 🎯 Legacy Roadmap: Code Quality & Stability (Priority: HIGH)
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

### Audio Quality Improvements
- [ ] **Audio Preprocessing Pipeline**
  - Implement noise reduction using Web Audio API
  - Add automatic gain control for consistent levels
  - Create audio quality indicators and warnings
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
- [x] **Unit Testing Framework**
  - [x] Set up Jest configuration for comprehensive testing
  - [x] Create mock audio devices for testing
  - [x] Implement audio processing pipeline tests
  - [x] Add transcription accuracy validation tests

- [x] **Integration Testing**
  - [x] UI component integration testing with React Testing Library
  - [x] Error handling scenario testing
  - [ ] End-to-end audio capture and transcription tests
  - [ ] Cross-platform compatibility testing

- [ ] **Performance Testing**
  - Memory leak detection and prevention
  - Long-running session stability tests
  - Audio quality degradation monitoring
  - Load testing for multiple concurrent transcriptions

## 📚 Phase 8: Documentation & Polish (Priority: MEDIUM)
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