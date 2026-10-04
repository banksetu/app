import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const semanticSource=fs.readFileSync('src/pdfTextTemplate.ts','utf8');
const semanticOutput=ts.transpileModule(semanticSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
globalThis.__semantic=await import('data:text/javascript;base64,'+Buffer.from(semanticOutput).toString('base64'));
const source=fs.readFileSync('src/bankPdf.ts','utf8').replace(/^import .*pdfjs-dist.*;$/m,'').replace('import { readAutomaticCustomer } from \"./pdfTextTemplate\";','const {readAutomaticCustomer}=globalThis.__semantic;');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {parseBankCustomerLines,extractBankCustomer,validateExtractedCustomer}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
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

test('merged adjacent identities, gender and table headings require review rather than autofill',()=>{
 assert.deepEqual(validateExtractedCustomer({enrolId:'T05392130 XXXXXXXX4137',accountNo:'7345010106078 T05392130',name:'Ahmed Hasan Male',nominee:'Date of Birth in Relationship Age',pinCode:'781001',coName:'Abdul Hasan'}),{pinCode:'781001',coName:'Abdul Hasan'});
});

test('reading rectangles include multiline address and exclude adjacent column; automatic labels supplement manual mapping',async()=>{
 const pdf={numPages:1,getPage:async()=>page([item('Alice',100,700),item('Male',250,700),item('Address: Wrong fallback',10,500),item('Village Road',100,600),item('District Assam',100,584)])};
 const result=await extractBankCustomer(pdf,[{field:'name',page:1,x:100/600*100,y:90/800*100,width:20,height:2,fontSize:10},{field:'address',page:1,x:100/600*100,y:190/800*100,width:40,height:5,fontSize:10}],true);
 assert.equal(result.name,'Alice');assert.equal(result.fullAddress,'Village Road District Assam');
 assert.deepEqual(await extractBankCustomer(pdf,[],true),{fullAddress:'Wrong fallback'});
});
test('customer autofill does not enqueue or retain an original PDF upload',()=>{
 const entry=fs.readFileSync('src/CustomerEntry.tsx','utf8');assert(!entry.includes('pdfDataUrl:'));assert(!entry.includes('originalPdfDataUrl'));
});

test('text spanning another column is not copied wholesale into a reading box',async()=>{
 const text={...item('Alice Male',100,700),width:180};
 const pdf={numPages:1,getPage:async()=>page([text])};
 assert.deepEqual(await extractBankCustomer(pdf,[{field:'name',page:1,x:100/600*100,y:90/800*100,width:20,height:2,fontSize:10}],true),{});
});
const formatSource=fs.readFileSync('src/bankFormatUtils.ts','utf8').replace(/^import .*;$/gm,'').replace('GlobalWorkerOptions.workerSrc = pdfWorker;','');
const formatOutput=ts.transpileModule(formatSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {clearSampleRegions,sourceSectionsToPrint}=await import('data:text/javascript;base64,'+Buffer.from(formatOutput).toString('base64'));
test('filled sample cleanup clears only mapped value/photo boxes on their own page',()=>{
 const rectangles=[];const context={fillStyle:'',fillRect:(...args)=>rectangles.push(args)};
 const source=[{field:'name',page:1,x:10,y:20,width:30,height:2,fontSize:10},{field:'customerPhoto',page:2,x:70,y:10,width:15,height:20,fontSize:10}];
 clearSampleRegions(context,1000,2000,source,1);assert.deepEqual(rectangles,[[100,400,300,40]]);assert.equal(context.fillStyle,'#ffffff');
 assert.deepEqual(sourceSectionsToPrint(source).map(p=>[p.x,p.y,p.width,p.height]),source.map(p=>[p.x,p.y,p.width,p.height]));
});

test('automatic labels separate adjacent fields and address punctuation',async()=>{
 const pdf={numPages:1,getPage:async()=>page([item('Customer Name: Alice Gender: Female',20,700),item('Account No: 12345678901 Customer ID: CIF123',20,680),item('Address: Vill/ Sonapur, P.O.- Dispur, PIN Code: 781001',20,660)])};
 const result=await extractBankCustomer(pdf,[],true);
 assert.equal(result.name,'Alice');assert.equal(result.gender,'Female');assert.equal(result.accountNo,'12345678901');assert.equal(result.enrolId,'CIF123');assert.equal(result.address,'Sonapur');assert.equal(result.postOffice,'Dispur');assert.equal(result.pinCode,'781001');
});
test('text template retains labels and excludes previous customer values',async()=>{
 const pdf={numPages:1,getPage:async()=>page([{...item('Customer Name: Previous Person',20,700),width:200},{...item('Account No: 12345678901',20,680),width:200}])};
 const pages=await globalThis.__semantic.readTextTemplate(pdf);
 assert.equal(pages[0].fields.length,2);assert(pages[0].runs.every(run=>!run.text.includes('Previous')&&!run.text.includes('123456')));
 assert.equal(pages[0].fields[0].field,'name');
});
