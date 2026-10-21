const path=require('node:path'),crypto=require('node:crypto');
const {nativeClient}=require('./pr2-native.cjs');
const {createBridge}=require('./pr2-bridge.cjs');
const {capturePrintDocument}=require('./print-preview.cjs');
function installPr2({app,ipcMain,BrowserWindow,trusted,authorize,getWindow}){
 const documents=new Map();let busy=false,protocolReady=false;
 const directory=app.isPackaged?path.join(process.resourcesPath,'pr2'):path.join(__dirname,'../build/pr2');
 let instance;const getBridge=()=>instance||(instance=createBridge({directory:path.join(app.getPath('userData'),'printer'),transport:()=>nativeClient(directory),authorize,progress:event=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('pr2:progress',event);}}));
 const gate=(event,scope)=>{trusted(event);if(process.platform!=='win32')throw Error('Please use this button on only Windows EXE mode.');authorize(scope);};
 ipcMain.handle('pr2:prepare',async(event,scope)=>{
  gate(event,scope);if(busy)throw Error('A passbook print preparation is already running.');busy=true;let snapshot,timer;
  const bounded=task=>Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{snapshot?.destroy();reject(Error("Passbook preparation timed out."));},30000);})]).finally(()=>clearTimeout(timer));
  try{
   const valid=await event.sender.executeJavaScript('!!document.querySelector(".passbook-page .passbook-shell,.passbook-page .union-document,.passbook-page .assam-quick-document")');if(!valid)throw Error('Search and load a passbook first.');
   const html=await bounded(event.sender.executeJavaScript('(()=>{window.dispatchEvent(new Event("beforeprint"));try{const html=('+capturePrintDocument.toString()+')();const doc=new DOMParser().parseFromString(html,"text/html");doc.querySelectorAll(".pr2-overlay").forEach(n=>n.remove());return "<!doctype html>"+doc.documentElement.outerHTML;}finally{window.dispatchEvent(new Event("afterprint"));}})()'));
   snapshot=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false,partition:'pr2-snapshot'}});
   if(!protocolReady){snapshot.webContents.session.protocol.handle('banksetu',require('./app-protocol.cjs').createAppProtocol(path.resolve(__dirname,'../dist')));protocolReady=true;}
   snapshot.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('banksetu://app/')&&!details.url.startsWith('data:')}));
   snapshot.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   await bounded(snapshot.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html)));
   const pdf=await bounded(snapshot.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,scale:1,margins:{top:0,bottom:0,left:0,right:0}}));
   gate(event,scope);documents.clear();const id=crypto.randomUUID();documents.set(id,{scope,expires:Date.now()+300000});
   return {id,pdf:pdf.toString('base64')};
  }finally{clearTimeout(timer);busy=false;if(snapshot&&!snapshot.isDestroyed())snapshot.destroy();}
 });
 ipcMain.handle('pr2:discover',(event,scope)=>{gate(event,scope);return getBridge().discover(scope);});
 ipcMain.handle('pr2:probe',(event,request)=>{gate(event,request?.scope);return getBridge().probe(request.scope,request.device,request.settings);});
 ipcMain.handle('pr2:acknowledge',(event,request)=>{gate(event,request?.scope);getBridge().acknowledge(request.scope,request.deviceId);return true;});
 ipcMain.handle('pr2:send',async(event,request)=>{
  gate(event,request?.scope);const document=documents.get(request.id);
  if(!document||document.scope!==request.scope||document.expires<Date.now())throw Error('Passbook print preparation expired or workspace changed.');
  return getBridge().print(request);
 });
 ipcMain.handle('pr2:cancel',(event,request)=>{gate(event,request?.scope);return getBridge().cancel(request.scope,request.id);});
 app.on('before-quit',()=>instance?.close());
 return {close:()=>instance?.close()};
}
module.exports={installPr2};
