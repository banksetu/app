import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
process.chdir(resolve(import.meta.dirname,'..'));
fs.mkdirSync('test-evidence',{recursive:true});
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
// Generate three bounded PR2-only physical calibration proofs. Production
// builds do not set this flag and retain the approved application typography.
process.env.VITE_PR2_LOCAL_MASTER_TYPOGRAPHY='true';
const bank={bankName:'Assam Gramin Bank',passbookBank:'Assam Gramin Bank',branchName:'TEST BRANCH',branchAddress:'TEST ROAD',branchPostOffice:'TEST POST',branchDistrict:'TEST DISTRICT',branchPinCode:'001200',branchEmail:'TEST@EXAMPLE.COM',ifsc:'ABCD0000001',micr:'000123000',branchCode:'0001'};
const customer={enrolId:'000001',accountNo:'0001234567890',name:'TEST CUSTOMER',coName:'TEST GUARDIAN',contact:'9000000000',accountOpeningDate:'2024-08-24',issueDate:'2026-10-20',nominee:'2',fullAddress:'VILLAGE TEST\nPOST TEST\nASSAM,INDIA PIN-001200'};
fs.writeFileSync('test-evidence/menu.html','<div id="root"></div><script type="module" src="/test-evidence/menu.tsx"></script>');
fs.writeFileSync('test-evidence/menu.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import Passbook from'../src/Passbook';const q=new URLSearchParams(location.search);const bank=${JSON.stringify(bank)};if(q.get('bank')==='union')Object.assign(bank,{bankName:'Union Bank of India',passbookBank:'Union Bank of India',branchName:'UNION TEST BRANCH',address:'UNION TEST ADDRESS'});if(q.get('tenant')==='second')Object.assign(bank,{branchName:'SECOND BRANCH',micr:'900000009',ifsc:'EFGH0000002'});sessionStorage.setItem('bankSetuTenantId','synthetic-test-only');window.testCalls=[];createRoot(document.getElementById('root')).render(<Passbook bankInfo={bank} formatType={q.get('mode')==='quick'?'quickPassbook':'passbook'}/>);`);
const mocks={
 './core/localData':`export function identity(){return 'synthetic:user:tenant:connection';}export async function getDataIdToken(){return 'synthetic';}export async function localDataFetch(url,options){const body=JSON.parse(options.body);window.testCalls.push(body);return{json:async()=>body.action==='searchCustomer'?{success:true,customer:${JSON.stringify(customer)},rowNumber:1}:{success:true}};}`,
 './core/licenseAccess':`export async function requireLicensedWrite(){if(window.blockTestLicense)throw Error('License suspended');}`,
 'firebase/auth':`export function getAuth(){return{currentUser:{uid:'synthetic'}};}`,
 './tenantApi':`export function getTenantApiUrl(){return '/synthetic-bridge';}`,
 './platform/print':`export async function printCurrentDocument(){window.printCount=(window.printCount||0)+1;return{accepted:true,confirmation:'printer'};}`,
};
const server=await createServer({configFile:false,root:process.cwd(),plugins:[{name:'synthetic-passbook-only',enforce:'pre',resolveId(source,importer){if((importer?.endsWith('/src/Passbook.tsx')||importer?.endsWith('/src/Pr2PrinterDialog.tsx'))&&mocks[source])return '\0test:'+source;if(importer?.endsWith('/src/PrintAlignmentPreview.tsx')&&source==='./firebase')return '\0test:firebase';},load(id){if(id==='\0test:firebase')return 'export const auth={currentUser:null};';if(id.startsWith('\0test:'))return mocks[id.slice(6)];}},react()],server:{host:'127.0.0.1',port:5198,strictPort:true}});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const platform of ['web','android']) {
  const page=await browser.newPage({viewport:platform==='android'?{width:390,height:844}:{width:1300,height:1000}});
  await page.goto('http://127.0.0.1:5198/test-evidence/menu.html');
  await page.locator('.passbook-search-input').fill('0001234567890');await page.getByRole('button',{name:'Search',exact:true}).click();await page.locator('.pb-approved-artwork').waitFor();
  if(platform==='android')await page.evaluate(()=>window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'});
  await page.getByRole('button',{name:/Direct Printer Send/}).click();
  await page.getByRole('alertdialog').getByText('Please use this button on only Windows EXE mode.',{exact:true}).waitFor();await page.getByRole('button',{name:'OK',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.testCalls.map(x=>x.action)),['searchCustomer']);await page.close();
 }
 for(const [bank,variant] of [['assam','A'],['assam','B'],['assam','C'],['union','']]) {
  const page=await browser.newPage({viewport:{width:1300,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5198/test-evidence/menu.html?bank='+bank+(variant?'&pr2Variant='+variant:''));
  await page.locator('.passbook-search-input').fill('0001234567890');await page.getByRole('button',{name:'Search',exact:true}).click();await page.locator(bank==='assam'?'.pb-approved-artwork':'.union-document').first().waitFor();
  if(bank==='assam')assert.equal(await page.locator('.pb-approved-artwork').first().getAttribute('aria-label'),`Passbook customer information — PR2 ${{A:8.25,B:8.75,C:9.25}[variant]}pt, 70% width, 1px letter spacing`);
  const original=await page.locator(bank==='assam'?'.pb-approved-artwork':'.union-document').first().innerHTML();
  fs.writeFileSync('test-evidence/pr2-'+bank+'-source.html',await page.content());
  const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
  await page.evaluate(pdf=>{window.pr2Requests=[];window.bankSetuPr2={platform:'win32',protocol:1,
   prepare:async()=>({id:'12345678-1234-1234-1234-123456789abc',pdf}),
   discover:async()=>({devices:[{id:'synthetic',name:'PLQ-20',transport:'usb-direct',profile:'epson-plq20-pr2-v1'}],queues:[],profiles:[]}),
   probe:async()=>({pr2:true,paper:'inserted'}),
   send:async request=>{window.pr2Requests.push(request);return{state:'completed',completed:true,message:'Synthetic device acknowledgement'};},
   cancel:async()=>true,acknowledge:async()=>true,onProgress:()=>()=>{}};
  },pdf.toString('base64'));
  await page.getByRole('button',{name:/Direct Printer Send/}).click();
  await page.getByText('Choose/check the printer.',{exact:false}).waitFor({timeout:30000});
  await page.getByLabel('I checked that the physical printer').check();await page.getByLabel('The printer configuration sheet').check();
  await page.getByRole('button',{name:'Check printer',exact:true}).click();await page.getByText('PR2 communication confirmed.',{exact:false}).waitFor();
  await page.getByLabel('I reviewed the graphics proof.',{exact:false}).check();await page.getByRole('button',{name:'Send this passbook',exact:true}).click();
  await page.waitForFunction(()=>window.testCalls.some(x=>x.action==='markPassbookPrinted'));
  const requests=await page.evaluate(()=>window.pr2Requests);assert.equal(requests.length,1);assert.equal(requests[0].scope,'synthetic:user:tenant:connection');assert.equal(requests[0].raster.dpi,180);assert.ok(requests[0].raster.bits.length>1000);
  if(bank==='assam')fs.writeFileSync('test-evidence/pr2-assam-raster-'+variant.toLowerCase()+'.json',JSON.stringify(requests[0].raster));
  assert.equal(await page.locator(bank==='assam'?'.pb-approved-artwork':'.union-document').first().innerHTML(),original);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: Android/Web exact modal; existing Windows button → active Assam/Union PDF → 180dpi graphics → mock IPC; source artwork unchanged; confirmed job updates status.');
} finally {await browser?.close();await server.close();}
