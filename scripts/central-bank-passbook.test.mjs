import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/CentralBankPassbook.tsx',import.meta.url),'utf8');
const compiled=new URL('../src/.central-bank-test-render.mjs',import.meta.url);
fs.writeFileSync(compiled,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
let CentralBankPassbook;
try { CentralBankPassbook=(await import(compiled.href)).default; } finally { fs.rmSync(compiled); }

const customer={customerId:'CIF-0091',accountNo:'5901891316',name:'SYNTHETIC CUSTOMER',coName:'SYNTHETIC GUARDIAN',fullAddress:'321 TEST VILLAGE, BADARPUR, ASSAM 788806',accountOpeningDate:'2026-10-27',photoPreview:'data:image/png;base64,PHOTO',accountType:'SAVINGS',modeOfOperation:'SELF',operatingInstruction:'SINGLY'};
const bankInfo={passbookBank:'Central Bank of India',branchName:'BADARPUR',branchState:'ASSAM',branchAddress:'MODAK COMPLEX, ST ROAD BADARPUR',branchDistrict:'KARIMGANJ',branchPinCode:'788806',branchPhone:'268644',gstin:'18AAACC2498P3Z0',ckyc:'CKYC-001',micr:'788016789',ifsc:'CBIN0283594'};
const quick=renderToStaticMarkup(React.createElement(CentralBankPassbook,{customer,bankInfo,bankLogo:'data:image/png;base64,LOGO',formatType:'quickPassbook'}));
const print=renderToStaticMarkup(React.createElement(CentralBankPassbook,{customer,bankInfo,bankLogo:'data:image/png;base64,LOGO',formatType:'passbook'}));

test('Central Bank quick passbook recreates the full 19 x 17.3 cm stationery as text and CSS',()=>{
  assert(source.includes('width:190mm;height:173mm'));
  assert(source.includes('height:86mm'));
  assert(source.includes('height:87mm'));
  assert(quick.includes('central-upper'));
  assert(quick.includes('हमारा बैंक बीसीएसबीआई कोड अनुपालित है'));
  assert(quick.includes('Our Loan Products to meet your requirements'));
  assert(quick.includes('data:image/png;base64,LOGO'));
  assert(quick.includes('data:image/png;base64,PHOTO'));
  assert.equal((quick.match(/class="central-warning"/g)||[]).length,2);
  assert.equal((quick.match(/<span>/g)||[]).length>=6,true);
  assert(!source.includes('central-bank-passbook-template'));
  assert(source.includes('font-size:1.95mm'));
  assert(source.includes('font:400 10px/3.25mm'));
  assert(source.includes('letter-spacing:.3px'));
});

test('Central Bank lower data is mapped from the selected tenant bank and customer',()=>{
  for(const value of ['BADARPUR (ASSAM)','ACCOUNT NO: 5901891316','GSTIN: 18AAACC2498P3Z0','CKYC NO: CKYC-001','MODAK COMPLEX, ST ROAD BADARPUR, KARIMGANJ, ASSAM, 788806','TEL: 268644','MICR CODE: 788016789','IFSC CODE: CBIN0283594','27/10/2026','SYNTHETIC CUSTOMER','C/O: SYNTHETIC GUARDIAN','CIF: CIF-0091','Toll Free: 18003030  WhatsApp Banking: 7900123123']){
    assert(quick.includes(value),value);
    assert(print.includes(value),value);
  }
});

test('Central Bank physical passbook print omits stationery, logo, photograph and photograph box',()=>{
  assert(!print.includes('class="central-upper"'));
  assert(!print.includes('class="central-logo"'));
  assert(!print.includes('class="central-photo"'));
  assert(!print.includes('class="central-manager"'));
  assert(!print.includes('data:image/png;base64,LOGO'));
  assert(!print.includes('data:image/png;base64,PHOTO'));
  assert(print.includes('central-lower'));
  assert(print.includes('BRANCH ADDRESS AND TEL NO.:'));
  assert(print.includes('NAME AND ADDRESS OF ACCOUNT HOLDER/S:'));
  assert(source.includes('.central-bank-document[data-mode="passbook"]{background:transparent}'));
});

test('Central Bank is built in for passbooks but uses its own uploaded account-opening sample',async()=>{
  const policy=await import('../src/bankDocumentPolicy.ts');
  assert.equal(policy.bankDocumentMode('Central Bank of India'),'builtin');
  assert.equal(policy.usesAssamAccountOpeningLayout('Central Bank of India'),false);
  const formats=fs.readFileSync(new URL('../src/BankFormats.tsx',import.meta.url),'utf8');
  const entry=fs.readFileSync(new URL('../src/CustomerEntry.tsx',import.meta.url),'utf8');
  const selected=fs.readFileSync(new URL('../src/SelectedBankDocument.tsx',import.meta.url),'utf8');
  assert(formats.includes('Please upload your Account Opening PDF sample.'));
  assert(entry.includes('Please upload your Account Opening PDF sample before using Central Bank customer autofill.'));
  assert(selected.includes('isCentralBank(bank)'));
});
