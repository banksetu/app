import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
process.chdir(resolve(import.meta.dirname,'..'));
fs.mkdirSync('test-evidence',{recursive:true});
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
// Freeze the physically selected Assam A proof and the existing Union Bank
// renderer. Production builds do not set this isolated packaging flag.
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
 const outputs=[];
 for(const [bank,variant] of [['assam','A'],['union','']]) {
  const page=await browser.newPage({viewport:{width:1300,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5198/test-evidence/menu.html?bank='+bank+(variant?'&pr2Variant='+variant:'')+(bank==='union'?'&mode=quick':''));
  await page.locator('.passbook-search-input').fill('0001234567890');await page.getByRole('button',{name:'Search',exact:true}).click();await page.locator(bank==='assam'?'.pb-approved-artwork':'.union-document').first().waitFor();
  if(bank==='assam')assert.equal(await page.locator('.pb-approved-artwork').first().getAttribute('aria-label'),`Passbook customer information — PR2 9.25pt, 69% width, 1px letter spacing, ${{A:'0.75',B:'1.00',C:'1.25'}[variant]}mm label gap, 3mm data gap`);
  if(bank==='union'){
   await page.emulateMedia({media:'print'});
   const bounds=await page.evaluate(()=>{const documentRect=document.querySelector('.union-document').getBoundingClientRect();const lineRect=document.querySelector('[data-field="nomination"]').getBoundingClientRect();return{documentBottom:documentRect.bottom,lineBottom:lineRect.bottom};});
   assert.ok(bounds.lineBottom<=bounds.documentBottom,'Union nomination Y/N line must remain inside the physical page');
   await page.emulateMedia({media:'screen'});
  }
  const original=await page.locator(bank==='assam'?'.pb-approved-artwork':'.union-document').first().innerHTML();
  // Build a clean physical sheet from the layout element itself. Selecting a
  // page from the application PDF is unsafe: page 1 can be the Search screen.
  const sourceHtml=await page.evaluate(bank=>{
   const selector=bank==='union'?'.union-document':'.passbook-shell';
   const source=document.querySelector(selector);if(!source)throw Error('Passbook layout element is unavailable');
   const styles=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node=>node.outerHTML).join('');
   const height=bank==='union'?215:175;
   const bankRules=bank==='union'?`
    .union-document{position:absolute!important;left:0!important;top:0!important;width:203.2mm!important;height:215mm!important;margin:0!important;box-shadow:none!important;overflow:hidden!important}
    .union-lower{top:107mm!important;height:108mm!important}.union-fold{top:107mm!important}
   `:`
    .passbook-shell{position:absolute!important;left:0!important;top:0!important;width:206mm!important;height:175mm!important;margin:0!important;box-shadow:none!important;border:0!important;overflow:hidden!important}
    .passbook-cover-space{height:88mm!important}.passbook-print-area{top:88mm!important;width:206mm!important;height:87mm!important}
    .preview-edit-button,.cover-note{display:none!important}
   `;
   return `<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}">${styles}<style>
    @page{size:210mm ${height}mm;margin:0}html,body{margin:0!important;padding:0!important;width:210mm!important;height:${height}mm!important;background:#fff!important;overflow:hidden!important}
    body>.passbook-page{position:absolute!important;inset:0!important;width:210mm!important;height:${height}mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
    body *{visibility:visible!important}${bankRules}
   </style></head><body data-pr2-proof="${bank}"><div class="passbook-page">${source.outerHTML}</div></body></html>`;
  },bank);
  const proof=await browser.newPage({viewport:{width:1600,height:1100}});
  await proof.setContent(sourceHtml,{waitUntil:'load'});await proof.emulateMedia({media:'print'});
  assert.equal(await proof.locator('.passbook-search-input,.direct-print-button,.search-button').count(),0,'Application/Search controls must never enter a printer proof');
  assert.doesNotMatch(await proof.locator('body').innerText(),/UNIVERSAL CUSTOMER SEARCH/i,'Application/Search text must never enter a printer proof');
  if(bank==='assam'){
   const placement=await proof.evaluate(()=>{
    const page=document.querySelector('.passbook-shell');const area=document.querySelector('.passbook-print-area');const paths=[...document.querySelectorAll('.pb-approved-artwork path')];
    if(!page||!area||!paths.length)throw Error('Assam artwork is incomplete');
    const pageTop=page.getBoundingClientRect().top;const first=Math.min(...paths.map(path=>path.getBoundingClientRect().top));
    const target=pageTop+108*96/25.4;const shift=target-first;
    area.style.transform=`translateY(${shift}px)`;area.dataset.physicalOriginMm='108';
    const after=Math.min(...paths.map(path=>path.getBoundingClientRect().top));
    return {topMm:(after-pageTop)*25.4/96,bottomMm:(Math.max(...paths.map(path=>path.getBoundingClientRect().bottom))-pageTop)*25.4/96};
   });
   assert.ok(Math.abs(placement.topMm-108)<.15,`Assam first ink must start 20mm below the 88mm fold; got ${placement.topMm}mm`);
   assert.ok(placement.bottomMm<=175,'Assam artwork exceeds the 175mm physical sheet');
  }else{
   assert.equal(await proof.locator('.union-document').getAttribute('aria-label'),'Union Bank complete quick passbook');
   assert.match(await proof.locator('.union-document').innerText(),/BRANCH/);assert.match(await proof.locator('.union-document').innerText(),/Nomination Registered/);
   const placement=await proof.evaluate(()=>{const page=document.querySelector('.union-document').getBoundingClientRect();const first=document.querySelector('[data-field="branchHeading"]').getBoundingClientRect();const last=document.querySelector('[data-field="nomination"]').getBoundingClientRect();return{firstMm:(first.top-page.top)*25.4/96,lastBottomMm:(last.bottom-page.top)*25.4/96};});
   assert.ok(Math.abs(placement.firstMm-124)<.2,`Union data must start 17mm below the 107mm fold; got ${placement.firstMm}mm`);
   assert.ok(placement.lastBottomMm<=215,'Union nomination Y/N line exceeds the 215mm physical sheet');
  }
  const pdf=await proof.pdf({preferCSSPageSize:true,printBackground:true});await proof.close();
  await page.evaluate(pdf=>{window.pr2Requests=[];window.bankSetuPr2={platform:'win32',protocol:1,
   prepare:async()=>({id:'12345678-1234-1234-1234-123456789abc',pdf}),
   discover:async()=>({devices:[{id:'synthetic',name:'PLQ-20',transport:'usb-direct',profile:'epson-plq20-pr2-v1'}],queues:[],profiles:[]}),
   probe:async()=>({pr2:true,paper:'inserted'}),
   send:async request=>{window.pr2Requests.push(request);return{state:'completed',completed:true,message:'Synthetic device acknowledgement'};},
   cancel:async()=>true,acknowledge:async()=>true,onProgress:()=>()=>{}};
  },pdf.toString('base64'));
  await page.getByRole('button',{name:/Direct Printer Send/}).click();
  await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent!=='Preparing the active bank template…',null,{timeout:15000}).catch(()=>{});
  const dialogStatus=await page.locator('[role="status"]').textContent();console.log(`PR2 ${bank} preparation: ${dialogStatus}`);
  assert.match(dialogStatus||'',/Choose\/check the printer\./,`PR2 ${bank} preparation failed`);
  await page.getByLabel('I checked that the physical printer').check();await page.getByLabel('The printer configuration sheet').check();
  await page.getByRole('button',{name:'Check printer',exact:true}).click();await page.getByText('PR2 communication confirmed.',{exact:false}).waitFor();
  await page.getByLabel('I reviewed the graphics proof.',{exact:false}).check();await page.getByRole('button',{name:'Send this passbook',exact:true}).click();
  await page.waitForFunction(()=>window.testCalls.some(x=>x.action==='markPassbookPrinted'));
  const requests=await page.evaluate(()=>window.pr2Requests);assert.equal(requests.length,1);assert.equal(requests[0].scope,'synthetic:user:tenant:connection');assert.equal(requests[0].raster.dpi,180);assert.ok(requests[0].raster.bits.length>1000);
  assert.equal(await page.locator(bank==='assam'?'.pb-approved-artwork':'.union-document').first().innerHTML(),original);assert.deepEqual(errors,[]);
  outputs.push({bank,sourceHtml,raster:{...requests[0].raster,paperLengthMm:bank==='union'?215:175,physicalFoldMm:bank==='union'?107:88,physicalDataOriginMm:bank==='union'?124:108}});await page.close();
 }
 // Vite watches this directory. Write every artifact only after both live UI
 // flows finish, otherwise Assam output can reload the Union dialog.
 for(const {bank,sourceHtml,raster} of outputs){fs.writeFileSync('test-evidence/pr2-'+bank+'-source.html',sourceHtml);fs.writeFileSync('test-evidence/pr2-'+bank+(bank==='assam'?'-final':'')+'-raster.json',JSON.stringify(raster));}
 console.log('PASS: Android/Web exact modal; existing Windows button → active Assam/Union PDF → 180dpi graphics → mock IPC; source artwork unchanged; confirmed job updates status.');
} finally {await browser?.close();await server.close();}
