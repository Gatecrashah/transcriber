// Mock Electron for testing
export const app = {
  quit: jest.fn(),
  getPath: jest.fn(),
  whenReady: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  setAsDefaultProtocolClient: jest.fn(),
};

export const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL: jest.fn(),
  loadFile: jest.fn(),
  on: jest.fn(),
  webContents: {
    openDevTools: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
  },
  show: jest.fn(),
  focus: jest.fn(),
  close: jest.fn(),
}));

export const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
};

export const ipcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  send: jest.fn(),
  removeAllListeners: jest.fn(),
};

export const contextBridge = {
  exposeInMainWorld: jest.fn(),
};

export const shell = {
  openExternal: jest.fn(),
};

export const dialog = {
  showOpenDialog: jest.fn(),
  showSaveDialog: jest.fn(),
  showMessageBox: jest.fn(),
};

export default {
  app,
  BrowserWindow,
  ipcMain,
  ipcRenderer,
  contextBridge,
  shell,
  dialog,
};