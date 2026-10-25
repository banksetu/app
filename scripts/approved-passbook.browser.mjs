import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
process.chdir(resolve(import.meta.dirname,'..'));
fs.mkdirSync('test-evidence',{recursive:true});
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const bank={bankName:'Assam Gramin Bank',passbookBank:'Assam Gramin Bank',branchName:'TEST BRANCH',branchAddress:'TEST ROAD',branchPostOffice:'TEST POST',branchDistrict:'TEST DISTRICT',branchPinCode:'001200',branchEmail:'TEST@EXAMPLE.COM',ifsc:'ABCD0000001',micr:'000123000',branchCode:'0001'};
const customer={enrolId:'000001',accountNo:'0001234567890',name:'TEST CUSTOMER',coName:'TEST GUARDIAN',contact:'9000000000',accountOpeningDate:'2024-08-24',issueDate:'2026-10-20',nominee:'2',fullAddress:'VILLAGE TEST\nPOST TEST\nASSAM,INDIA PIN-001200'};
fs.writeFileSync('test-evidence/menu.html','<div id="root"></div><script type="module" src="/test-evidence/menu.tsx"></script>');
fs.writeFileSync('test-evidence/menu.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import Passbook from'../src/Passbook';const q=new URLSearchParams(location.search);const bank=${JSON.stringify(bank)};if(q.get('bank')==='union')Object.assign(bank,{bankName:'Union Bank of India',passbookBank:'Union Bank of India',branchName:'UNION TEST BRANCH',address:'UNION TEST ADDRESS'});if(q.get('tenant')==='second')Object.assign(bank,{branchName:'SECOND BRANCH',micr:'900000009',ifsc:'EFGH0000002'});sessionStorage.setItem('bankSetuTenantId','synthetic-test-only');window.testCalls=[];createRoot(document.getElementById('root')).render(<Passbook bankInfo={bank} formatType={q.get('mode')==='quick'?'quickPassbook':'passbook'}/>);`);
const mocks={
 './core/localData':`export async function getDataIdToken(){return 'synthetic';}export async function localDataFetch(url,options){const body=JSON.parse(options.body);window.testCalls.push(body);return{json:async()=>body.action==='searchCustomer'?{success:true,customer:${JSON.stringify(customer)},rowNumber:1}:{success:true}};}`,
 './core/licenseAccess':`export async function requireLicensedWrite(){if(window.blockTestLicense)throw Error('License suspended');}`,
 'firebase/auth':`export function getAuth(){return{currentUser:{uid:'synthetic'}};}`,
 './tenantApi':`export function getTenantApiUrl(){return '/synthetic-bridge';}`,
 './platform/print':`export async function printCurrentDocument(){window.printCount=(window.printCount||0)+1;return{accepted:true,confirmation:'printer'};}`,
};
const server=await createServer({configFile:false,root:process.cwd(),plugins:[{name:'synthetic-passbook-only',enforce:'pre',resolveId(source,importer){if(importer?.endsWith('/src/Passbook.tsx')&&mocks[source])return '\0test:'+source;if(importer?.endsWith('/src/PrintAlignmentPreview.tsx')&&source==='./firebase')return '\0test:firebase';},load(id){if(id==='\0test:firebase')return 'export const auth={currentUser:null};';if(id.startsWith('\0test:'))return mocks[id.slice(6)];}},react()],server:{host:'127.0.0.1',port:5197,strictPort:true}});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1300,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5197/test-evidence/menu.html');
 await page.locator('.passbook-search-input').fill('0001234567890');await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.locator('.pb-approved-artwork').waitFor();
 assert.equal(await page.locator('[data-field="branchName"]').getAttribute('aria-label'),'branchName: TEST BRANCH');
 assert.equal(await page.locator('[data-field="postOffice"]').getAttribute('aria-label'),'postOffice: TEST POST');
 assert.equal(await page.locator('[data-field="district"]').getAttribute('aria-label'),'district: TEST DISTRICT');
 assert.equal(await page.locator('[data-field="branchPin"]').getAttribute('aria-label'),'branchPin: 001200');
 assert.equal(await page.locator('[data-field="micr"]').getAttribute('aria-label'),'micr: 000123000');
 assert.equal(await page.locator('[data-field="accountNo"]').getAttribute('aria-label'),'accountNo: 0001234567890');
 assert.equal(await page.locator('.passbook-shell img').count(),0);
 const labels=await page.locator('svg>g').first().innerHTML();
 await page.locator('.preview-edit-button').click();
 await page.locator('.edit-field').filter({has:page.locator('label',{hasText:'Account Holder'})}).locator('input').fill('A MUCH LONGER CUSTOMER NAME FOR TEST');
 await page.getByRole('button',{name:'Apply to Preview'}).click();
 assert.equal(await page.locator('[data-field="holder"]').getAttribute('aria-label'),'holder: A MUCH LONGER CUSTOMER NAME FOR TEST');
 assert.equal(await page.locator('svg>g').first().innerHTML(),labels);
 assert.deepEqual(await page.evaluate(()=>window.testCalls.map(x=>x.action)),['searchCustomer']);
 await page.getByRole('button',{name:'Print Passbook',exact:false}).click();
 const frame=page.frameLocator('iframe');await frame.locator('.pb-approved-artwork path').first().waitFor();
 assert.equal(await frame.locator('.pb-approved-artwork path').count(),await page.locator('.passbook-shell .pb-approved-artwork path').count());
 await page.getByRole('button',{name:/Test Print/}).click();
 await page.waitForFunction(()=>window.printCount===1);
 assert.deepEqual(await page.evaluate(()=>window.testCalls.map(x=>x.action)),['searchCustomer']);
 await page.getByRole('button',{name:/Final Print/}).click();
 await page.waitForFunction(()=>window.testCalls.some(x=>x.action==='markPassbookPrinted'));
 assert.equal(await page.locator('.status-chip').innerText(),'Printed');
 await page.emulateMedia({media:'print'});await page.pdf({path:'test-evidence/menu-print.pdf',preferCSSPageSize:true,printBackground:true});
 await page.emulateMedia({media:'screen'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('[data-field="holder"] path').count(),'A MUCH LONGER CUSTOMER NAME FOR TEST'.replaceAll(' ','').length);
 await page.evaluate(()=>window.blockTestLicense=true);await page.getByRole('button',{name:/Print Passbook/}).click();await page.getByRole('button',{name:/Test Print/}).click();await page.getByRole('alert').filter({hasText:'License suspended'}).waitFor();
 assert.equal(await page.evaluate(()=>window.printCount),2);assert.deepEqual(errors,[]);
 console.log('PASS: real Passbook menu search → bank/customer mapping → temporary edit → alignment iframe → test print without status mutation → accepted final print → mobile fixed artwork → suspended license blocked.');
 await page.close();
 for(const bank of ['assam','union'])for(const mode of ['print','quick']){
  const page=await browser.newPage({viewport:{width:1300,height:1100}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:5197/test-evidence/menu.html?bank=${bank}&mode=${mode}`);
  await page.locator('.passbook-search-input').fill('0001234567890');await page.getByRole('button',{name:'Search',exact:true}).click();
  const isAssam=bank==='assam';
  await page.locator(isAssam?'.pb-approved-artwork':'.union-document').waitFor();
  const field=key=>page.locator(`[data-field="${key}"]`);
  const value=async(key)=>isAssam?(await field(key).getAttribute('aria-label')).slice(key.length+2):await field(key).innerText();
  assert.equal(await value('nominee'),isAssam?'1':'2');
  assert.equal(await value('accountNo'),customer.accountNo);
  if(isAssam){assert.equal(await value('openedOn'),'24-08-2024');assert.match(await value('address4'),/ASSAM/);}
  else{assert.equal(await page.locator('.union-upper').count(),mode==='quick'?1:0);assert.equal(await page.locator('.pb-approved-artwork').count(),0);}
  const openEdit=async()=>{
   if(isAssam&&mode==='print'){
    await page.locator('.passbook-shell').hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.preview-edit-button')).opacity==='1');
    await page.locator('.preview-edit-button').click();
   }else await page.getByRole('button',{name:'Temporary Edit',exact:true}).click();
  };
  await openEdit();
  const edits={'Customer ID':'EDIT001','Account Number':'0009990001234','Account Holder':'EDITED CUSTOMER','C/O Name':'EDITED GUARDIAN','PAN':'ABCDE0000F','Mobile':'9000000001','Opening Date':'18/10/2026','Nominee':'3'};
  const input=label=>page.locator('.edit-field').filter({has:page.locator('label',{hasText:new RegExp('^'+label+'$')})}).locator('input');
  for(const [label,text]of Object.entries(edits))await input(label).fill(text);
  await page.locator('.edit-panel textarea').fill('C/O EDITED GUARDIAN\nVILL-TEST, P.O-TEST\nASSAM, PIN-001200');
  await page.getByRole('button',{name:'Apply to Preview',exact:true}).click();
  assert.equal(await value('accountNo'),edits['Account Number']);assert.equal(await value('nominee'),'3');
  if(isAssam){
   assert.equal(await value('openedOn'),'18-10-2026');assert.equal(await value('address1'),'C/O EDITED GUARDIAN');assert.equal(await value('address2'),'VILL-TEST, P.O-TEST');if(mode==='print'){assert.equal(await value('address3'),'');assert.equal(await value('address4'),'ASSAM, PIN-001200');}else assert.equal(await value('address3'),'ASSAM, PIN-001200');
  }else assert.equal(await value('address'),'C/O EDITED GUARDIAN\nVILL-TEST, P.O-TEST\nASSAM, PIN-001200');
  await openEdit();for(const [label,text]of Object.entries(edits))assert.equal(await input(label).inputValue(),text);
  await page.getByRole('button',{name:'Cancel Changes',exact:true}).click();
  assert.equal(await value('accountNo'),customer.accountNo);assert.equal(await value('nominee'),isAssam?'1':'2');
  assert.deepEqual(await page.evaluate(()=>window.testCalls.map(x=>x.action)),['searchCustomer']);
  if(isAssam&&mode==='quick'){
   assert.equal(await page.locator('.assam-quick-hints li').count(),7);
   assert.equal(await page.locator('.assam-quick-manager').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length;}),1);
  }
  // The normal alignment preview must contain the same edited renderer.
  await page.getByRole('button',{name:/Print Passbook/}).click();
  await page.frameLocator('iframe').locator(isAssam?'.pb-approved-artwork':'.union-document').waitFor();
  assert.deepEqual(errors,[]);await page.close();
  console.log(`PASS: ${bank} ${mode}: bank selection, default nominee, all temporary edits, cancel, no customer write, alignment preview`);
 }
 const other=await browser.newPage();
 await other.goto('http://127.0.0.1:5197/test-evidence/menu.html?tenant=second&mode=quick');
 await other.locator('.passbook-search-input').fill(customer.accountNo);await other.getByRole('button',{name:'Search',exact:true}).click();
 await other.locator('.pb-approved-artwork').waitFor();
 assert.equal(await other.locator('[data-field="branchName"]').getAttribute('aria-label'),'branchName: SECOND BRANCH');
 assert.equal(await other.locator('[data-field="micr"]').getAttribute('aria-label'),'micr: 900000009');
 assert.equal(await other.locator('[data-field="ifsc"]').getAttribute('aria-label'),'ifsc: EFGH0000002');
 await other.close();console.log('PASS: second workspace Bank Information replaces first workspace values');
}finally{await browser?.close();await server.close();fs.rmSync('test-evidence/menu.html',{force:true});fs.rmSync('test-evidence/menu.tsx',{force:true});}
