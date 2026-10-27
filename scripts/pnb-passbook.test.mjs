import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const source=fs.readFileSync(new URL('../src/PnbPassbook.tsx',import.meta.url),'utf8');
const compiled=new URL('../src/.pnb-test-render.mjs',import.meta.url);
fs.writeFileSync(compiled,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText);
let PnbPassbook;
try { PnbPassbook=(await import(compiled.href)).default; } finally { fs.rmSync(compiled); }

const customer={enrolId:'R39200001',accountNo:'1234567890123456',name:'SONU KUMAR',coName:'TUNTUN SAH',uidaiNo:'XXXXXXXX4761',accountOpeningDate:'2023-11-06',fullAddress:'VILLAGE TEST\nSIWAN',pinCode:'841439',photoPreview:'data:image/png;base64,TEST',pnbModeOfOperation:'SELF'};
const bankInfo={bankName:'Punjab National Bank',passbookBank:'Punjab National Bank',branchName:'PNB CHHITAULI',branchDistrict:'SIWAN',branchPinCode:'841439',branchPhone:'06154222222',micr:'841000000',ifsc:'PUNB0000000'};
const bankLogo='data:image/png;base64,BANK_LOGO';
const quick=renderToStaticMarkup(React.createElement(PnbPassbook,{customer,bankInfo,bankLogo,formatType:'quickPassbook'}));
const print=renderToStaticMarkup(React.createElement(PnbPassbook,{customer,bankInfo,bankLogo,formatType:'passbook'}));

test('PNB uses the measured 21.3 x 19 cm book and 7.5 x 10.2 cm printed box',()=>{
  for(const html of [quick,print])for(const value of ['213mm','190mm'])assert(html.includes(value));
  assert(quick.includes('pnb-passbook-blank-template.webp'));
});
test('Passbook Print contains only dot-matrix values while Quick Passbook contains complete stationery',()=>{
  for(const value of ['class="pnb-stationery"','class="pnb-stationery-template"','class="pnb-uploaded-logo"','class="pnb-customer-photo"']){assert(quick.includes(value));assert(!print.includes(value));}
  for(const value of ['BO: PNB CHHITAULI, SIWAN, 841439','MICR Code: 841000000','IFSC Code: PUNB0000000','Mode of Operation : SELF','Customer No. : R39200001','Account No. : 1234567890123456','SONU KUMAR']){assert(quick.includes(value));assert(print.includes(value));}
  assert(quick.includes('data:image/png;base64,TEST'));assert(!print.includes('data:image/png;base64,TEST'));
  assert(quick.includes(bankLogo));assert(!print.includes(bankLogo));
  assert(quick.includes('pnb-dot-left-fit'));
});
test('PNB permanent contact and DICGC lines keep their original defaults',()=>{
  for(const html of [quick,print]){
    assert(html.includes('*Contact: Tol Free-18001802222/18001032222, Tolled-012024790000'));
    assert(html.includes('*Principal Nodal Officer:  Ph-01123716185 Fax-01123323707'));
    assert(html.includes('Nomination Registered at SL. No. : '));
    assert(html.includes('Bank depositor is insured by DICGC upto a maximum Rs.5.00'));
    assert(html.includes('Subject to change from time. (T&amp;C applicable)'));
  }
});
test('PNB keeps BO and Phone fixed while aligning the remaining data inside the left page',()=>{
  for(const html of [quick,print]){
    assert.match(html,/data-field="branchOffice"[^>]*top:30mm/);
    assert.match(html,/data-field="branchPhone"[^>]*top:34mm/);
    assert.match(html,/data-field="micr"[^>]*top:49mm/);
    assert.match(html,/data-field="modeOfOperation"[^>]*top:75mm/);
    assert.match(html,/data-field="dicgc"[^>]*pnb-dot-left-fit[^>]*top:129mm/);
    assert.match(html,/data-field="terms"[^>]*pnb-dot-left-fit[^>]*top:133mm/);
  }
  assert(source.includes('.pnb-dot-matrix,.pnb-dot-line{text-align:left!important}'));
  assert(source.includes('BankSetuPassbookMono-Bold.ttf'));
  assert(source.includes('font-weight:700'));
});
test('PNB is a built-in bank format',()=>{
  const policy=fs.readFileSync(new URL('../src/bankDocumentPolicy.ts',import.meta.url),'utf8');
  assert(policy.includes('isPnbBank'));
  assert(policy.includes('isPnbBank(key)'));
});
test('PNB temporary fields and alignment renderer are connected to Passbook menu',()=>{
  const passbook=fs.readFileSync(new URL('../src/Passbook.tsx',import.meta.url),'utf8');
  for(const value of ['<PnbPassbook','PNB_EDIT_FIELDS','pnbNominationSerial','pnbPrincipalOfficer','.passbook-page .pnb-document'])assert(passbook.includes(value));
  assert(passbook.includes('(isUnion || isPnb) && formatType === "quickPassbook"'));
  assert(passbook.includes('bankLogo={bankLogo}'));
  assert(passbook.includes('@page { size: A4 portrait; margin: 0; }'));
  assert(passbook.includes('.pnb-document *'));
});
