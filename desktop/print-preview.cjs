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
const installPrintScript='window.print=()=>{window.dispatchEvent(new Event("beforeprint"));const html=('
  +capturePrintDocument.toString()+')();void window.bankSetuPrint.preview(html).catch(error=>alert("Print preview failed: "+error.message)).finally(()=>window.dispatchEvent(new Event("afterprint")));};';

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function previewHtml(pdf,printers) {
  const options=printers.map(printer=>'<option value="'+escape(printer.name)+'"'+(printer.isDefault?' selected':'')+'>'+escape(printer.displayName||printer.name)+'</option>').join('');
  return '<!doctype html><html><head><meta charset="utf-8"><title>Bank Setu · Print</title><style>'+
    '*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#e8eaed;color:#202124;display:grid;grid-template-columns:1fr 320px;height:100vh}iframe{width:100%;height:100%;border:0}aside{padding:26px;background:white;display:flex;flex-direction:column;gap:18px;overflow:auto}h2{margin:0;font-size:22px}label{display:grid;gap:8px}select,input{width:100%;padding:10px;border:1px solid #dadce0;border-radius:6px;font:inherit}.buttons{display:flex;gap:10px;margin-top:auto}button{padding:11px 16px;border:0;border-radius:6px;background:#1967d2;color:white;font:inherit;cursor:pointer}button.secondary{background:#eef1f5;color:#202124}#status{font-size:12px;min-height:30px;overflow-wrap:anywhere}</style></head><body>'+
    '<iframe id="preview" title="Print page preview" src="data:application/pdf;base64,'+pdf.toString('base64')+'"></iframe><aside><h2>Print</h2>'+
    '<label>Destination<select id="destination">'+options+'<option value="pdf">Save as PDF</option></select></label>'+
    '<label>Pages<input id="pages" placeholder="All pages · e.g. 1-3, 5"></label>'+
    '<label>Layout<select id="layout"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>'+
    '<label>Paper size<select id="paper"><option value="document">Document / passbook size</option><option value="A4">A4</option><option value="Letter">Letter</option></select></label>'+
    '<label>Copies<input id="copies" type="number" min="1" max="99" value="1"></label>'+
    '<label>Scale (%)<input id="scale" type="number" min="25" max="200" value="100"></label>'+
    '<div id="status">Preview uses the document print layout. Your printer dialog opens when you press Print.</div>'+
    '<div class="buttons"><button id="print">Print</button><button class="secondary" id="cancel">Cancel</button></div></aside>'+
    '<script>const $=id=>document.getElementById(id);const settings=()=>({deviceName:$("destination").value,pageRanges:$("pages").value,landscape:$("layout").value==="landscape",paper:$("paper").value,copies:Number($("copies").value),scale:Number($("scale").value)});'+
    '$("destination").onchange=()=>{$("print").textContent=$("destination").value==="pdf"?"Save":"Print"};'+
    'async function run(action){$("print").disabled=true;try{const result=await window.bankSetuPrintPreview.action(action,settings());if(result.pdf)$("preview").src="data:application/pdf;base64,"+result.pdf;$("status").textContent=result.message||""}catch(error){$("status").textContent=error.message}finally{$("print").disabled=false}}'+
    'for(const id of ["layout","paper","pages","scale"])$(id).onchange=()=>run("preview");$("print").onclick=()=>run($("destination").value==="pdf"?"save":"print");$("cancel").onclick=()=>window.close();</script></body></html>';
}
function installPrintPreview({app,BrowserWindow,ipcMain,dialog}) {
  const sources=new Set(),previews=new Map(),active=new Map();
  function attach(source){
    sources.add(source.webContents);
    const inject=()=>{if(!source.webContents.isDestroyed())void source.webContents.executeJavaScript(installPrintScript).catch(()=>{});};
    source.webContents.on('dom-ready',inject);
    source.webContents.on('did-finish-load',inject);
    source.once('closed',()=>{sources.delete(source.webContents);active.get(source.webContents)?.close();});
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
  ipcMain.handle('print:preview',async(event,html)=>{
    if(!sources.has(event.sender)||event.senderFrame!==event.sender.mainFrame)throw Error('Untrusted print request.');
    if(typeof html!=='string'||html.length>60*1024*1024)throw Error('Print document is too large.');
    if(active.has(event.sender)){active.get(event.sender).focus();return;}
    const snapshot=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false}});
    let preview;
    try{
      snapshot.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      await snapshot.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
      const initial={paper:'document',landscape:false,scale:100,pageRanges:''};
      const pdf=await snapshot.webContents.printToPDF(pdfOptions(initial));
      const printers=await snapshot.webContents.getPrintersAsync();
      preview=new BrowserWindow({width:1150,height:800,minWidth:850,minHeight:550,title:'Bank Setu Print Preview',webPreferences:{preload:path.join(__dirname,'print-preview-preload.cjs'),plugins:true,nodeIntegration:false,contextIsolation:true,sandbox:true}});
      const state={snapshot,preview,printers};previews.set(preview.webContents,state);active.set(event.sender,preview);
      preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      preview.webContents.on('will-navigate',e=>e.preventDefault());
      preview.once('closed',()=>{previews.delete(preview.webContents);active.delete(event.sender);if(!snapshot.isDestroyed())snapshot.destroy();});
      await preview.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(previewHtml(pdf,printers)));
    }catch(error){if(preview&&!preview.isDestroyed())preview.destroy();if(!snapshot.isDestroyed())snapshot.destroy();throw error;}
  });
  ipcMain.handle('print:action',async(event,action,input)=>{
    const state=previews.get(event.sender);
    if(!state||event.senderFrame!==event.sender.mainFrame)throw Error('Untrusted print preview.');
    if(!['preview','save','print'].includes(action))throw Error('Invalid print action.');
    const options={paper:input?.paper,landscape:input?.landscape===true,scale:Number(input?.scale),copies:Number(input?.copies),pageRanges:String(input?.pageRanges||'').trim(),deviceName:String(input?.deviceName||'')};
    if(!['document','A4','Letter'].includes(options.paper)||!Number.isFinite(options.scale)||options.scale<25||options.scale>200||!Number.isInteger(options.copies)||options.copies<1||options.copies>99)throw Error('Invalid print settings.');
    const pageRanges=ranges(options.pageRanges);
    if(action==='preview'){const pdf=await state.snapshot.webContents.printToPDF(pdfOptions(options));return {pdf:pdf.toString('base64')};}
    if(action==='save'){
      const selected=await dialog.showSaveDialog(state.preview,{defaultPath:path.join(app.getPath('documents'),'BankSetu-print.pdf'),filters:[{name:'PDF document',extensions:['pdf']}]});
      if(selected.canceled)return {message:'Save cancelled.'};
      const pdf=await state.snapshot.webContents.printToPDF(pdfOptions(options));await fs.promises.writeFile(selected.filePath,pdf);return {message:'PDF saved.'};
    }
    if(!state.printers.some(printer=>printer.name===options.deviceName))throw Error('Choose an installed printer, or Save as PDF.');
    const printOptions={silent:false,printBackground:true,deviceName:options.deviceName,copies:options.copies,landscape:options.landscape,scaleFactor:options.scale,margins:{marginType:'none'},...(pageRanges?{pageRanges}:{}),...(options.paper!=='document'?{pageSize:options.paper}:{})};
    await new Promise((resolve,reject)=>state.snapshot.webContents.print(printOptions,(ok,reason)=>ok?resolve():reject(Error(reason||'Printing cancelled or failed.'))));
    return {message:'Print request sent to the printer.'};
  });
  return {attach};
}
module.exports={installPrintPreview,capturePrintDocument};
