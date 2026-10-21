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
fs.writeFileSync('test-evidence/menu.html','<title>Bank Setu — temporary test customer review</title><div id="root"></div><script type="module" src="/test-evidence/menu.tsx"></script>');
fs.writeFileSync('test-evidence/menu.tsx',`import '../src/index.css';import '../src/App.css';import React from 'react';import{createRoot}from'react-dom/client';import Passbook from'../src/Passbook';const q=new URLSearchParams(location.search);const bank=${JSON.stringify(bank)};if(q.get('bank')==='union')Object.assign(bank,{bankName:'Union Bank of India',passbookBank:'Union Bank of India',branchName:'UNION TEST BRANCH',address:'UNION TEST ADDRESS'});if(q.get('tenant')==='second')Object.assign(bank,{branchName:'SECOND BRANCH',micr:'900000009',ifsc:'EFGH0000002'});sessionStorage.setItem('bankSetuTenantId','synthetic-test-only');window.testCalls=[];createRoot(document.getElementById('root')).render(<div className="banksetu-app-shell" data-appearance="dark"><Passbook bankInfo={bank} formatType={q.get('mode')==='quick'?'quickPassbook':'passbook'}/></div>);`);
const mocks={
 './core/localData':`export function identity(){return 'synthetic:user:tenant:connection';}export async function getDataIdToken(){return 'synthetic';}export async function localDataFetch(url,options){const body=JSON.parse(options.body);window.testCalls.push(body);return{json:async()=>body.action==='searchCustomer'?{success:true,customer:${JSON.stringify(customer)},rowNumber:1}:{success:true}};}`,
 './core/licenseAccess':`export async function requireLicensedWrite(){if(window.blockTestLicense)throw Error('License suspended');}`,
 'firebase/auth':`export function getAuth(){return{currentUser:{uid:'synthetic'}};}`,
 './tenantApi':`export function getTenantApiUrl(){return '/synthetic-bridge';}`,
 './platform/print':`export async function printCurrentDocument(){window.printCount=(window.printCount||0)+1;return{accepted:true,confirmation:'printer'};}`,
};
const server=await createServer({configFile:false,root:process.cwd(),plugins:[{name:'synthetic-passbook-only',enforce:'pre',resolveId(source,importer){if((importer?.endsWith('/src/Passbook.tsx')||importer?.endsWith('/src/Pr2PrinterDialog.tsx'))&&mocks[source])return '\0test:'+source;if(importer?.endsWith('/src/PrintAlignmentPreview.tsx')&&source==='./firebase')return '\0test:firebase';},load(id){if(id==='\0test:firebase')return 'export const auth={currentUser:null};';if(id.startsWith('\0test:'))return mocks[id.slice(6)];}},react()],server:{host:'127.0.0.1',port:5197,strictPort:true}});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1300,height:1100},deviceScaleFactor:2});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
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

 await page.locator('.pb-word-artwork').waitFor();
 await page.screenshot({path:'test-evidence/word-passbook-app.png',fullPage:true});
 await page.locator('.pb-word-artwork').screenshot({path:'test-evidence/word-passbook-closeup.png',scale:'device'});
 assert.equal(await page.locator('[data-label="JOINT HOLDER"]').count(),0);
 const shapes=await page.locator('.pb-word-artwork path').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('transform').split('scale(')[1]))]);
 assert.equal(shapes.length,1,'every glyph has identical font size and compression');
 const origins=await page.locator('[data-field] path:first-of-type').evaluateAll(nodes=>nodes.map(n=>({field:n.parentElement.dataset.field,transform:n.getAttribute('transform')})));
 fs.writeFileSync('test-evidence/word-origins.json',JSON.stringify(origins,null,2));
 assert.deepEqual(errors,[]);
 console.log('PASS: actual Passbook component searched synthetic customer through existing API interface; complete layout and closeup captured; uniform transforms and bank values verified.');
}finally{await browser?.close();await server.close();fs.rmSync('test-evidence/menu.html',{force:true});fs.rmSync('test-evidence/menu.tsx',{force:true});}
