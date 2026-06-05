// Type definitions for the subset of the Koffi FFI library we use.

/**
 * A koffi-bound native function. It is callable synchronously (returning the C
 * `int` result) and asynchronously via `.async(...args, callback)`, which runs
 * the call on a libuv worker thread.
 */
export interface KoffiCallable {
  (...args: unknown[]): number;
  async(...args: unknown[]): void;
}

export interface KoffiLib {
  func(signature: string): KoffiCallable;
}

// Swift C-ABI function signatures. These mirror the `@_cdecl` exports in
// Native/TranscriperNative.swift exactly — keep them in sync with that file.
export type TranscriperInitialize = () => number;
export type TranscriperIsReady = () => number;
export type TranscriperProcessAudioFile = (
  filename: string,
  result: Buffer,
  bufferSize: number
) => number;
export type TranscriperProcessAudioBuffer = (
  audioData: Float32Array,
  dataLength: number,
  sampleRate: number,
  channels: number,
  result: Buffer,
  bufferSize: number
) => number;
export type TranscriperGetSystemInfo = (info: Buffer, bufferSize: number) => number;
export type TranscriperGetAvailableModels = (models: Buffer, bufferSize: number) => number;
export type TranscriperCleanup = () => void;
