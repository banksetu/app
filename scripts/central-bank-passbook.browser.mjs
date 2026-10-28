import fs from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';

process.chdir(resolve(import.meta.dirname,'..'));
fs.mkdirSync('test-evidence',{recursive:true});
if(process.env.DEVANAGARI_FONT_PATH)fs.copyFileSync(process.env.DEVANAGARI_FONT_PATH,'test-evidence/devanagari.ttf');
const bankInfo={passbookBank:'Central Bank of India',branchName:'BADARPUR',branchState:'ASSAM',branchAddress:'MODAK COMPLEX, ST ROAD BADARPUR',branchDistrict:'KARIMGANJ',branchPinCode:'788806',branchPhone:'268644',gstin:'18AAACC2498P3Z0',ckyc:'CKYC-001',micr:'788016789',ifsc:'CBIN0283594'};
const customer={customerId:'8644379361',accountNo:'5901891316',name:'SYNTHETIC CUSTOMER',coName:'SYNTHETIC GUARDIAN',fullAddress:'321 TEST VILLAGE, BADARPUR, KARIMGANJ, ASSAM 788806',accountOpeningDate:'2025-11-18',accountType:'SAVINGS',modeOfOperation:'SELF',operatingInstruction:'SINGLY',photoPreview:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380"><rect width="300" height="380" fill="#dbe4e8"/><circle cx="150" cy="125" r="62" fill="#986b52"/><path d="M55 360c9-102 52-152 95-152s86 50 95 152" fill="#445e6c"/><text x="150" y="374" font-size="18" text-anchor="middle">SYNTHETIC PHOTO</text></svg>')};
const bankLogo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 180"><rect width="100%" height="100%" fill="white"/><path d="M70 24l58 58-58 58L12 82z" fill="none" stroke="#243f4a" stroke-width="13"/><circle cx="70" cy="82" r="24" fill="#243f4a"/><text x="155" y="72" font-family="Arial" font-size="34" font-weight="700">CENTRAL BANK OF INDIA</text><text x="155" y="116" font-family="Arial" font-size="28" font-weight="700">UPLOADED BANK LOGO</text></svg>');
fs.writeFileSync('test-evidence/central-bank.html','<div id="root"></div><script type="module" src="/test-evidence/central-bank.tsx"></script>');
fs.writeFileSync('test-evidence/central-bank.tsx',`import React from'react';import{createRoot}from'react-dom/client';import CentralBankPassbook from'../src/CentralBankPassbook';import FloatingSupportButton from'../src/FloatingSupportButton';import'../src/App.css';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<><style>{'@font-face{font-family:"Noto Sans Devanagari";src:url("/test-evidence/devanagari.ttf") format("truetype");font-weight:100 900}'}</style>{p.get('support')?<FloatingSupportButton unread={0} open={()=>{}}/>:<CentralBankPassbook customer={${JSON.stringify(customer)}} bankInfo={${JSON.stringify(bankInfo)}} bankLogo={${JSON.stringify(bankLogo)}} formatType={p.get('mode')==='print'?'passbook':'quickPassbook'}/>}</>);`);
const server=await createServer({configFile:false,root:process.cwd(),plugins:[react()],server:{host:'127.0.0.1',port:5204,strictPort:true}});
let browser;
try{
 await server.listen();browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const passbook=await browser.newPage({viewport:{width:1100,height:900},deviceScaleFactor:2});
 await passbook.goto('http://127.0.0.1:5204/test-evidence/central-bank.html');await passbook.locator('.central-bank-document').waitFor();
 await passbook.locator('.central-bank-document').screenshot({path:'../Central_Bank_Quick_Passbook_Draft_20261028.png'});await passbook.close();
 const print=await browser.newPage({viewport:{width:1100,height:900},deviceScaleFactor:2});
 await print.goto('http://127.0.0.1:5204/test-evidence/central-bank.html?mode=print');await print.locator('.central-bank-document').waitFor();
 if(await print.locator('.central-upper,.central-logo,.central-photo,.central-manager').count())throw new Error('Passbook Print contains Quick Passbook stationery');
 await print.locator('.central-bank-document').screenshot({path:'../Central_Bank_Passbook_Print_Data_Only_Draft_20261028.png'});await print.close();
 const mobile=await browser.newPage({viewport:{width:390,height:800},deviceScaleFactor:2});await mobile.goto('http://127.0.0.1:5204/test-evidence/central-bank.html?support=1');await mobile.waitForTimeout(150);
 await mobile.screenshot({path:'../Floating_Support_Mobile_Bottom_2px_Draft.png'});await mobile.close();
}finally{await browser?.close();await server.close();for(const file of ['test-evidence/central-bank.html','test-evidence/central-bank.tsx','test-evidence/devanagari.ttf'])fs.rmSync(file,{force:true});}
