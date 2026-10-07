const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bankSetuDesktop', {
  read: scope => ipcRenderer.invoke('local:read',scope),
  storage: () => ipcRenderer.invoke('local:storage'),
  commit: (scope,before,after) => ipcRenderer.invoke('local:commit',scope,before,after),
  version: () => ipcRenderer.invoke('update:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  onUpdateReady: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update:ready', listener);
    return () => ipcRenderer.removeListener('update:ready', listener);
  },
});
contextBridge.exposeInMainWorld('bankSetuPrint', {
  preview: html => ipcRenderer.invoke('print:preview', html)
});
