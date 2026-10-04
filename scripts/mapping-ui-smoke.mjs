import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const harness='mapping-smoke.html', modulePath='src/mapping-smoke.tsx';
fs.writeFileSync(harness,'<div id="root"></div><script type="module" src="/src/mapping-smoke.tsx"></script>');
fs.writeFileSync(modulePath,`import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './BankFormatLayoutEditor';
const mode=new URLSearchParams(location.search).get('mode')==='print'?'print':'extraction';
createRoot(document.getElementById('root')!).render(<Editor mode={mode} sampleUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='800'%3E%3Crect width='600' height='800' fill='white'/%3E%3C/svg%3E" mimeType="image/svg+xml" initialMap={[]} initialWidth={210} initialHeight={297} onSave={async map=>{window.saved=map;}} onClose={()=>{}} />);`);
const fixtureObjects=[
'<< /Type /Catalog /Pages 2 0 R >>',
'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
(()=>{const stream='BT /F1 12 Tf 40 700 Td (Customer Name: Previous Person) Tj ET 0 0 0 RG 40 600 m 400 600 l S';return '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream';})()];
let fixture='%PDF-1.4\n';const offsets=[0];fixtureObjects.forEach((obj,index)=>{offsets.push(fixture.length);fixture+=(index+1)+' 0 obj\n'+obj+'\nendobj\n';});const xref=fixture.length;fixture+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
fs.writeFileSync('pdf-template-smoke.html','<div id="root"></div><script type="module" src="/src/pdf-template-smoke.ts"></script>');
fs.writeFileSync('src/pdf-template-smoke.ts',`import {getDocument,OPS,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';import {readTextTemplate,renderTemplateGraphics} from './pdfTextTemplate';GlobalWorkerOptions.workerSrc=worker;
const task=getDocument({data:Uint8Array.from(atob('${Buffer.from(fixture).toString('base64')}'),c=>c.charCodeAt(0))});const pdf=await task.promise;const template=await readTextTemplate(pdf);const excluded=new Set(Object.entries(OPS).filter(([name])=>/show.*text|show.*glyph|paint.*image/i.test(name)).map(([,value])=>value));const graphics=await renderTemplateGraphics(pdf,excluded);const image=new Image();image.src=graphics[0];await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const textPixels=ctx.getImageData(55,125,400,30).data;const linePixels=ctx.getImageData(55,295,560,10).data;window.templateResult={fields:template[0].fields.map(f=>f.field),labels:template[0].runs.map(r=>r.text),textRemoved:!Array.from(textPixels).some((v,i)=>i%4!==3&&v<240),graphicsKept:Array.from(linePixels).some((v,i)=>i%4!==3&&v<100)};await task.destroy();`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:5198');break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}
 browser=await chromium.launch();
 const templatePage=await browser.newPage();await templatePage.goto('http://127.0.0.1:5198/pdf-template-smoke.html');await templatePage.waitForFunction(()=>window.templateResult);const templateResult=await templatePage.evaluate(()=>window.templateResult);assert(templateResult.textRemoved);assert(templateResult.graphicsKept);assert(templateResult.fields.includes('name'));assert(!templateResult.labels.join(' ').includes('Previous Person'));console.log('Readable PDF template: old text removed, form graphics retained');await templatePage.close();
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1200,height:900},hasTouch:mobile,isMobile:mobile});
  await page.goto('http://127.0.0.1:5198/mapping-smoke.html');
  const surface=page.locator('div[style*="crosshair"]');await surface.waitFor();const box=await surface.boundingBox();
  if(mobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.1,y:box.y+box.height*.1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.4,y:box.y+box.height*.2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.2,{steps:5});await page.mouse.up();}
  await page.getByRole('button',{name:'Save reading sections'}).click();
  const saved=await page.evaluate(()=>window.saved);assert.equal(saved.length,1);assert(saved[0].width>29);assert(saved[0].height>9);
  console.log((mobile?'Touch/mobile':'Desktop')+' reading rectangle/save passed');
  await page.goto('http://127.0.0.1:5198/mapping-smoke.html?mode=print');await surface.waitFor();await surface.click({position:{x:60,y:60}});await page.getByRole('button',{name:'Save print layout'}).click();assert.equal((await page.evaluate(()=>window.saved)).length,1);console.log('Print placement/save passed');await page.close();
 }
}finally{await browser?.close();server.kill();fs.rmSync(harness,{force:true});fs.rmSync(modulePath,{force:true});fs.rmSync('pdf-template-smoke.html',{force:true});fs.rmSync('src/pdf-template-smoke.ts',{force:true});}
