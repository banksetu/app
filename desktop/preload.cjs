const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bankSetuDesktop', {
  backgroundStatus: () => ipcRenderer.invoke('background:status'),
  bindBackground: value => ipcRenderer.invoke('background:bind',value),
  clearBackground: () => ipcRenderer.invoke('background:clear'),
  licenseSession: uid => ipcRenderer.invoke('license:session',uid),
  licenseStatus: signed => ipcRenderer.invoke('license:status',signed),
  licenseReceipt: signed => ipcRenderer.invoke('license:receipt',signed),
  saveCustomerPdf: data => ipcRenderer.invoke('customer-pdf:save',data),
  openCustomerPdf: data => ipcRenderer.invoke('customer-pdf:open',data),
  read: scope => ipcRenderer.invoke('local:read',scope),
  storage: () => ipcRenderer.invoke('local:storage'),
  commit: (scope,before,after,receipt) => ipcRenderer.invoke('local:commit',scope,before,after,receipt),
  copyText: text => ipcRenderer.invoke('clipboard:write-text',text),
  shareImage: image => ipcRenderer.invoke('clipboard:share-image',image),
  version: () => ipcRenderer.invoke('update:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  notify: value => ipcRenderer.invoke('system-notification:show',value),
  onNotificationOpen: callback => {const listener=(_event,page)=>callback(page);ipcRenderer.on('system-notification:open',listener);return ()=>ipcRenderer.removeListener('system-notification:open',listener);},
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
