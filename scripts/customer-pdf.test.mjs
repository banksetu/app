import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCustomerPdf,createFastCustomerPdf,customersPerPdfPage} from '../src/core/customerPdf.ts';
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
test('fast vector export scales to 2769 customers and keeps five sections per page',async()=>{
 const records=Array.from({length:2769},(_,index)=>({
  aofNo:`AOF-${index+1}`,enrolId:`CIF-${index+1}`,accountNo:`100000${index+1}`,
  accountOpeningDate:'2026-10-28',name:`Synthetic Customer ${index+1}`,coName:'Guardian Name',
  fullAddress:'C/O Guardian, Badarpur, Karimganj, Assam',pinCode:'788806',contact:'9000000000',
  uidaiNo:'123412341234',status:'Active',dbtStatus:'Active',passbookStatus:'Issued'
 }));
 let progress=0;const started=performance.now();
 const blob=await createFastCustomerPdf(records,{progress:done=>{progress=done;},yieldEvery:240});
 const elapsed=performance.now()-started;
 assert.equal(progress,records.length);assert.equal(blob.type,'application/pdf');assert.ok(blob.size>1000);
 const task=getDocument({data:new Uint8Array(await blob.arrayBuffer()),disableFontFace:true});const pdf=await task.promise;
 assert.equal(pdf.numPages,Math.ceil(records.length/customersPerPdfPage));
 const firstPage=await pdf.getPage(1);const content=await firstPage.getTextContent();
 const pageText=content.items.map(item=>item.str).join(' ');
 assert.match(pageText,/CUSTOMER PREVIEW/);assert.match(pageText,/SYNTHETIC CUSTOMER 1/);
 assert.ok(elapsed<60000,`2769-record vector export took ${Math.round(elapsed)}ms`);
 await task.destroy();
});
test('single customer share and print reuse the visible card while All PDF uses the vector path',()=>{
 const source=fs.readFileSync('src/Customers.tsx','utf8');
 assert.match(source,/const customerPreviewCard = useRef<HTMLDivElement>\(null\)/);
 assert.match(source,/snapshot\(customer as unknown as Record<string, unknown>,customerPreviewCard\.current\)/);
 assert.match(source,/<CustomerPreviewCard customer=\{customer\} cardRef=\{customerPreviewCard\}/);
 assert.match(source,/Direct single-customer print: keep the on-screen card layout on one A4 page/);
 assert.match(source,/width:190mm!important/);
 assert.match(source,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.2fr\) 32mm!important/);
 assert.match(source,/createFastCustomerPdf\(records/);
 assert.doesNotMatch(source,/renderToStaticMarkup\(<CustomerPreviewCard/);
 assert.doesNotMatch(source,/card\.classList\.add\('pdf-capture'\)/);
});
