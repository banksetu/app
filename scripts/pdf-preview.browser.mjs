import assert from 'node:assert/strict';
import {writeFile, unlink} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';

// Synthetic PDFs only. Exercises the real React component, PDF.js worker and canvas.
const harness='scripts/.pdf-preview-harness.tsx';
let server, browser;
try {
  await writeFile(harness, `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {jsPDF} from 'jspdf';
import PdfDocumentPreview from '../src/PdfDocumentPreview';
function pdf(color:number[],pages=3){
 const file=new jsPDF();
 for(let index=0;index<pages;index++){
  if(index)file.addPage();
  file.setFillColor(...color);file.rect(0,0,210,297,'F');
  file.setTextColor(255,255,255);file.text('Synthetic page '+(index+1),20,30);
 }
 return file.output('blob');
}
function App(){const [file,setFile]=React.useState(()=>pdf([220,10,10]));return <>
<button onClick={()=>setFile(pdf([10,20,220]))}>Replace PDF</button>
<PdfDocumentPreview file={file}/></>;}
createRoot(document.getElementById('root')!).render(<App/>);
`);
  server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
  server.middlewares.use('/__pdf_preview_test',(_req,res)=>{
    res.setHeader('Content-Type','text/html');
    res.end(`<html><head><style>.customer-pdf-preview{height:500px;overflow:auto}.customer-pdf-page{min-height:700px}.customer-pdf-page canvas{width:100%}</style></head><body><div id="root"></div><script type="module" src="/${harness}"></script></body></html>`);
  });
  await server.listen();
  const url=`http://127.0.0.1:${server.httpServer.address().port}/__pdf_preview_test`;
  browser=await chromium.launch();
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
    const page=await browser.newPage({viewport});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);
    const color=async(number,channel)=>{
      await page.waitForFunction(({number,channel})=>{
        const canvas=document.querySelector('[data-page="'+number+'"] canvas');
        if(!canvas||canvas.width<500||canvas.height<500)return false;
        const pixel=canvas.getContext('2d').getImageData(20,20,1,1).data;
        return pixel[channel]>180&&pixel[(channel+1)%3]<60;
      },{number,channel},{timeout:30000});
    };
    await color(1,0);
    assert.equal(await page.locator('[data-page]').count(),3);
    // Rapid scroll changes must not leave a cancelled or duplicate render blank.
    await page.locator('[data-page="3"]').scrollIntoViewIfNeeded();
    await page.locator('[data-page="1"]').scrollIntoViewIfNeeded();
    await page.locator('[data-page="3"]').scrollIntoViewIfNeeded();
    await color(3,0);
    await page.getByRole('button',{name:'Replace PDF'}).click();
    await page.locator('[data-page="1"]').scrollIntoViewIfNeeded();
    await color(1,2);
    await page.locator('[data-page="3"]').scrollIntoViewIfNeeded();
    await color(3,2);
    assert.equal(await page.getByRole('alert').count(),0);
    assert.deepEqual(errors,[]);
    console.log(`PDF render, scroll and file replacement passed: ${viewport.width}px`);
    await page.close();
  }
} finally {
  await browser?.close();await server?.close();await unlink(harness).catch(()=>{});
}
