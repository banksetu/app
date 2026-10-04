import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/bankPdf.ts','utf8').replace(/^import .*pdfjs-dist.*;$/m,'');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {parseBankCustomerLines,extractBankCustomer}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
test('blank form labels and placeholder names never become customer values',()=>{
 assert.deepEqual(parseBankCustomerLines(['Name: - Name:-','Address: - Address:-','Mobile: ______','Nominee: SOUMA']),{nominee:'SOUMA'});
 assert.deepEqual(parseBankCustomerLines(['Name: Alice','Customer ID: 001','Mobile: 9876543210','Aadhaar: 123456789012']),{name:'Alice',enrolId:'001',contact:'9876543210'});
});
const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],height:10});
const page=(items)=>({getAnnotations:async()=>[],getTextContent:async()=>({items}),getViewport:()=>({width:600,height:800,convertToViewportPoint:(x,y)=>[x,800-y]})});
test('saved bank coordinates extract opaque PDF fields and respect page isolation',async()=>{
 const pages=[page([item('Name',40,700),item('Alice',100,700),item('999',350,700)]),page([item('001',100,700)])];
 const pdf={numPages:2,getPage:async n=>pages[n-1]};
 const result=await extractBankCustomer(pdf,[{field:'name',page:1,x:100/600*100,y:90/800*100,width:25,fontSize:12},{field:'customerId',page:2,x:100/600*100,y:90/800*100,width:25,fontSize:12},{field:'aadhaar',page:1,x:350/600*100,y:90/800*100,width:20,fontSize:12}]);
 assert.equal(result.name,'Alice');assert.equal(result.enrolId,'001');assert.equal(result.aadhaar,undefined);
});
