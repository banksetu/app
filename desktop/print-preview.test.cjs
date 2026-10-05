const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {installPrintPreview}=require('./print-preview.cjs');
test('Windows preview freezes print HTML, isolates IPC, validates settings and keeps passbook size',async()=>{
  const handlers=new Map(),windows=[],pdfOptions=[],printOptions=[];
  class FakeWindow extends EventEmitter{
    constructor(options){super();this.options=options;this.destroyed=false;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.isDestroyed=()=>false;this.webContents.setWindowOpenHandler=()=>{};this.webContents.executeJavaScript=async()=>{};this.webContents.getPrintersAsync=async()=>[{name:'test-printer',isDefault:true}];this.webContents.printToPDF=async options=>{pdfOptions.push(options);return Buffer.from('%PDF-test')};this.webContents.print=(options,callback)=>{printOptions.push(options);callback(true)};windows.push(this);}
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
  await handlers.get('print:preview')(event,'<html><body>Customer snapshot</body></html>');
  const snapshot=windows[1],preview=windows[2];
  assert.equal(snapshot.options.webPreferences.javascript,false);
  assert.equal(preview.options.webPreferences.nodeIntegration,false);
  assert.equal(preview.options.webPreferences.plugins,true);
  assert(decodeURIComponent(snapshot.url).includes('Customer snapshot'));
  assert.equal(pdfOptions[0].preferCSSPageSize,true);
  const previewEvent={sender:preview.webContents,senderFrame:preview.webContents.mainFrame};
  const settings={paper:'document',landscape:false,scale:100,copies:1,pageRanges:'1-2, 4',deviceName:'test-printer'};
  await assert.rejects(handlers.get('print:action')(event,'print',settings),/Untrusted/);
  await assert.rejects(handlers.get('print:action')(previewEvent,'print',{...settings,deviceName:'other'}),/installed printer/);
  await assert.rejects(handlers.get('print:action')(previewEvent,'print',{...settings,pageRanges:'0-2'}),/page range/);
  await handlers.get('print:action')(previewEvent,'print',settings);
  assert.deepEqual(printOptions[0].pageRanges,[{from:0,to:1},{from:3,to:3}]);
  assert.equal(printOptions[0].silent,false);
  assert.equal(printOptions[0].pageSize,undefined);
  await handlers.get('print:action')(previewEvent,'preview',{...settings,paper:'A4',landscape:true});
  assert.equal(pdfOptions.at(-1).pageSize,'A4');
  assert.equal(pdfOptions.at(-1).landscape,true);
  assert.equal((await handlers.get('print:action')(previewEvent,'save',settings)).message,'Save cancelled.');
  preview.close();assert(snapshot.isDestroyed());
});
