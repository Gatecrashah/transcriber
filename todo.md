# Local Transcription App Implementation Plan

> **Important Note**: We should start with building a basic UI that enables us to first test audio recording and transcription functionality before implementing advanced features. This will allow us to validate the core pipeline early in development.

## Project Foundation
- [ ] Step 1: Initialize Electron Project Structure
  - **Task**: Set up the basic Electron application with TypeScript support, build configuration, and development environment. Configure package.json with necessary scripts and dependencies for Electron, TypeScript, and build tools.
  - **Files**: (8 files)
    - `package.json`: Main package configuration with Electron and TypeScript dependencies
    - `tsconfig.json`: TypeScript configuration for both main and renderer processes
    - `electron-builder.yml`: Build configuration for macOS packaging
    - `src/main/main.ts`: Main Electron process entry point
    - `src/renderer/index.html`: Basic HTML template for renderer
    - `src/renderer/renderer.ts`: Renderer process entry point
    - `webpack.config.js`: Webpack configuration for building renderer process
    - `.gitignore`: Git ignore file for node_modules, dist, etc.
  - **Step Dependencies**: None
  - **User Instructions**: Run `npm install` to install dependencies

- [ ] Step 2: Set up Development Environment and Build System
  - **Task**: Configure development scripts, hot reload for renderer process, and ensure proper Electron security practices. Set up the build pipeline for both development and production.
  - **Files**: (4 files)
    - `src/main/preload.ts`: Preload script for secure IPC communication
    - `scripts/dev.js`: Development server script with hot reload
    - `src/main/menu.ts`: Application menu configuration for macOS
    - `src/types/electron.d.ts`: TypeScript definitions for IPC types
  - **Step Dependencies**: Step 1
  - **User Instructions**: Test development environment with `npm run dev`

## Audio Infrastructure
- [ ] Step 3: Implement CoreAudio Native Bindings
  - **Task**: Create native Node.js addon using node-gyp to interface with macOS CoreAudio API. Implement audio device enumeration, permission requests, and basic audio capture functionality using the new macOS 14.4 APIs.
  - **Files**: (6 files)
    - `binding.gyp`: Node-gyp build configuration
    - `src/native/coreaudio.cc`: C++ implementation for CoreAudio integration
    - `src/native/coreaudio.h`: Header file for CoreAudio wrapper
    - `src/main/audio/audioManager.ts`: TypeScript wrapper for native audio functions
    - `src/main/audio/permissions.ts`: Handle macOS audio permissions
    - `package.json`: Add node-gyp and native build dependencies
  - **Step Dependencies**: Step 2
  - **User Instructions**: Install Xcode command line tools if not already installed. Run `npm run rebuild` to compile native modules.

- [ ] Step 4: Implement Audio Capture and Processing Pipeline
  - **Task**: Build the audio processing pipeline that can capture from both system audio and microphone simultaneously. Implement audio buffering, format conversion (to WAV/PCM), and real-time audio streaming to the transcription engine.
  - **Files**: (5 files)
    - `src/main/audio/audioCapture.ts`: Main audio capture class handling both system and mic
    - `src/main/audio/audioBuffer.ts`: Audio buffering and format conversion utilities
    - `src/main/audio/audioTypes.ts`: TypeScript types for audio data structures
    - `src/main/audio/audioProcessor.ts`: Real-time audio processing and streaming
    - `src/main/ipc/audioIPC.ts`: IPC handlers for audio-related communication
  - **Step Dependencies**: Step 3
  - **User Instructions**: Grant microphone and system audio permissions when prompted

## Transcription Engine
- [ ] Step 5: Integrate Whisper Model for Local Transcription
  - **Task**: Integrate Whisper.cpp or similar local Whisper implementation. Set up model loading, inference pipeline, and support for English and Finnish languages. Handle model download and management.
  - **Files**: (7 files)
    - `src/main/transcription/whisperEngine.ts`: Main Whisper integration class
    - `src/main/transcription/modelManager.ts`: Handle model downloading and loading
    - `src/main/transcription/languageDetection.ts`: Language detection and switching
    - `src/main/transcription/transcriptionTypes.ts`: Types for transcription data
    - `scripts/download-models.js`: Script to download Whisper models
    - `assets/models/.gitkeep`: Directory structure for storing models
    - `src/main/ipc/transcriptionIPC.ts`: IPC handlers for transcription
  - **Step Dependencies**: Step 4
  - **User Instructions**: Run `npm run download-models` to download English and Finnish Whisper models (this may take several minutes)

- [ ] Step 6: Implement Real-time Transcription Pipeline
  - **Task**: Create the real-time transcription pipeline that processes audio chunks, sends them to Whisper, and streams results back to the UI. Implement proper error handling and performance optimization.
  - **Files**: (4 files)
    - `src/main/transcription/realtimeTranscriber.ts`: Real-time transcription orchestrator
    - `src/main/transcription/transcriptionQueue.ts`: Queue management for audio chunks
    - `src/main/transcription/transcriptionCache.ts`: Caching and optimization for repeated phrases
    - `src/main/services/transcriptionService.ts`: Main service coordinating audio and transcription
  - **Step Dependencies**: Step 5
  - **User Instructions**: None

## Basic Testing UI (Priority Implementation)
- [ ] Step 7: Create Basic Testing UI for Core Functionality
  - **Task**: Build a minimal, functional UI to test audio recording and transcription pipeline. This should include basic record/stop buttons, audio level indicators, and a simple text area to display transcription results. Focus on functionality over aesthetics.
  - **Files**: (6 files)
    - `src/renderer/TestApp.tsx`: Simple testing interface for core functionality
    - `src/renderer/components/BasicRecorder.tsx`: Simple recording controls
    - `src/renderer/components/BasicTranscriptionDisplay.tsx`: Basic text display for transcriptions
    - `src/renderer/components/AudioLevelMeter.tsx`: Simple audio level visualization
    - `src/renderer/hooks/useBasicRecording.ts`: Basic recording state management
    - `src/renderer/styles/test.css`: Minimal styles for testing UI
  - **Step Dependencies**: Step 6
  - **User Instructions**: Test the complete audio-to-transcription pipeline with this basic interface before proceeding to advanced UI development

## Core UI Implementation
- [ ] Step 8: Set up React UI Framework and Advanced Layout
  - **Task**: Integrate React into the Electron renderer process with a proper component architecture. Create the main application layout with header, main content area, and sidebar. Set up state management using React hooks or Context API.
  - **Files**: (8 files)
    - `src/renderer/App.tsx`: Main React application component
    - `src/renderer/components/Layout/Header.tsx`: Application header with controls
    - `src/renderer/components/Layout/Sidebar.tsx`: Sidebar for navigation and settings
    - `src/renderer/components/Layout/MainContent.tsx`: Main content area
    - `src/renderer/styles/global.css`: Global styles and CSS variables
    - `src/renderer/styles/layout.css`: Layout-specific styles
    - `src/renderer/hooks/useIPC.ts`: Custom hook for IPC communication
    - `package.json`: Add React and related dependencies
  - **Step Dependencies**: Step 7
  - **User Instructions**: None

- [ ] Step 9: Implement Advanced Audio Controls and Recording Interface
  - **Task**: Create the polished recording controls interface with start/stop/pause buttons, audio level meters, and recording status indicators. Implement proper state management for recording sessions.
  - **Files**: (6 files)
    - `src/renderer/components/Audio/RecordingControls.tsx`: Main recording control buttons
    - `src/renderer/components/Audio/AudioMeter.tsx`: Real-time audio level visualization
    - `src/renderer/components/Audio/RecordingStatus.tsx`: Status indicator and timer
    - `src/renderer/components/Audio/DeviceSelector.tsx`: Audio device selection
    - `src/renderer/hooks/useAudioRecording.ts`: Hook for managing recording state
    - `src/renderer/styles/audio.css`: Styles for audio components
  - **Step Dependencies**: Step 8
  - **User Instructions**: None

## Transcription Display and Management
- [ ] Step 10: Implement Real-time Transcription Display
  - **Task**: Create the transcription display component that shows real-time transcription results. Implement auto-scrolling, text formatting, and confidence indicators. Handle language switching display.
  - **Files**: (5 files)
    - `src/renderer/components/Transcription/TranscriptionDisplay.tsx`: Main transcription display
    - `src/renderer/components/Transcription/TranscriptionSegment.tsx`: Individual transcription segment
    - `src/renderer/components/Transcription/LanguageIndicator.tsx`: Language detection indicator
    - `src/renderer/hooks/useTranscription.ts`: Hook for managing transcription state
    - `src/renderer/styles/transcription.css`: Styles for transcription display
  - **Step Dependencies**: Step 9
  - **User Instructions**: None

- [ ] Step 11: Implement Transcription History and Session Management
  - **Task**: Create transcription session management with history, search functionality, and session persistence. Implement data storage using Electron's built-in storage or SQLite.
  - **Files**: (6 files)
    - `src/main/storage/sessionStorage.ts`: Session data persistence
    - `src/renderer/components/History/SessionHistory.tsx`: History list component
    - `src/renderer/components/History/SessionSearch.tsx`: Search functionality
    - `src/renderer/components/History/SessionItem.tsx`: Individual session item
    - `src/renderer/hooks/useSessionHistory.ts`: Hook for session management
    - `src/main/ipc/storageIPC.ts`: IPC handlers for storage operations
  - **Step Dependencies**: Step 10
  - **User Instructions**: None

## Advanced Features
- [ ] Step 12: Implement Speaker Diarization (Optional Advanced Feature)
  - **Task**: Integrate speaker diarization capabilities using pyannote.audio or similar local model. Add speaker identification and timeline visualization to the transcription display.
  - **Files**: (5 files)
    - `src/main/transcription/speakerDiarization.ts`: Speaker diarization implementation
    - `src/main/transcription/speakerManager.ts`: Speaker identity management
    - `src/renderer/components/Transcription/SpeakerTimeline.tsx`: Speaker timeline visualization
    - `src/renderer/components/Transcription/SpeakerLabel.tsx`: Speaker label component
    - `scripts/setup-diarization.js`: Setup script for diarization models
  - **Step Dependencies**: Step 11
  - **User Instructions**: Run `npm run setup-diarization` to download speaker diarization models (optional feature)

- [ ] Step 13: Implement Export and Sharing Functionality
  - **Task**: Add export functionality for transcriptions in various formats (TXT, SRT, VTT, JSON). Implement copy to clipboard and file saving with proper macOS integration.
  - **Files**: (4 files)
    - `src/main/export/exportManager.ts`: Main export functionality
    - `src/main/export/formatters.ts`: Different export format implementations
    - `src/renderer/components/Export/ExportDialog.tsx`: Export options dialog
    - `src/renderer/hooks/useExport.ts`: Hook for export functionality
  - **Step Dependencies**: Step 12
  - **User Instructions**: None

## Settings and Configuration
- [ ] Step 14: Implement Settings and Preferences
  - **Task**: Create comprehensive settings interface for audio devices, transcription languages, model selection, UI preferences, and keyboard shortcuts. Implement settings persistence.
  - **Files**: (7 files)
    - `src/main/settings/settingsManager.ts`: Settings persistence and management
    - `src/renderer/components/Settings/SettingsModal.tsx`: Main settings interface
    - `src/renderer/components/Settings/AudioSettings.tsx`: Audio device and quality settings
    - `src/renderer/components/Settings/TranscriptionSettings.tsx`: Transcription and language settings
    - `src/renderer/components/Settings/UISettings.tsx`: UI and appearance settings
    - `src/renderer/components/Settings/KeyboardShortcuts.tsx`: Keyboard shortcut configuration
    - `src/renderer/hooks/useSettings.ts`: Hook for settings management
  - **Step Dependencies**: Step 13
  - **User Instructions**: None

- [ ] Step 15: Implement Global Keyboard Shortcuts and System Integration
  - **Task**: Add global keyboard shortcuts for start/stop recording, system tray integration, and proper macOS app behavior (dock integration, menu bar, etc.).
  - **Files**: (4 files)
    - `src/main/shortcuts/globalShortcuts.ts`: Global keyboard shortcut handling
    - `src/main/system/systemTray.ts`: System tray implementation
    - `src/main/system/dockIntegration.ts`: macOS dock integration
    - `src/main/system/appMenu.ts`: Native application menu
  - **Step Dependencies**: Step 14
  - **User Instructions**: None

## Performance and Polish
- [ ] Step 16: Implement Performance Optimization and Error Handling
  - **Task**: Add comprehensive error handling, logging, performance monitoring, and optimization for audio processing and transcription pipeline. Implement proper memory management for long recording sessions.
  - **Files**: (5 files)
    - `src/main/utils/logger.ts`: Comprehensive logging system
    - `src/main/utils/errorHandler.ts`: Global error handling
    - `src/main/performance/memoryManager.ts`: Memory management for long sessions
    - `src/main/performance/performanceMonitor.ts`: Performance monitoring and optimization
    - `src/renderer/components/Common/ErrorBoundary.tsx`: React error boundary
  - **Step Dependencies**: Step 15
  - **User Instructions**: None

- [ ] Step 17: Final UI Polish and Styling
  - **Task**: Apply final styling, animations, and UI polish to create a professional, Granola.ai-inspired interface. Implement dark/light theme support and proper responsive design.
  - **Files**: (6 files)
    - `src/renderer/styles/themes.css`: Dark and light theme implementations
    - `src/renderer/styles/animations.css`: UI animations and transitions
    - `src/renderer/components/Common/ThemeProvider.tsx`: Theme management component
    - `src/renderer/styles/components.css`: Polished component styles
    - `src/renderer/hooks/useTheme.ts`: Hook for theme management
    - `assets/icons/`: Application icons and assets
  - **Step Dependencies**: Step 16
  - **User Instructions**: None

## Testing and Deployment
- [ ] Step 18: Implement Testing Framework
  - **Task**: Set up testing framework with Jest for unit tests, Spectron for integration tests, and testing utilities for audio mocking. Create comprehensive test coverage for core functionality.
  - **Files**: (6 files)
    - `jest.config.js`: Jest configuration
    - `src/tests/audio.test.ts`: Audio functionality tests
    - `src/tests/transcription.test.ts`: Transcription engine tests
    - `src/tests/ipc.test.ts`: IPC communication tests
    - `src/tests/utils/audioMocks.ts`: Mock utilities for testing
    - `src/tests/utils/testHelpers.ts`: Common testing utilities
  - **Step Dependencies**: Step 17
  - **User Instructions**: Run `npm test` to execute test suite

- [ ] Step 19: Prepare for Distribution and Packaging
  - **Task**: Configure electron-builder for macOS distribution, code signing, and notarization. Set up build scripts for production releases and auto-updater functionality.
  - **Files**: (4 files)
    - `build/entitlements.plist`: macOS entitlements for audio access
    - `build/Info.plist`: macOS app information
    - `scripts/build.js`: Production build script
    - `scripts/notarize.js`: macOS notarization script
  - **Step Dependencies**: Step 18
  - **User Instructions**: Configure Apple Developer certificates and update build configuration with your signing identity. Run `npm run build` to create production build.

## Summary

This implementation plan creates a comprehensive local transcription application for macOS using Electron, CoreAudio, and Whisper. The approach prioritizes:

**Key Technical Decisions:**
- **Electron Framework**: Enables web technology usage while providing native system access
- **CoreAudio Integration**: Uses the latest macOS 14.4 APIs for optimal audio capture
- **Local Whisper**: Ensures privacy and offline functionality with whisper.cpp integration
- **React UI**: Modern, component-based interface inspired by Granola.ai
- **TypeScript**: Type safety throughout the application

**Critical Dependencies:**
- Native module compilation requires Xcode command line tools
- Whisper models need to be downloaded locally (several GB)
- macOS permissions for microphone and system audio access
- Speaker diarization models (optional but significant download)

**Development Approach:**
The plan follows a logical progression from core infrastructure (Electron, audio capture) through transcription engine integration, basic testing UI, and then advanced UI development and features. The early inclusion of a basic testing UI (Step 7) allows for validation of the core audio-to-transcription pipeline before investing time in advanced UI components.

**Key Challenges Addressed:**
- Real-time audio processing pipeline
- Native macOS integration with proper permissions
- Local ML model management and inference
- Professional UI/UX matching modern design standards
- Performance optimization for long recording sessions

The final application will be a fully functional, offline transcription tool that rivals commercial solutions while maintaining complete privacy through local processing.