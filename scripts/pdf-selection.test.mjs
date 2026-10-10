import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=ts.transpileModule(fs.readFileSync('src/core/pdfSelection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {loadPdfCustomers}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('complete local customer selection makes no cloud request',async()=>{
 const local=[{recordId:'one',name:'Local'}];let calls=0;
 assert.deepEqual(await loadPdfCustomers(local,false,true,async()=>{calls++;throw Error('unexpected');}),{records:local,incomplete:false});
 assert.equal(calls,0);
});

test('incomplete local cache fetches verified pages and deduplicates stable IDs',async()=>{
 let calls=0;
 const result=await loadPdfCustomers([{recordId:'one'}],true,true,async(page,size)=>{
   calls++;assert.equal(size,100);
   return page===1?{success:true,customers:[{recordId:'one'},{recordId:'two'}],hasNextPage:true}:{success:true,customers:[{recordId:'two'},{recordId:'three'}],hasNextPage:false};
 });
 assert.deepEqual(result,{records:[{recordId:'one'},{recordId:'two'},{recordId:'three'}],incomplete:false});assert.equal(calls,2);
});

test('offline partial cache stays visibly partial; failed tenant page cannot produce a partial PDF',async()=>{
 const local=[{recordId:'one'}];
 assert.deepEqual(await loadPdfCustomers(local,true,false,undefined),{records:local,incomplete:true});
 await assert.rejects(loadPdfCustomers(local,true,true,async()=>({success:false,message:'Bridge unavailable'})),/Bridge unavailable/);
});
