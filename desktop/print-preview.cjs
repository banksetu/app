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
  // Only the active printable module is needed in the isolated print window.
  // Copying the dashboard, sidebar, hidden dialogs and cached customer pages
  // made large bank documents take minutes and multiplied embedded image data.
  const roots=[...document.querySelectorAll('[data-print-root="active"]')];
  const visible=roots.filter(node=>node.getClientRects().length&&getComputedStyle(node).display!=='none').at(-1);
  if(visible){
    const copies=[...copy.querySelectorAll('[data-print-root="active"]')];
    const selected=copies[roots.indexOf(visible)];
    if(selected){
      const body=copy.querySelector('body');
      copy.querySelectorAll('body style').forEach(style=>copy.querySelector('head').append(style));
      body.replaceChildren(selected);
      body.className='banksetu-print-snapshot';
      body.setAttribute('data-appearance',document.documentElement.dataset.appearance||'light');
    }
  }
  return '<!doctype html>'+copy.outerHTML;
}
const installPrintScript='window.bankSetuPrintJob=async(options={})=>{window.dispatchEvent(new Event("beforeprint"));try{await Promise.race([Promise.all([document.fonts?.ready,...[...document.images].filter(image=>!image.complete).map(image=>image.decode?image.decode().catch(()=>{}):Promise.resolve())]),new Promise(resolve=>setTimeout(resolve,1500))]);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const html=('
  +capturePrintDocument.toString()+')();return await window.bankSetuPrint.preview(html,{...options,appearance:document.documentElement.dataset.appearance||document.querySelector(".banksetu-app-shell")?.dataset.appearance||"light"});}finally{window.dispatchEvent(new Event("afterprint"));}};window.print=()=>{void window.bankSetuPrintJob().catch(error=>alert("Print preview failed: "+error.message));};';

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function previewHtml(pdf,printers,appearance="light",preferredPrinter="") {
  appearance=appearance==="dark"?"dark":"light";
  const preferredAvailable=printers.some(printer=>printer.name===preferredPrinter);
  const options=printers.map(printer=>'<option value="'+escape(printer.name)+'"'+((preferredAvailable?printer.name===preferredPrinter:printer.isDefault)?' selected':'')+'>'+escape(printer.displayName||printer.name)+'</option>').join('');
  return '<!doctype html><html data-appearance="'+appearance+'"><head><meta charset="utf-8"><title>Bank Setu · Print</title><style>'+
    '*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#e8eaed;color:#202124;display:grid;grid-template-columns:1fr 320px;height:100vh}main{position:relative;min-width:0;min-height:0}iframe{width:100%;height:100%;border:0}#rendering{position:absolute;inset:0;display:grid;place-items:center;background:#e8eaed;color:#334155;font-weight:700}#rendering[hidden]{display:none}aside{padding:26px;background:white;display:flex;flex-direction:column;gap:18px;overflow:auto}h2{margin:0;font-size:22px}label{display:grid;gap:8px}select,input{width:100%;padding:10px;border:1px solid #dadce0;border-radius:6px;font:inherit}.buttons{display:flex;gap:10px;margin-top:auto}button{padding:11px 16px;border:0;border-radius:6px;background:#1967d2;color:white;font:inherit;cursor:pointer}button.secondary{background:#eef1f5;color:#202124}#status{font-size:12px;min-height:30px;overflow-wrap:anywhere}html[data-appearance=dark]{color-scheme:dark}html[data-appearance=dark] body,html[data-appearance=dark] #rendering{background:#0b1220;color:#f8fafc}html[data-appearance=dark] aside{background:#172338}html[data-appearance=dark] :is(select,input){background:#233249;color:#f8fafc;border-color:#42536b}html[data-appearance=dark] button.secondary{background:#33455f;color:#f8fafc}</style></head><body>'+
    '<main><iframe id="preview" title="Print page preview" src="data:application/pdf;base64,'+pdf.toString('base64')+'#toolbar=0"></iframe><div id="rendering">Rendering document preview…</div></main><aside><h2>Print</h2>'+
    '<label>Destination<select id="destination">'+options+'<option value="pdf">Save as PDF</option></select></label>'+
    '<label>Pages<input id="pages" placeholder="All pages · e.g. 1-3, 5"></label>'+
    '<label>Layout<select id="layout"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>'+
    '<label>Color<select id="color"><option value="color">Color</option><option value="mono">Black and white</option></select></label>'+
    '<details><summary>More settings</summary><label>Paper size<select id="paper"><option value="document">Document / passbook size</option><option value="A4">A4</option><option value="Letter">Letter</option></select></label><label><span><input id="duplex" type="checkbox" style="width:auto"> Duplex printing</span></label></details>'+
    '<label>Copies<input id="copies" type="number" min="1" max="99" value="1"></label>'+
    '<label>Scale (%)<input id="scale" type="number" min="25" max="200" value="100"></label>'+
    '<div id="status" role="status" aria-live="polite">Preview uses the document print layout. Print sends directly to the selected printer. Cancel closes this preview.</div>'+
    '<div class="buttons"><button id="print">Print</button><button class="secondary" id="cancel">Cancel</button></div></aside>'+
    '<script>const $=id=>document.getElementById(id);$("preview").onload=()=>$("rendering").hidden=true;const settings=()=>({deviceName:$("destination").value,color:$("color").value==="color",pageRanges:$("pages").value,landscape:$("layout").value==="landscape",paper:$("paper").value,copies:Number($("copies").value),scale:Number($("scale").value),duplex:$("duplex").checked});'+
    'window.bankSetuSetPrinters=(printers,preferred)=>{const select=$("destination"),current=select.value,available=printers.some(item=>item.name===preferred),fragment=document.createDocumentFragment();for(const item of printers){const option=document.createElement("option");option.value=item.name;option.textContent=item.displayName||item.name;option.selected=available?item.name===preferred:(!available&&item.isDefault);fragment.append(option)}const pdfOption=document.createElement("option");pdfOption.value="pdf";pdfOption.textContent="Save as PDF";fragment.append(pdfOption);select.replaceChildren(fragment);if(current&&[...select.options].some(option=>option.value===current))select.value=current;$("print").textContent=select.value==="pdf"?"Save":"Print";$("status").textContent=printers.length?"Preview ready.":"No installed printer was found. You can still Save as PDF."};'+
    '$("destination").onchange=()=>{$("print").textContent=$("destination").value==="pdf"?"Save":"Print"};'+
    'async function run(action){$("print").disabled=true;try{const result=await window.bankSetuPrintPreview.action(action,settings());if(result.pdf)$("preview").src="data:application/pdf;base64,"+result.pdf+"#toolbar=0";$("status").textContent=result.accepted?"Print request accepted by the system.":result.message||"";if(result.accepted)setTimeout(()=>window.close(),350)}catch(error){$("status").textContent=action==="print"?"Print Failed/Error: "+error.message:error.message}finally{$("print").disabled=false}}'+
    'for(const id of ["layout","paper","pages","scale"])$(id).onchange=()=>run("preview");$("print").onclick=()=>run($("destination").value==="pdf"?"save":"print");$("cancel").onclick=()=>window.close();document.addEventListener("keydown",e=>{if(e.key==="Escape")window.close()});</script></body></html>';
}

function preparingHtml(appearance="light"){
  appearance=appearance==="dark"?"dark":"light";
  return '<!doctype html><html data-appearance="'+appearance+'"><head><meta charset="utf-8"><title>Bank Setu · Preparing Print</title><style>html{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#e8eaed;font:16px system-ui;color:#202124}.box{width:min(420px,calc(100vw - 40px));padding:28px;border-radius:16px;background:white;box-shadow:0 18px 60px #0003;text-align:center}.spinner{width:38px;height:38px;margin:0 auto 18px;border:4px solid #cbd5e1;border-top-color:#1967d2;border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}html[data-appearance=dark] body{background:#0b1220;color:#f8fafc}html[data-appearance=dark] .box{background:#172338}</style></head><body><div class="box"><div class="spinner"></div><h2>Preparing print preview…</h2><p>Bank Setu is rendering only the active document. You can cancel by closing this window.</p></div></body></html>';
}
function installPrintPreview({app,BrowserWindow,ipcMain,dialog,parentWindow,getParentWindow=()=>parentWindow,authorize=()=>{},getDefaultPrinter=()=>""}) {
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
    const parentWindow=getParentWindow();
    let preview=new BrowserWindow({show:false,width:1150,height:800,minWidth:850,minHeight:550,...(parentWindow&&!parentWindow.isDestroyed()?{parent:parentWindow,modal:true,frame:false,skipTaskbar:true,...parentWindow.getContentBounds()}:{}),title:'Bank Setu Print Preview',webPreferences:{preload:path.join(__dirname,'print-preview-preload.cjs'),plugins:true,nodeIntegration:false,contextIsolation:true,sandbox:true}});
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
      Object.assign(state,{snapshot,snapshotContents,preview,printers:[],contents:preview.webContents});previews.set(state.contents,state);
      preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      preview.webContents.on('will-navigate',e=>e.preventDefault());
      preview.once('closed',cleanup);
      await preview.loadURL('data:text/html;charset=utf-8;base64,'+Buffer.from(preparingHtml(requested?.appearance)).toString('base64'));
      preview.show?.();
      const printersTask=snapshotContents.getPrintersAsync().catch(()=>[]).then(printers=>{
        state.printers=printers;
        if(!state.closed&&!preview.isDestroyed()&&state.ready)void preview.webContents.executeJavaScript(`window.bankSetuSetPrinters(${JSON.stringify(printers)},${JSON.stringify(getDefaultPrinter())})`).catch(()=>{});
        return printers;
      });
      await snapshot.loadURL('data:text/html;charset=utf-8;base64,'+Buffer.from(html).toString('base64'));
      if(state.closed)return completion;
      const initial={paper:'document',landscape:false,scale:100,pageRanges:'',duplex:requested?.duplex===true};
      const pdf=await snapshotContents.printToPDF(pdfOptions(initial));
      if(state.closed)return completion;
      const box=/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
      const documentSize=box?{width:Math.round(Number(box[1])*25400/72),height:Math.round(Number(box[2])*25400/72)}:undefined;
      state.documentSize=documentSize;
      await preview.loadURL('data:text/html;charset=utf-8;base64,'+Buffer.from(previewHtml(pdf,state.printers,requested?.appearance,getDefaultPrinter())).toString('base64'));
      state.ready=true;
      void printersTask.then(printers=>!state.closed&&!preview.isDestroyed()&&preview.webContents.executeJavaScript(`window.bankSetuSetPrinters(${JSON.stringify(printers)},${JSON.stringify(getDefaultPrinter())})`).catch(()=>{}));
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
module.exports={installPrintPreview,capturePrintDocument,previewHtml};
