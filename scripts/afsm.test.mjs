import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64');
const policy=compile(fs.readFileSync('src/core/afsmPolicy.ts','utf8'));const {afsmBusinessDate,afsmDisplay}=await import(policy);
const pdfSource=fs.readFileSync('src/core/afsmPdf.ts','utf8').replace("from './afsmPolicy'",`from '${policy}'`).replace("from 'jspdf'",`from '${new URL('../node_modules/jspdf/dist/jspdf.node.js',import.meta.url).href}'`);
const {makeAfsmPdf,paginateAfsm}=await import(compile(pdfSource));
test('business confirmation date uses India timezone and never account opening date',()=>{
 assert.equal(afsmBusinessDate(new Date('2026-10-12T19:00:00Z')),'13/10/2026');
 assert.equal(afsmDisplay({afsmStatus:'sent',afsmSentAt:'2026-10-13T12:00:00Z',accountOpeningDate:'09/10/2026'}),'AFSM Send to Branch (13/10/2026)');assert.equal(afsmDisplay({}),'Not Sent');
});
test('AFSM real A4 PDF for 1,20,21,40,55,100: first-page-only heading, continuous SL and last-page-only receiver fields',async()=>{
 for(const count of [1,20,21,40,55,100]){
 const records=Array.from({length:count},(_,i)=>({recordId:String(i),name:i===0?'Long Customer Name '.repeat(8):`Synthetic Customer ${i+1}`,accountNo:`AC${i+1}`}));
 const blob=makeAfsmPdf('Punjab National Bank',records,new Date('2026-10-13T12:00:00Z'));
 const task=getDocument({data:new Uint8Array(await blob.arrayBuffer()),disableFontFace:true});const pdf=await task.promise;
 assert.equal(pdf.numPages,Math.ceil(count/20));assert.equal(paginateAfsm(records).flat().length,count);
 for(let page=1;page<=pdf.numPages;page++){
  const p=await pdf.getPage(page);const viewport=p.getViewport({scale:1});assert(Math.abs(viewport.width-595.28)<1);assert(Math.abs(viewport.height-841.89)<1);
  const text=(await p.getTextContent()).items.map(x=>x.str).join(' ');
  assert.equal(text.includes('PUNJAB NATIONAL BANK'),page===1);assert.equal(text.includes('DATA SEND BRANCH'),page===1);
  assert.equal(text.includes('Signature of Receiver'),page===pdf.numPages);assert.equal(text.includes('Completion Date from Receiver'),page===pdf.numPages);
  for(let i=(page-1)*20+1;i<=Math.min(page*20,count);i++)assert(text.includes(`AC${i}`));
 }
 await task.destroy();
 }
});
test('bank setup and empty selection fail clearly; menu and legacy batch confirmation use common service',()=>{
 assert.throws(()=>makeAfsmPdf('',[{name:'One'}]),/Bank Information/);assert.throws(()=>makeAfsmPdf('SBI',[]),/Select/);
 const menu=fs.readFileSync('src/Dashboard.tsx','utf8');assert(menu.indexOf('label="Account Opening PDF Sample"')<menu.indexOf('label="Forms Send to Branch"'));assert(menu.indexOf('label="Forms Send to Branch"')<menu.indexOf('label="Settings"'));
 const customers=fs.readFileSync('src/Customers.tsx','utf8');assert(customers.includes('records.map(record=>String(record.recordId'));assert(customers.includes('<AfsmConfirmation'));assert(customers.includes('customerPdfBuilder()'));
});
