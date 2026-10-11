const fs=require('node:fs');
const path=require('node:path');

// Freeze the current print document before React restores screen-only state.
// Replace canvas content so bank samples and customer photographs survive.
function capturePrintDocument() {
  const copy=document.documentElement.cloneNode(true);
  copy.querySelectorAll('script').forEach(node=>node.remove());
  const controls=[...document.querySelectorAll('input,textarea,select')];
  copy.querySelectorAll('input,textarea,select').forEach((node,index)=>{
    const original=controls[index];
    if(node.tagName==='TEXTAREA')node.textContent=original.value;
    else if(node.tagName==='SELECT') [...node.options].forEach(option=>{option.selected=option.value===original.value;if(option.selected)option.setAttribute('selected','');else option.removeAttribute('selected');});
    else {node.setAttribute('value',original.value);if(original.checked)node.setAttribute('checked','');else node.removeAttribute('checked');}
  });
  const canvases=[...document.querySelectorAll('canvas')];
  copy.querySelectorAll('canvas').forEach((node,index)=>{
    const image=document.createElement('img');
    try {image.src=canvases[index].toDataURL();} catch {return;}
    image.className=node.className;image.style.cssText=node.style.cssText;
    image.width=canvases[index].width;image.height=canvases[index].height;
    node.replaceWith(image);
  });
  copy.querySelectorAll('[href]').forEach(node=>{
    const href=node.getAttribute('href');
    if(href&&!href.startsWith('#'))node.setAttribute('href',new URL(href,document.baseURI).href);
  });
  copy.querySelectorAll('[src]').forEach(node=>{
    const src=node.getAttribute('src');
    if(src)node.setAttribute('src',new URL(src,document.baseURI).href);
  });
  const base=document.createElement('base');base.href=document.baseURI;
  copy.querySelector('head').prepend(base);
  return '<!doctype html>'+copy.outerHTML;
}
const installPrintScript='window.bankSetuPrintJob=(options={})=>{window.dispatchEvent(new Event("beforeprint"));const html=('
  +capturePrintDocument.toString()+')();return window.bankSetuPrint.preview(html,options).finally(()=>window.dispatchEvent(new Event("afterprint")));};window.print=()=>{void window.bankSetuPrintJob().catch(error=>alert("Print preview failed: "+error.message));};';

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function previewHtml(pdf,printers) {
  const options=printers.map(printer=>'<option value="'+escape(printer.name)+'"'+(printer.isDefault?' selected':'')+'>'+escape(printer.displayName||printer.name)+'</option>').join('');
  return '<!doctype html><html><head><meta charset="utf-8"><title>Bank Setu · Print</title><style>'+
    '*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#e8eaed;color:#202124;display:grid;grid-template-columns:1fr 320px;height:100vh}iframe{width:100%;height:100%;border:0}aside{padding:26px;background:white;display:flex;flex-direction:column;gap:18px;overflow:auto}h2{margin:0;font-size:22px}label{display:grid;gap:8px}select,input{width:100%;padding:10px;border:1px solid #dadce0;border-radius:6px;font:inherit}.buttons{display:flex;gap:10px;margin-top:auto}button{padding:11px 16px;border:0;border-radius:6px;background:#1967d2;color:white;font:inherit;cursor:pointer}button.secondary{background:#eef1f5;color:#202124}#status{font-size:12px;min-height:30px;overflow-wrap:anywhere}</style></head><body>'+
    '<iframe id="preview" title="Print page preview" src="data:application/pdf;base64,'+pdf.toString('base64')+'#toolbar=0"></iframe><aside><h2>Print</h2>'+
    '<label>Destination<select id="destination">'+options+'<option value="pdf">Save as PDF</option></select></label>'+
    '<label>Pages<input id="pages" placeholder="All pages · e.g. 1-3, 5"></label>'+
    '<label>Layout<select id="layout"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>'+
    '<label>Color<select id="color"><option value="color">Color</option><option value="mono">Black and white</option></select></label>'+
    '<details><summary>More settings</summary><label>Paper size<select id="paper"><option value="document">Document / passbook size</option><option value="A4">A4</option><option value="Letter">Letter</option></select></label><label><span><input id="duplex" type="checkbox" style="width:auto"> Duplex printing</span></label></details>'+
    '<label>Copies<input id="copies" type="number" min="1" max="99" value="1"></label>'+
    '<label>Scale (%)<input id="scale" type="number" min="25" max="200" value="100"></label>'+
    '<div id="status" role="status" aria-live="polite">Preview uses the document print layout. Print sends directly to the selected printer. Cancel closes this preview.</div>'+
    '<div class="buttons"><button id="print">Print</button><button class="secondary" id="cancel">Cancel</button></div></aside>'+
    '<script>const $=id=>document.getElementById(id);const settings=()=>({deviceName:$("destination").value,color:$("color").value==="color",pageRanges:$("pages").value,landscape:$("layout").value==="landscape",paper:$("paper").value,copies:Number($("copies").value),scale:Number($("scale").value),duplex:$("duplex").checked});'+
    '$("destination").onchange=()=>{$("print").textContent=$("destination").value==="pdf"?"Save":"Print"};'+
    'async function run(action){$("print").disabled=true;try{const result=await window.bankSetuPrintPreview.action(action,settings());if(result.pdf)$("preview").src="data:application/pdf;base64,"+result.pdf+"#toolbar=0";$("status").textContent=result.accepted?"Print request accepted by the system.":result.message||"";if(result.accepted)setTimeout(()=>window.close(),350)}catch(error){$("status").textContent=action==="print"?"Print Failed/Error: "+error.message:error.message}finally{$("print").disabled=false}}'+
    'for(const id of ["layout","paper","pages","scale"])$(id).onchange=()=>run("preview");$("print").onclick=()=>run($("destination").value==="pdf"?"save":"print");$("cancel").onclick=()=>window.close();document.addEventListener("keydown",e=>{if(e.key==="Escape")window.close()});</script></body></html>';
}
function installPrintPreview({app,BrowserWindow,ipcMain,dialog,parentWindow,authorize=()=>{}}) {
  const sources=new Set(),previews=new Map(),active=new Map();
  function attach(source){
    // Cache Electron objects while alive: BrowserWindow.webContents throws after close.
    const contents=source.webContents;
    sources.add(contents);
    const inject=()=>{if(!contents.isDestroyed())void contents.executeJavaScript(installPrintScript).catch(()=>{});};
    contents.on('dom-ready',inject);
    contents.on('did-finish-load',inject);
    source.once('closed',()=>{sources.delete(contents);});
  }
  const ranges=value=>{
    if(!value)return undefined;
    if(!/^\d+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*$/.test(value))throw Error('Use page numbers such as 1-3, 5.');
    return value.split(',').map(part=>{const [a,b=a]=part.trim().split('-').map(Number);if(a<1||b<a||b>10000)throw Error('Invalid page range.');return {from:a-1,to:b-1};});
  };
  const pdfOptions=options=>({
    printBackground:true,preferCSSPageSize:options.paper==='document',
    ...(options.paper!=='document'?{pageSize:options.paper}:{}),
    landscape:options.landscape,scale:options.scale/100,
    pageRanges:options.pageRanges,displayHeaderFooter:false,
    margins:{top:0,bottom:0,left:0,right:0}
  });
  ipcMain.handle('print:preview',async(event,html,requested={})=>{
    if(!sources.has(event.sender)||event.senderFrame!==event.sender.mainFrame)throw Error('Untrusted print request.');
    authorize();
    if(typeof html!=='string'||html.length>60*1024*1024)throw Error('Print document is too large.');
    if(active.has(event.sender)){const existing=active.get(event.sender);if(existing.preview&&!existing.preview.isDestroyed())existing.preview.focus();return existing.completion;}
    const source=event.sender;
    let finish;
    const completion=new Promise(resolve=>{finish=resolve});
    const state={closed:false,busy:false,preview:null,completion,finish,outcome:null};
    active.set(source,state);
    const snapshot=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false}});
    const snapshotContents=snapshot.webContents;
    let preview;
    const cleanup=()=>{
      if(state.closed)return;
      state.closed=true;
      if(state.contents)previews.delete(state.contents);
      if(active.get(source)===state)active.delete(source);
      state.finish(state.outcome||{cancelled:true,accepted:false});
      // A submitted print job retains its source until the print callback completes.
      if(!state.busy&&!snapshot.isDestroyed())snapshot.destroy();
    };
    try{
      snapshotContents.setWindowOpenHandler(()=>({action:'deny'}));
      await snapshot.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
      const initial={paper:'document',landscape:false,scale:100,pageRanges:'',duplex:requested?.duplex===true};
      const pdf=await snapshotContents.printToPDF(pdfOptions(initial));
      const printers=await snapshotContents.getPrintersAsync().catch(()=>[]);
      preview=new BrowserWindow({width:1150,height:800,minWidth:850,minHeight:550,...(parentWindow&&!parentWindow.isDestroyed()?{parent:parentWindow,modal:true,frame:false,skipTaskbar:true,...parentWindow.getContentBounds()}:{}),title:'Bank Setu Print Preview',webPreferences:{preload:path.join(__dirname,'print-preview-preload.cjs'),plugins:true,nodeIntegration:false,contextIsolation:true,sandbox:true}});
      const box=/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
      const documentSize=box?{width:Math.round(Number(box[1])*25400/72),height:Math.round(Number(box[2])*25400/72)}:undefined;
      Object.assign(state,{snapshot,snapshotContents,preview,printers,documentSize,contents:preview.webContents});previews.set(state.contents,state);
      preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      preview.webContents.on('will-navigate',e=>e.preventDefault());
      preview.once('closed',cleanup);
      await preview.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(previewHtml(pdf,printers)));
      if(requested?.duplex===true)await preview.webContents.executeJavaScript('document.getElementById("duplex").checked=true').catch(()=>{});
      return completion;
    }catch(error){const cancelled=state.closed;if(preview&&!preview.isDestroyed())preview.destroy();cleanup();if(cancelled)return {cancelled:true};throw error;}
  });
  ipcMain.handle('print:action',async(event,action,input)=>{
    const state=previews.get(event.sender);
    if(!state||event.senderFrame!==event.sender.mainFrame)throw Error('Untrusted print preview.');
    authorize();
    if(!['preview','save','print'].includes(action))throw Error('Invalid print action.');
    const options={paper:input?.paper,landscape:input?.landscape===true,duplex:input?.duplex===true,scale:Number(input?.scale),copies:Number(input?.copies),pageRanges:String(input?.pageRanges||'').trim(),deviceName:String(input?.deviceName||'')};
    if(!['document','A4','Letter'].includes(options.paper)||!Number.isFinite(options.scale)||options.scale<25||options.scale>200||!Number.isInteger(options.copies)||options.copies<1||options.copies>99)throw Error('Invalid print settings.');
    const pageRanges=ranges(options.pageRanges);
    if(state.outcome?.accepted)return {accepted:true,message:'This print job was already accepted.'};
    if(state.busy)return {message:'Please wait for the current print operation.'};
    state.busy=true;
    try {
    if(action==='preview'){const pdf=await state.snapshotContents.printToPDF(pdfOptions(options));return {pdf:pdf.toString('base64')};}
    if(action==='save'){
      const selected=await dialog.showSaveDialog(state.preview,{defaultPath:path.join(app.getPath('documents'),'BankSetu-print.pdf'),filters:[{name:'PDF document',extensions:['pdf']}]});
      if(selected.canceled||state.closed)return {message:'Save cancelled.'};
      const pdf=await state.snapshotContents.printToPDF(pdfOptions(options));await fs.promises.writeFile(selected.filePath,pdf);return {message:'PDF saved.'};
    }
    if(!state.printers.some(printer=>printer.name===options.deviceName))throw Error('Choose an installed printer, or Save as PDF.');
    const printOptions={silent:true,color:input?.color!==false,printBackground:true,deviceName:options.deviceName,copies:options.copies,landscape:options.landscape,duplexMode:options.duplex?'longEdge':'simplex',scaleFactor:options.scale,margins:{marginType:'none'},...(pageRanges?{pageRanges}:{}),...(options.paper!=='document'?{pageSize:options.paper}:state.documentSize?{pageSize:state.documentSize}:{})};
    const result=await new Promise(resolve=>state.snapshotContents.print(printOptions,(ok,reason)=>resolve({ok,reason})));
    if(!result.ok){if(/cancel/i.test(result.reason||''))return {cancelled:true,message:'Print cancelled.'};throw Error(result.reason||'The printer could not accept the job.');}
    state.outcome={accepted:true,cancelled:false};
    return {accepted:true,message:'Print request sent to the printer.'};
    }catch(error){if(state.closed)return {cancelled:true};throw error;}finally{state.busy=false;if(state.closed&&!state.snapshot.isDestroyed())state.snapshot.destroy();}
  });
  return {attach};
}
module.exports={installPrintPreview,capturePrintDocument};
