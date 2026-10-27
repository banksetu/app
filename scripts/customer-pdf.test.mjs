import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCustomerPdf,customersPerPdfPage} from '../src/core/customerPdf.ts';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const dataUrl=`data:image/jpeg;base64,${fs.readFileSync('scripts/fixtures/customer-section.jpg').toString('base64')}`;
const image={dataUrl,width:600,height:310};
test('real A4 document has exactly five customer slots per page for 1,5,6 and 12',async()=>{
 assert.equal(customersPerPdfPage,5);
 for(const count of [1,5,6,12]){
  const blob=createCustomerPdf(Array.from({length:count},()=>image));
  assert.equal(blob.type,'application/pdf');assert.ok(blob.size>1000);
  const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.subarray(0,5)),'%PDF-');
  const task=getDocument({data:bytes,disableFontFace:true});const pdf=await task.promise;
  assert.equal(pdf.numPages,Math.ceil(count/5));
  const page=await pdf.getPage(1);const viewport=page.getViewport({scale:1});
  assert.ok(Math.abs(viewport.width-595.28)<1);assert.ok(Math.abs(viewport.height-841.89)<1);
  const operators=await page.getOperatorList();assert.ok(operators.fnArray.length>0);
  await task.destroy();
 }
});
test('large export page budgets use five slots without losing remainder',()=>{
 for(const [customers,pages] of [[2760,552],[10000,2000],[20000,4000]])assert.equal(Math.ceil(customers/customersPerPdfPage),pages);
});
test('invalid image and empty selection fail before producing output',()=>{
 assert.throws(()=>createCustomerPdf([]),/Select at least one/);
 assert.throws(()=>createCustomerPdf([{dataUrl:'data:image/png;base64,dead',width:10,height:10}]),/invalid/);
});
test('single customer share and print reuse the visible card without changing All PDF',()=>{
 const source=fs.readFileSync('src/Customers.tsx','utf8');
 assert.match(source,/const customerPreviewCard = useRef<HTMLDivElement>\(null\)/);
 assert.match(source,/snapshot\(customer as unknown as Record<string, unknown>,customerPreviewCard\.current\)/);
 assert.match(source,/<CustomerPreviewCard customer=\{customer\} cardRef=\{customerPreviewCard\}/);
 assert.match(source,/Direct single-customer print: keep the on-screen card layout on one A4 page/);
 assert.match(source,/width:190mm!important/);
 assert.match(source,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.2fr\) 32mm!important/);
 assert.match(source,/card\.classList\.add\('pdf-capture'\)/,'All PDF must retain its separate compact capture path');
});
