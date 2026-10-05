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
const {clearSampleRegions,sourceSectionsToPrint,accountOpeningPrintMap,bankTemplateValue,splitPrintName,splitPrintAddress,mergeAccountOpeningPrintMap}=await import('data:text/javascript;base64,'+Buffer.from(formatOutput).toString('base64'));
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

test('PIN is recovered from mapped full address without a PIN label',async()=>{
 const pdf={numPages:1,getPage:async()=>page([item('Vill- Bundashil, P.O.- Badarpur, KARIMGANJ ASSAM 788806',100,600)])};
 const result=await extractBankCustomer(pdf,[{field:'address',page:1,x:100/600*100,y:190/800*100,width:75,height:4,fontSize:10}],true);assert.equal(result.pinCode,'788806');
});
test('fixed instructions survive and repeated generic names do not duplicate customer data',async()=>{
 const pdf={numPages:1,getPage:async()=>page([{...item('Customer Name: Old Person',20,700),width:180},{...item('Name of nominee',20,650),width:100},{...item('Please read the declaration carefully',20,600),width:220},{...item('Customer Name: Old Person',20,550),width:180}])};
 const [template]=await globalThis.__semantic.readTextTemplate(pdf);assert.equal(template.fields.filter(f=>f.field==='name').length,1);assert(template.runs.some(r=>r.text==='Please read the declaration carefully'));assert(template.runs.some(r=>r.text==='Name of nominee'));
});

test('account-opening address prints once, wraps within its block and shares left alignment',()=>{
 const mapping=[{field:'name',x:32,y:20,page:1,width:25,fontSize:10,align:'center'},{field:'address',x:55,y:40,page:1,width:20,height:2,fontSize:10,align:'right'},{field:'village',x:50,y:40,page:1,width:20,fontSize:10},{field:'postOffice',x:70,y:40,page:1,width:15,fontSize:10},{field:'pinCode',x:60,y:41,page:1,width:12,fontSize:10},{field:'dateOfBirth',x:55,y:55,page:1,width:20,fontSize:10}];
 const result=accountOpeningPrintMap(mapping);assert.equal(result.length,3);const address=result.find(item=>item.field==='address');assert.equal(address.x,32);assert.equal(address.align,'left');assert.equal(address.height,9);assert.equal(address.width,58);assert(result.every(item=>item.align==='left'));
 assert.equal(bankTemplateValue({fullAddress:'C/O Ali, Vill Road, P.O. Town, 788806',address:'Road'},'address'),'C/O Ali, Vill Road, P.O. Town, 788806');assert.equal(bankTemplateValue({fullAddress:'  ',address:'Village Road'},'address'),'Village Road');
});

test('address block removes old C/O Vill P.O. labels and duplicate Care Of placement',()=>{
 const mapping=accountOpeningPrintMap([{field:'name',page:1,x:35,y:20,width:25,fontSize:10},{field:'address',page:1,x:35,y:40,width:40,fontSize:10},{field:'fatherName',page:1,x:35,y:40,width:25,fontSize:10}]);assert(!mapping.some(field=>field.field==='fatherName'));
 const run=(text,x,y)=>({text,x,y,width:50,height:10,fontSize:12});
 const pages=globalThis.__semantic.clearAddressTemplate([{width:600,height:800,fields:[],runs:[run('Flat No / Bldg',30,320),run('C/O:',210,320),run('Vill:',300,320),run('P.O.:',400,320),run('Customer Name',30,100)]}],mapping);
 assert.deepEqual(pages[0].runs.map(run=>run.text),['Flat No / Bldg','Customer Name']);
 assert.equal(bankTemplateValue({fullAddress:'C/O Ali, Vill- Bundashil, P.O.- Badarpur, 788806'},'address'),'C/O Ali, Vill- Bundashil, P.O.- Badarpur, 788806');
});

test('AOF footer signature and address proof headings are never customer values',()=>{
 assert.deepEqual(validateExtractedCustomer({name:'Signature GBPA / PF No Date',fullAddress:'Proof',coName:'Abdul Kalam'}),{coName:'Abdul Kalam'});
 const entry=fs.readFileSync('src/CustomerEntry.tsx','utf8');
 assert(entry.indexOf('...bankSpecific,')>entry.indexOf('...await extractBankCustomer(pdf, extractionMap'));
});


test('print names obey single, two, three and longer word rules without changing the source', () => {
 assert.deepEqual(splitPrintName('  RAVI  '), {firstName:'', middleName:'', lastName:'RAVI'});
 assert.deepEqual(splitPrintName('RAVI   SHARMA'), {firstName:'RAVI', middleName:'', lastName:'SHARMA'});
 assert.deepEqual(splitPrintName('RAVI KUMAR SHARMA'), {firstName:'RAVI', middleName:'KUMAR', lastName:'SHARMA'});
 assert.deepEqual(splitPrintName('RAVI KUMAR DEV SHARMA'), {firstName:'RAVI', middleName:'KUMAR DEV', lastName:'SHARMA'});
 assert.deepEqual(splitPrintName(''), {firstName:'', middleName:'', lastName:''});
 assert.equal(bankTemplateValue({name:'  RAVI  SHARMA'}, 'lastName'), 'SHARMA');
});

test('address print lines retain all words, punctuation and PIN in two or three boxes', () => {
 const address='House 12, Village Road, Post Office Dispur, Assam 781001';
 for (const count of [1,2,3]) {
  const lines=splitPrintAddress(address,count);
  assert.equal(lines.length,count);assert.equal(lines.filter(Boolean).join(' '),address);
 }
 assert.deepEqual(splitPrintAddress('House 12\nVillage Road\nAssam 781001',3),['House 12','Village Road','Assam 781001']);
 assert.deepEqual(splitPrintAddress('',3),['','','']);
 assert.equal(bankTemplateValue({fullAddress:'Road\nTown'},'addressLine2',2),'Town');
});

test('explicit name/address boxes retain page, coordinates, size and alignment', () => {
 const box=(field,x,page=1)=>({field,page,x,y:40,width:18,height:3,fontSize:11,align:'center',uppercase:true});
 const automatic=[box('name',10),box('address',10),box('pinCode',10),box('name',15,2)];
 const manual=[box('firstName',20),box('lastName',65),box('addressLine1',24),box('addressLine2',48)];
 const before=JSON.stringify(manual);
 const result=mergeAccountOpeningPrintMap(automatic,manual);
 assert.deepEqual(result.slice(-manual.length),manual);
 assert.equal(JSON.stringify(manual),before);
 assert(!result.some(item=>item.page===1&&['name','address','pinCode'].includes(item.field)));
 assert(result.some(item=>item.page===2&&item.field==='name'));
});


globalThis.__aofName = splitPrintName;
const unionSource=fs.readFileSync('src/unionAofLayout.ts','utf8').replace('import { splitPrintName } from "./bankFormatUtils";', 'const splitPrintName = globalThis.__aofName;');
const unionOutput=ts.transpileModule(unionSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {unionAofValues,unionAofOverflow,UNION_AOF_BOXES}=await import('data:text/javascript;base64,'+Buffer.from(unionOutput).toString('base64'));
test('Union AOF maps applicant, guardian and nominee separately and preserves unknown address fields',()=>{
 const source={name:'RAVI',coName:'MOHAN LAL DAS',nominee:'ASHA DAS',enrolId:'00123',contact:'9876543210',address:'DISPUR',fullAddress:'Dispur Kamrup Assam 781001'};
 const result=unionAofValues(source);
 assert.equal(result.firstName,'');assert.equal(result.lastName,'RAVI');
 assert.equal(result.fatherMiddleName,'LAL');assert.equal(result.nomineeFirstName,'ASHA');assert.equal(result.nomineeLastName,'DAS');
 assert.equal(result.customerId,'00123');assert.equal(result.mobile,'9876543210');
 assert.equal(result.village,'DISPUR');assert.equal(result.houseNo,'');assert.equal(result.nomineeVillage,'');
 assert(UNION_AOF_BOXES.every(box=>box.x>=0&&box.y>=0&&box.x+(box.width||box.cells*24.8)<=1132&&box.y+24<=1600));
 assert.equal(source.name,'RAVI');
});
test('Union AOF reports long boxed values instead of silently dropping characters',()=>{
 const value='ABCDEFGHIJKLMNOP';
 const result=unionAofValues({name:value});
 assert.equal(result.lastName,value);
 assert(unionAofOverflow(result).some(box=>box.key==='lastName'));
 assert.equal(unionAofOverflow(unionAofValues({name:'RAVI KUMAR DAS'})).length,0);
});
