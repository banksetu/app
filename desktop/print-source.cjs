const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bankSetuPrint', {
  preview: html => ipcRenderer.invoke('print:preview', html)
});
