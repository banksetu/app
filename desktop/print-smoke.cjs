// Runs on Windows CI with real Electron, Chromium PDF generation and window close.
const {app,BrowserWindow,ipcMain,protocol,dialog}=require('electron');
const path=require('node:path');
const assert=require('node:assert/strict');
protocol.registerSchemesAsPrivileged([{scheme:'banksetu',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let failure=false;
process.on('uncaughtException',error=>{console.error(error);app.exit(1)});
process.on('unhandledRejection',error=>{console.error(error);app.exit(1)});
const timer=setTimeout(()=>{console.error('Electron print smoke timed out');app.exit(1)},60000);
app.whenReady().then(async()=>{
 protocol.handle('banksetu',require('./app-protocol.cjs').createAppProtocol(path.resolve(__dirname,'../dist')));
 const source=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'print-source.cjs'),contextIsolation:true,sandbox:true}});
 const bridge=require('./print-preview.cjs').installPrintPreview({app,BrowserWindow,ipcMain,dialog});bridge.attach(source);
 await source.loadURL('banksetu://app/index.html');
 assert.match(await source.webContents.executeJavaScript('document.documentElement.outerHTML'),/root/);
 for(let i=0;i<3;i++){
  await source.webContents.executeJavaScript(`window.__smokePrint=window.bankSetuPrint.preview('<html><head><style>@page{size:A4;margin:0}</style></head><body>Bank Setu print lifecycle</body></html>');void 0;`);
  let preview;
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    preview=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Bank Setu · Print');
    if(preview&&await preview.webContents.executeJavaScript('!!document.querySelector("#cancel")').catch(()=>false))break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert(preview,'preview loaded');
  assert.equal(await preview.webContents.executeJavaScript('document.querySelector("#cancel").textContent'),'Cancel');
  const result=await preview.webContents.executeJavaScript('window.bankSetuPrintPreview.action("preview",{paper:"A4",landscape:false,scale:100,copies:1,pageRanges:""})');
  assert(result.pdf.startsWith('JVBER'),'Chromium generated PDF');
  preview.close();
  const outcome=await source.webContents.executeJavaScript('window.__smokePrint');
  assert.equal(outcome.accepted,false);assert.equal(outcome.cancelled,true);
 }
 source.close();
 console.log('Real Electron startup, PDF preview, cancel and reopen passed.');
}).catch(error=>{failure=true;console.error(error)}).finally(()=>{clearTimeout(timer);app.exit(failure?1:0)});
