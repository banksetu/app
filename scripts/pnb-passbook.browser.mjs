import fs from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';

process.chdir(resolve(import.meta.dirname,'..'));
fs.mkdirSync('test-evidence',{recursive:true});
const bank={bankName:'Punjab National Bank',passbookBank:'Punjab National Bank',branchName:'PNB CHHITAULI',branchAddress:'SIWAN',branchDistrict:'SIWAN',branchPinCode:'841439',branchPhone:'000000000000',ifsc:'PUNXXXXXX',micr:'841XXXXXX'};
const customer={enrolId:'R392XXXXX',accountNo:'XXXXXXXXXXXXXXXXXX',name:'SONU KUMAR',coName:'Tuntun sah,hdhdfhggfhgfjghjhjh',contact:'9000000000',uidaiNo:'XXXXXXXXXX4761',accountOpeningDate:'2023-11-06',fullAddress:'SIWAN\nBIHAR',pinCode:'XXXXXX',issueDate:'2023-11-06'};
fs.writeFileSync('test-evidence/pnb-menu.html','<div id="root"></div><script type="module" src="/test-evidence/pnb-menu.tsx"></script>');
fs.writeFileSync('test-evidence/pnb-menu.tsx',`import React from'react';import{createRoot}from'react-dom/client';import Passbook from'../src/Passbook';import'../src/index.css';import'../src/App.css';const q=new URLSearchParams(location.search);sessionStorage.setItem('bankSetuTenantId','synthetic-pnb-preview');sessionStorage.setItem('bankSetuAccountRole','client_admin');createRoot(document.getElementById('root')).render(<main className="banksetu-app-shell" data-appearance="light"><Passbook bankInfo={${JSON.stringify(bank)}} formatType={q.get('mode')==='quick'?'quickPassbook':'passbook'}/></main>);`);
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
  const values={'Branch Office':'PNB CHHITAULI, SIWAN,SIWAN,BIHAR-841439','Toll Free Number':'18001802222/18001032222','Tolled Number':'012024790000','Principal Officer Phone':'01123716185','Principal Officer Fax':'01123323707','Mode of Operation':'SELF','Nomination SL. No.':'XXXXXXXXXXX','District':'SIWAN','State':'BIHAR','Country':'INDIA','Date of Issue':'06-11-2023','DICGC Amount':'5.00'};
  for(const [label,value] of Object.entries(values))await fill(page,label,value);
  await page.getByRole('button',{name:'Apply to Preview',exact:true}).click();
  await page.locator('.pnb-document').screenshot({path:`../PNB_${mode==='quick'?'Quick_Passbook':'Passbook_Print'}_Menu_Preview.png`});
  await page.close();
 }
}finally{await browser?.close();await server.close();fs.rmSync('test-evidence/pnb-menu.html',{force:true});fs.rmSync('test-evidence/pnb-menu.tsx',{force:true});}
