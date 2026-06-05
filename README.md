# Transcriper

A local-first meeting-notes app for macOS. Transcriper captures your system audio
and microphone, transcribes them **on-device** with [WhisperKit](https://github.com/argmaxinc/WhisperKit),
identifies speakers with [FluidAudio](https://github.com/FluidInference/FluidAudio),
and keeps the transcript alongside your notes. No audio or text leaves your machine.

Built with Electron, React, and a native Swift library bridged into Node via FFI.

> **Status:** functional on Apple Silicon. The transcription pipeline runs locally
> and works in both development and packaged builds. See [Known limitations](#known-limitations).

## Features

- **Dual-stream capture** — records system audio (loopback) and microphone
  simultaneously, so you catch both sides of a call.
- **Local transcription** — WhisperKit (Whisper `base` by default) running on the
  Apple Neural Engine / GPU; models download themselves on first run.
- **Speaker diarization** — FluidAudio labels "who spoke when," with Silero VAD to
  skip silence.
- **Notes + transcripts** — a notepad editor with a side panel of speaker-labelled
  transcription bubbles; notes are stored locally.
- **Private by design** — all processing is on-device.

## Requirements

- **macOS 14+** on **Apple Silicon** (`arm64`).
- **Node.js 18+**.
- **Xcode** (Swift toolchain) — only needed if you rebuild the native library.

## Getting started

```bash
npm install      # also enables the git pre-commit hook (see below)
npm start        # launch the app in development with hot reload
```

On first launch, WhisperKit and FluidAudio download their CoreML models to
`~/Library/Application Support/` (one-time, requires network). The app grants
itself screen-capture (for system-audio loopback) and microphone permission on
first use.

## How it works

```
Renderer (React)                Main process (Node)            Swift dylib (FFI)
────────────────                ───────────────────            ─────────────────
getDisplayMedia (system)
getUserMedia   (microphone)
MediaRecorder → WebM
convertWebMToWav → 16 kHz WAV
      │  electronAPI.audio.processDirectly(arrayBuffer)
      ▼
                                audioIPC → TranscriptionManager
                                  nativeAudioProcessor
                                    koffi FFI  ───────────────►  libTranscriperNative.dylib
                                                                   FluidAudio (VAD + diarization)
                                                                   WhisperKit (transcription)
                                  ◄───────────────────────────  JSON { text, speakers[] }
      ◄───────────────────────  TranscriptionResult
note + transcript saved locally
```

The Swift code lives in `src/native/swift/` (a SwiftPM package) and is compiled to
`libTranscriperNative.dylib`, which is loaded into Electron's main process via
[koffi](https://koffi.dev). FFI calls run on a worker thread so the UI never blocks
during transcription.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the app in development (Electron Forge + Webpack). |
| `npm run package` | Build the packaged `.app` into `out/`. |
| `npm run make` | Build distributable installers. |
| `npm run typecheck` | `tsc --noEmit` — type-check the project. |
| `npm run lint` | ESLint over `.ts`/`.tsx`. |
| `npm test` | Jest + React Testing Library. |

A **pre-commit hook** runs `typecheck` and `lint` automatically. It's enabled on
`npm install` via `core.hooksPath` (or manually: `git config core.hooksPath .githooks`).
Bypass with `git commit --no-verify`.

## Rebuilding the native library

A prebuilt, self-contained `libTranscriperNative.dylib` is committed and shipped
with packaged builds. If you change any Swift under `src/native/swift/`, rebuild and
re-commit it:

```bash
cd src/native/swift
swift build -c release
cp .build/arm64-apple-macosx/release/libTranscriperNative.dylib ./libTranscriperNative.dylib
```

WhisperKit and FluidAudio are statically linked into the dylib; only CoreML models
are fetched at runtime.

## Project structure

```
src/
  index.ts                       Electron main entry (window, IPC, loopback handler)
  preload.ts                     contextBridge — window.electronAPI
  renderer-react.tsx             React entry
  components/                    App, Homepage, NotepadEditor, TranscriptionPanel, …
  hooks/                         useRecording, useTranscriptionSystem, useNoteManagement
  main/ipc/                      audioIPC, transcriptionIPC
  main/transcription/            TranscriptionManager (orchestration)
  native/                        nativeAudioProcessor (TS) + Swift package
  utils/                         swiftNativeBridge (koffi), audio conversion helpers
  types/                         shared TypeScript types
```

See [`CLAUDE.md`](./CLAUDE.md) for a deeper architecture reference and the current
list of known issues / tech debt.

## Known limitations

- **Apple Silicon / macOS 14+ only.** The native code is gated on `@available(macOS 14.0, *)`
  and built for `arm64`.
- **FluidAudio is pinned to v0.1.0** (latest is much newer). Upgrading is a tracked
  follow-up that needs an API migration and a dylib rebuild.
- The standalone `audio-capture` Swift executable target is legacy and unused
  (capture happens in the renderer now).

## License

MIT
