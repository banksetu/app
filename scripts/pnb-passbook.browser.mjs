import fs from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';

process.chdir(resolve(import.meta.dirname,'..'));
fs.mkdirSync('test-evidence',{recursive:true});
const bank={bankName:'Punjab National Bank',passbookBank:'Punjab National Bank',branchName:'TEST',branchAddress:'TEST',branchDistrict:'TEST',branchPinCode:'TEST',branchPhone:'TEST',ifsc:'TEST',micr:'TEST'};
const customer={enrolId:'TEST',accountNo:'TEST',name:'TEST',coName:'TEST',contact:'TEST',uidaiNo:'TEST',accountOpeningDate:'TEST',fullAddress:'TEST\nTEST\nTEST',pinCode:'TEST',issueDate:'TEST'};
const bankLogo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><rect width="100%" height="100%" fill="white"/><text x="20" y="75" font-family="Arial" font-size="60" font-weight="700">PNB</text><text x="20" y="130" font-family="Arial" font-size="38">TEST BANK LOGO</text></svg>');
fs.writeFileSync('test-evidence/pnb-menu.html','<div id="root"></div><script type="module" src="/test-evidence/pnb-menu.tsx"></script>');
fs.writeFileSync('test-evidence/pnb-menu.tsx',`import React from'react';import{createRoot}from'react-dom/client';import Passbook from'../src/Passbook';import'../src/index.css';import'../src/App.css';const q=new URLSearchParams(location.search);sessionStorage.setItem('bankSetuTenantId','synthetic-pnb-preview');sessionStorage.setItem('bankSetuAccountRole','client_admin');createRoot(document.getElementById('root')).render(<main className="banksetu-app-shell" data-appearance="light"><Passbook bankInfo={${JSON.stringify(bank)}} bankLogo={${JSON.stringify(bankLogo)}} formatType={q.get('mode')==='quick'?'quickPassbook':'passbook'}/></main>);`);
const mocks={
 './core/localData':`export function identity(){return 'synthetic:user:tenant:connection';}export async function getDataIdToken(){return 'synthetic';}export async function localDataFetch(url,options){const body=JSON.parse(options.body);return{json:async()=>body.action==='searchCustomer'?{success:true,customer:${JSON.stringify(customer)},rowNumber:1}:{success:true}};}`,
 './core/licenseAccess':`export async function requireLicensedWrite(){}`,
 'firebase/auth':`export function getAuth(){return{currentUser:{uid:'synthetic'}};}`,
 './tenantApi':`export function getTenantApiUrl(){return '/synthetic-bridge';}`,
 './platform/print':`export async function printCurrentDocument(){return{accepted:true,confirmation:'printer'};}`,
};
const server=await createServer({configFile:false,root:process.cwd(),plugins:[{name:'pnb-preview-mocks',enforce:'pre',resolveId(source,importer){if(importer?.endsWith('/src/Passbook.tsx')&&mocks[source])return '\0test:'+source;if(importer?.endsWith('/src/PrintAlignmentPreview.tsx')&&source==='./firebase')return '\0test:firebase';},load(id){if(id==='\0test:firebase')return 'export const auth={currentUser:null};';if(id.startsWith('\0test:'))return mocks[id.slice(6)];}},react()],server:{host:'127.0.0.1',port:5199,strictPort:true}});
let browser;
const fill=async(page,label,value)=>{const field=page.locator('.edit-field').filter({has:page.locator('label',{hasText:new RegExp('^'+label+'$')})});await field.locator('input').fill(value);};
try{
 await server.listen();browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader']});
 for(const mode of ['passbook','quick']){
  const page=await browser.newPage({viewport:{width:1600,height:1250},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:5199/test-evidence/pnb-menu.html?mode=${mode}`);
  await page.locator('.passbook-search-input').fill(customer.accountNo);await page.getByRole('button',{name:'Search',exact:true}).click();await page.locator('.pnb-document').waitFor();
  await page.getByRole('button',{name:'Temporary Edit',exact:true}).click();
  const values={'Branch Office':'TEST','Branch Phone':'TEST','MICR Code':'TEST','IFSC Code':'TEST','Toll Free Number':'TEST','Tolled Number':'TEST','Principal Nodal Officer':'TEST','Principal Officer Phone':'TEST','Principal Officer Fax':'TEST','Mode of Operation':'TEST','Nomination SL. No.':'TEST','District':'TEST','State':'TEST','Country':'TEST','Date of Issue':'TEST','DICGC Amount':'TEST'};
  for(const [label,value] of Object.entries(values))await fill(page,label,value);
  await page.getByRole('button',{name:'Apply to Preview',exact:true}).click();
  await page.locator('.pnb-document').screenshot({path:`../PNB_${mode==='quick'?'Quick_Passbook':'Passbook_Print'}_Menu_Preview.png`});
  await page.close();
 }
}finally{await browser?.close();await server.close();fs.rmSync('test-evidence/pnb-menu.html',{force:true});fs.rmSync('test-evidence/pnb-menu.tsx',{force:true});}
