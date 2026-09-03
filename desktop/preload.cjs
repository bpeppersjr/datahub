/* eslint-disable @typescript-eslint/no-require-imports -- Electron sandboxed preload scripts are loaded as CommonJS. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cotiveCollector', Object.freeze({
  getRunnerConnection: () => ipcRenderer.invoke('cotive:runner-connection'),
}));
