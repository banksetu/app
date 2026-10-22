const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bankSetuPrintPreview', {
  action: (action,options) => ipcRenderer.invoke('print:action',action,options)
});
