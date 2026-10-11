const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bankSetuDesktop', {
  licenseSession: uid => ipcRenderer.invoke('license:session',uid),
  licenseStatus: signed => ipcRenderer.invoke('license:status',signed),
  licenseReceipt: signed => ipcRenderer.invoke('license:receipt',signed),
  read: scope => ipcRenderer.invoke('local:read',scope),
  storage: () => ipcRenderer.invoke('local:storage'),
  commit: (scope,before,after,receipt) => ipcRenderer.invoke('local:commit',scope,before,after,receipt),
  copyText: text => ipcRenderer.invoke('clipboard:write-text',text),
  shareImage: image => ipcRenderer.invoke('clipboard:share-image',image),
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
  preview: (html,options) => ipcRenderer.invoke('print:preview', html, options)
});
