const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {installPrintPreview}=require('./print-preview.cjs');
test('Windows preview freezes print HTML, isolates IPC, validates settings and keeps passbook size',async()=>{
  const handlers=new Map(),windows=[],pdfOptions=[],printOptions=[];
  class FakeWindow extends EventEmitter{
    constructor(options){super();this.options=options;this.destroyed=false;this.contents=new EventEmitter();Object.defineProperty(this,"webContents",{get:()=>{if(this.destroyed)throw Error("Object has been destroyed");return this.contents}});this.webContents.mainFrame={};this.webContents.isDestroyed=()=>false;this.webContents.setWindowOpenHandler=()=>{};this.webContents.executeJavaScript=async()=>{};this.webContents.getPrintersAsync=async()=>[{name:'test-printer',isDefault:true}];this.webContents.printToPDF=async options=>{pdfOptions.push(options);return Buffer.from('%PDF-test /MediaBox [0 0 360 504]')};this.webContents.print=(options,callback)=>{printOptions.push(options);callback(true)};windows.push(this);}
    async loadURL(url){this.url=url}
    isDestroyed(){return this.destroyed}
    destroy(){this.destroyed=true;this.emit('closed')}
    close(){this.destroy()}
    focus(){}
  }
  const bridge=installPrintPreview({app:{getPath:()=>'/unused'},BrowserWindow:FakeWindow,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showSaveDialog:async()=>({canceled:true})}});
  const source=new FakeWindow({});bridge.attach(source);
  const event={sender:source.webContents,senderFrame:source.webContents.mainFrame};
  await assert.rejects(handlers.get('print:preview')({sender:{},senderFrame:{}},'<html/>'),/Untrusted/);
  const previewCompletion=handlers.get('print:preview')(event,'<html><body>Customer snapshot</body></html>');
  await new Promise(resolve=>setImmediate(resolve));
  const snapshot=windows[1],preview=windows[2];
  assert.equal(snapshot.options.webPreferences.javascript,false);
  assert.equal(preview.options.webPreferences.nodeIntegration,false);
  assert.equal(preview.options.webPreferences.plugins,true);
  assert(decodeURIComponent(snapshot.url).includes('Customer snapshot'));
  assert.equal(pdfOptions[0].preferCSSPageSize,true);
  const previewEvent={sender:preview.webContents,senderFrame:preview.webContents.mainFrame};
  const settings={paper:'document',landscape:false,duplex:true,scale:100,copies:1,pageRanges:'1-2, 4',deviceName:'test-printer'};
  await assert.rejects(handlers.get('print:action')(event,'print',settings),/Untrusted/);
  await assert.rejects(handlers.get('print:action')(previewEvent,'print',{...settings,deviceName:'other'}),/installed printer/);
  await assert.rejects(handlers.get('print:action')(previewEvent,'print',{...settings,pageRanges:'0-2'}),/page range/);
  await handlers.get('print:action')(previewEvent,'preview',{...settings,paper:'A4',landscape:true});
  assert.equal(pdfOptions.at(-1).pageSize,'A4');
  assert.equal(pdfOptions.at(-1).landscape,true);
  assert.equal((await handlers.get('print:action')(previewEvent,'save',settings)).message,'Save cancelled.');
  const originalPrint=snapshot.webContents.print;
  snapshot.webContents.print=(_options,callback)=>callback(false,'cancelled');
  assert.equal((await handlers.get('print:action')(previewEvent,'print',settings)).cancelled,true);
  snapshot.webContents.print=(_options,callback)=>callback(false,'Printer offline');
  await assert.rejects(handlers.get('print:action')(previewEvent,'print',settings),/Printer offline/);
  snapshot.webContents.print=originalPrint;
  await handlers.get('print:action')(previewEvent,'print',settings);
  assert.deepEqual(printOptions[0].pageRanges,[{from:0,to:1},{from:3,to:3}]);
  assert.equal(printOptions[0].silent,true);
  assert.equal(printOptions[0].duplexMode,'longEdge');
  assert.deepEqual(printOptions[0].pageSize,{width:127000,height:177800});
  const acceptedCount=printOptions.length;
  assert((await handlers.get('print:action')(previewEvent,'print',settings)).accepted);
  assert.equal(printOptions.length,acceptedCount,'accepted jobs cannot be submitted twice');
  preview.close();await previewCompletion;
  const retryCompletion=handlers.get('print:preview')(event,'<html/>');
  await new Promise(resolve=>setImmediate(resolve));
  const retrySnapshot=windows.at(-2),retryPreview=windows.at(-1);
  const retryEvent={sender:retryPreview.webContents,senderFrame:retryPreview.webContents.mainFrame};
  let finishPrint;
  retrySnapshot.webContents.print=(_options,callback)=>{finishPrint=callback};
  const pending=handlers.get('print:action')(retryEvent,'print',settings);
  assert.match((await handlers.get('print:action')(retryEvent,'print',settings)).message,/wait/);
  source.close(); // document.write source windows may close before the preview.
  assert(!retrySnapshot.isDestroyed());
  retryPreview.close();assert(!retrySnapshot.isDestroyed());
  finishPrint(true);await pending;await retryCompletion;assert(retrySnapshot.isDestroyed());
  const next=new FakeWindow({});bridge.attach(next);
  const nextEvent={sender:next.webContents,senderFrame:next.webContents.mainFrame};
  const count=windows.length;
  const first=handlers.get('print:preview')(nextEvent,'<html/>');
  const second=handlers.get('print:preview')(nextEvent,'<html/>');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(windows.length,count+2,'concurrent requests create one snapshot and preview');
  windows.at(-1).close();await Promise.all([first,second]);
  const third=handlers.get('print:preview')(nextEvent,'<html/>');await new Promise(resolve=>setImmediate(resolve));
  windows.at(-1).close();await third;next.close();
});

test('native print IPC rejects suspended entitlement before creating a PDF or printer window',async()=>{
 const handlers=new Map(),source={webContents:new EventEmitter(),once(){}};
 source.webContents.mainFrame={};
 installPrintPreview({app:{},BrowserWindow:class{constructor(){throw Error('Must not create a print window');}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{},authorize:()=>{throw Error('License suspended');}}).attach(source);
 await assert.rejects(handlers.get('print:preview')({sender:source.webContents,senderFrame:source.webContents.mainFrame},'<html/>'),/License suspended/);
});
