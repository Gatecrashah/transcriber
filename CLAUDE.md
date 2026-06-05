# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Transcriper** is an Electron-based meeting-notes app for macOS. It captures system + microphone audio in the renderer, transcribes it locally with **WhisperKit**, performs speaker diarization with **FluidAudio**, and stores notes (with attached transcriptions) in `localStorage`. The heavy lifting runs in a native Swift dynamic library loaded into Electron's main process via the **koffi** FFI.

Built with TypeScript, React 19, and Swift. All transcription is local — no audio leaves the machine.

> ⚠️ **Docs vs. reality:** Earlier versions of this file described a whisper.cpp + tinydiarize pipeline. That stack no longer exists. The current implementation is WhisperKit + FluidAudio via a Swift FFI dylib. If you find references to `whisper.cpp`, `tinydiarize`, `transcriptionManager.ts`, `useAudioRecording.ts`, or LLM enhancement, they are stale.

## Architecture

### Process / data flow

```
Renderer (React)                    Main process (Node)              Swift dylib (FFI)
────────────────                    ───────────────────              ─────────────────
useRecording                                                         libTranscriperNative.dylib
  getDisplayMedia (system)
  getUserMedia (microphone)
  MediaRecorder → WebM
  convertWebMToWav → 16kHz WAV
        │
        │ electronAPI.audio.processDirectly(arrayBuffer)
        ▼
                                    audioIPC: 'audio:processDirectly'
                                      parse WAV header → Float32Array
                                      TranscriptionManager.processAudioBuffer
                                        nativeAudioProcessor.processAudioBuffer
                                          SwiftNativeBridge (koffi)  ──────────►  transcriper_process_audio_buffer
                                                                                    SwiftAudioBridge
                                                                                      UnifiedAudioProcessor
                                                                                        FluidAudio (VAD + diarization)
                                                                                        WhisperKit (transcription)
                                          ◄──────────────────────────────────────  JSON result
                                          convertSwiftResultToTranscriptionResult
        ◄─────────────────────────────  TranscriptionResult { text, speakers[] }
  onTranscriptionComplete
  addTranscription → note in localStorage
```

### Key files

**Electron / main process**
- `src/index.ts` — Main process entry. Creates the window, sets `setDisplayMediaRequestHandler({ audio: 'loopback' })` (required for system-audio capture), wires up IPC.
- `src/preload.ts` — `contextBridge` exposing `window.electronAPI.audio` and `window.electronAPI.transcription`.
- `src/main/ipc/audioIPC.ts` — `audio:processDirectly` (the active path), plus `getDesktopSources`, `initialize`, and a deprecated `saveAudioFile` stub.
- `src/main/ipc/transcriptionIPC.ts` — `TranscriptionIPC` class; owns the `TranscriptionManager` and registers `transcription:*` handlers. (Most are currently unused by the renderer — see "Known issues".)
- `src/main/transcription/transcriptionManagerSwift.ts` — `TranscriptionManager`; thin orchestration layer over `nativeAudioProcessor`.

**Native bridge (TS → Swift)**
- `src/native/nativeAudioProcessor.ts` — `NativeAudioProcessor` singleton. Calls the Swift bridge and maps raw Swift JSON → `TranscriptionResult` (maps `speaker_0` → `Speaker A`, clamps confidence, etc.).
- `src/utils/swiftNativeBridge.ts` — `SwiftNativeBridge`. Loads the dylib with koffi and declares the C function signatures.
- `src/types/koffi.ts` — Koffi type stubs. ⚠️ These signatures are **out of sync** with the real C functions (see "Known issues").

**Swift library** (`src/native/swift/`, SwiftPM package `TranscriperNative`)
- `Native/TranscriperNative.swift` — `@_cdecl` C-ABI entry points (`transcriper_initialize`, `transcriper_process_audio_buffer`, …).
- `Core/SwiftAudioBridge.swift` — `@objc` bridge; synchronous wrappers (via `DispatchSemaphore`) around the async processor.
- `Core/UnifiedAudioProcessor.swift` — Orchestrates VAD → diarization → transcription and merges results.
- `Core/WhisperKitManager.swift` — WhisperKit wrapper. Default model `base`; models auto-download on first run.
- `Core/FluidAudioManager.swift` — FluidAudio VAD + diarization, with an energy-based VAD fallback.
- `Core/AudioCapture.swift` + `main.swift` — A standalone `audio-capture` executable target. **Currently orphaned** — capture happens in the browser now. Kept in the SwiftPM package but not used by the app.

**React UI**
- `src/renderer-react.tsx` — React entry point.
- `src/components/App.tsx` — Top-level layout; wires `useRecording`, `useTranscriptionSystem`, `useNoteManagement`.
- `src/components/{Homepage,NotepadEditor,TranscriptionPanel,AudioVisualizer,ErrorBoundary}.tsx`
- `src/hooks/useRecording.ts` — Dual-stream capture, WebM→WAV conversion, dedup/merge of speaker segments, triggers transcription.
- `src/hooks/useTranscriptionSystem.ts` — One-time init + installation check on mount.
- `src/hooks/useNoteManagement.ts` — CRUD over notes in `localStorage` (key `transcriper-notes`), with Date (de)serialization.

**Types**
- `src/types/{audio,transcription,notes,koffi}.ts`

## Development Commands

- `npm start` — Run in dev with hot reload (Electron Forge + Webpack).
- `npm run lint` — ESLint over `.ts`/`.tsx`.
- `npm test` / `npm run test:watch` / `npm run test:coverage` — Jest + React Testing Library.
- `npm run package` / `npm run make` / `npm run publish` — Package / build installers / publish.

### Building the Swift library

The app loads `libTranscriperNative.dylib`. A prebuilt copy is committed at `src/native/swift/libTranscriperNative.dylib`, and `swift build` outputs to `src/native/swift/.build/arm64-apple-macosx/release/`. To rebuild:

```bash
cd src/native/swift
swift build -c release
```

WhisperKit and FluidAudio are statically linked into the dylib; CoreML models are downloaded by WhisperKit at first run.

### Requirements
- **macOS 14+** (Swift code is gated on `@available(macOS 14.0, *)`) on Apple Silicon (`arm64`).
- **Node.js 18+**, **Xcode** (Swift toolchain) for building the native library.

## Build / Security Configuration

- **Electron Forge** + Webpack plugin; `transpileOnly` ts-loader (⚠️ type errors do **not** fail the build — see below).
- `AutoUnpackNativesPlugin` unpacks native `.node` modules (e.g. koffi) from the ASAR.
- Electron Fuses: cookie encryption, ASAR integrity validation, `OnlyLoadAppFromAsar`, Node CLI inspect/options disabled, RunAsNode disabled.
- Renderer: `contextIsolation: true`, `nodeIntegration: false`. (`experimentalFeatures: true` is currently set and could likely be removed.)
- Permission handler grants `media` and `display-capture`; everything else is denied.

## Known Issues / Tech Debt

These are real and worth knowing before you touch the code:

1. **Packaged builds don't ship the dylib.** `forge.config.ts` has no `extraResource`/copy step, and `swiftNativeBridge.ts` resolves the library relative to `process.cwd()` / `__dirname`. Works under `npm start` (cwd = repo); a `npm run make` build cannot load the library and every transcription fails. Fix: bundle the dylib (e.g. `extraResource`) and resolve via `process.resourcesPath`.
2. **FFI runs synchronously on the main thread.** koffi `lib.func(...)` calls are blocking and the Swift side blocks on a `DispatchSemaphore`, so the main process is frozen for the full transcription duration. Prefer koffi `.async()` or a `utilityProcess`/worker.
3. **`transcribeFile` path is broken.** `nativeAudioProcessor.processAudioFile` passes a `parseResult` callback that `swiftNativeBridge.runCommand` ignores, so it returns raw Swift JSON (`segments`/`speakerId`) instead of a converted `TranscriptionResult` (`speakers`/`speaker`). Latent — the renderer only uses the `processAudioBuffer` path, which converts correctly.
4. **Type checking is effectively off.** `ts-loader` runs with `transpileOnly: true` and ForkTsChecker is commented out in `webpack.plugins.ts`. `npx tsc --noEmit` currently reports ~16 errors. The worst offender is `src/types/koffi.ts`, whose signatures don't match the real C functions (the runtime call sites in `swiftNativeBridge.ts` are correct).
5. **`preload.ts`'s declared `Window.electronAPI` is out of sync** with what's actually exposed (e.g. declares `audio.getDevices/startRecording/...` that don't exist; omits `requestSystemAudioPermission` that does).
6. **Dead code:** the `audio-capture` Swift executable target, several `transcription:*` IPC handlers + their preload wrappers, `transcriptionManagerSwift.transcribeDualStreams` (the renderer does its own merge), and the deprecated `saveAudioFile` stubs.
7. **Confidence is meaningless.** WhisperKit's `avgLogprob` (negative) is stored as `confidence`, then clamped to `[0,1]` → effectively `0`.

## Conventions

- **TypeScript** strict mode is enabled in `tsconfig.json` even though the build doesn't enforce it — keep new code clean and avoid `any`.
- **React** functional components + hooks; wrap risky subtrees in `ErrorBoundary`.
- **Audio** must reach Whisper as 16kHz mono — `convertWebMToWav` handles resampling. Keep system and microphone channels separate so diarization/labelling works.
- **Privacy by design** — all processing is local; don't add network calls for audio or transcripts.
- **IPC** — validate/serialize across the boundary (e.g. `Float32Array` is passed as a plain array).
