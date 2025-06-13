import '@testing-library/jest-dom';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Mock window.electronAPI for testing
Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    audio: {
      initialize: jest.fn().mockResolvedValue({ success: true }),
      getDevices: jest.fn().mockResolvedValue({ success: true, devices: [] }),
      startRecording: jest.fn().mockResolvedValue({ success: true }),
      stopRecording: jest.fn().mockResolvedValue({ success: true, audioPath: '/mock/path.wav' }),
      getLevel: jest.fn().mockResolvedValue({ success: true, level: 0 }),
      isRecording: jest.fn().mockResolvedValue({ success: true, isRecording: false }),
      saveAudioFile: jest.fn().mockResolvedValue({ success: true, audioPath: '/mock/path.wav' }),
      getDesktopSources: jest.fn().mockResolvedValue({ success: true, sources: [] }),
    },
    transcription: {
      checkInstallation: jest.fn().mockResolvedValue({ installed: true }),
      transcribeFile: jest.fn().mockResolvedValue({ 
        success: true, 
        text: 'Mock transcription text',
        duration: 10 
      }),
      transcribeDualStreams: jest.fn().mockResolvedValue({
        success: true,
        text: '**Speaker A:**\nMock system audio text\n\n**You:**\nMock microphone text',
        speakers: []
      }),
      startStream: jest.fn().mockResolvedValue({ success: true, text: 'Mock stream text' }),
      onProgress: jest.fn(),
      removeProgressListener: jest.fn(),
    },
  },
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock MediaRecorder for audio tests
Object.defineProperty(window, 'MediaRecorder', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    state: 'inactive',
  })),
});

// Mock getUserMedia
Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: jest.fn().mockReturnValue([{
        stop: jest.fn(),
      }]),
    }),
    getDisplayMedia: jest.fn().mockResolvedValue({
      getTracks: jest.fn().mockReturnValue([{
        stop: jest.fn(),
      }]),
    }),
  },
});

// Suppress specific console warnings during tests
const originalWarn = console.warn;
beforeEach(() => {
  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('React does not recognize') ||
       args[0].includes('componentWillReceiveProps'))
    ) {
      return;
    }
    originalWarn(...args);
  };
});

afterEach(() => {
  console.warn = originalWarn;
});