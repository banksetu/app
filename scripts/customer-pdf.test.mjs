import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCustomerPdf,customersPerPdfPage} from '../src/core/customerPdf.ts';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const dataUrl=`data:image/jpeg;base64,${fs.readFileSync('scripts/fixtures/customer-section.jpg').toString('base64')}`;
const image={dataUrl,width:600,height:310};
test('real A4 document has exactly three customer slots per page for 1,2,3,4,6 and 12',async()=>{
 assert.equal(customersPerPdfPage,3);
 for(const count of [1,2,3,4,6,12]){
  const blob=createCustomerPdf(Array.from({length:count},()=>image));
  assert.equal(blob.type,'application/pdf');assert.ok(blob.size>1000);
  const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.subarray(0,5)),'%PDF-');
  const task=getDocument({data:bytes,disableFontFace:true});const pdf=await task.promise;
  assert.equal(pdf.numPages,Math.ceil(count/3));
  const page=await pdf.getPage(1);const viewport=page.getViewport({scale:1});
  assert.ok(Math.abs(viewport.width-595.28)<1);assert.ok(Math.abs(viewport.height-841.89)<1);
  const operators=await page.getOperatorList();assert.ok(operators.fnArray.length>0);
  await task.destroy();
 }
});
test('invalid image and empty selection fail before producing output',()=>{
 assert.throws(()=>createCustomerPdf([]),/Select at least one/);
 assert.throws(()=>createCustomerPdf([{dataUrl:'data:image/png;base64,dead',width:10,height:10}]),/invalid/);
});
