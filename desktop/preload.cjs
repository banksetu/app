const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bankSetuDesktop', {
  read: scope => ipcRenderer.invoke('local:read',scope),
  storage: () => ipcRenderer.invoke('local:storage'),
  commit: (scope,before,after) => ipcRenderer.invoke('local:commit',scope,before,after),
  version: () => ipcRenderer.invoke('update:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
