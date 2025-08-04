// Type definitions for Koffi FFI library
export interface KoffiFunction {
  (signature: string): (...args: unknown[]) => unknown;
}

export interface KoffiLib {
  func(signature: string): (...args: unknown[]) => unknown;
}

export interface KoffiModule {
  load(path: string): KoffiLib;
  alloc(type: string, count: number): Buffer;
  decode(buffer: Buffer, type: string, length?: number): string;
}

// Swift function signatures
export type TranscriperInitialize = (modelPath: string, modelType: string) => number;
export type TranscriperIsReady = () => boolean;
export type TranscriperProcessAudioFile = (
  audioPath: string,
  language: string,
  options: string,
  resultBuffer: Buffer,
  bufferSize: number
) => number;
export type TranscriperProcessAudioBuffer = (
  audioData: Buffer,
  dataSize: number,
  sampleRate: number,
  channels: number,
  language: string,
  options: string,
  resultBuffer: Buffer,
  bufferSize: number
) => number;
export type TranscriperGetSystemInfo = (
  resultBuffer: Buffer,
  bufferSize: number
) => number;
export type TranscriperGetAvailableModels = (
  resultBuffer: Buffer,
  bufferSize: number
) => number;
export type TranscriperCleanup = () => void;