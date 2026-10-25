import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=fs.readFileSync(new URL('../src/UnionPassbook.tsx',import.meta.url),'utf8');
const compiled=new URL('../src/.union-test-render.mjs',import.meta.url);
fs.writeFileSync(compiled,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText);
let UnionPassbook;
try {UnionPassbook=(await import(compiled.href)).default;}finally{fs.rmSync(compiled);}
const customer={name:'TEST CUSTOMER',accountNo:'1234567890',coName:'TEST PARENT',occupation:'FARMER',fullAddress:'TEST ADDRESS',nominee:'TEST NOMINEE',accountOpeningDate:'2026-10-05',photoPreview:'data:image/png;base64,TEST',uidaiNo:'SHOULD NEVER PRINT'};
const props={customer,bankInfo:{branchName:'TEST BRANCH',address:'TEST BRANCH ADDRESS',ifsc:'TEST0000001',branchPhone:'1234567890'},bankLogo:'data:image/png;base64,LOGO'};
const quick=renderToStaticMarkup(React.createElement(UnionPassbook,{...props,formatType:'quickPassbook'}));
const print=renderToStaticMarkup(React.createElement(UnionPassbook,{...props,formatType:'passbook'}));
test('full page and lower panel use physical dimensions in both modes',()=>{
 for(const html of [quick,print])for(const value of ['203.2mm','215mm','107mm','108mm'])assert(html.includes(value));
});
test('quick includes bilingual safeguards, labels and selected logo; values-only omits them',()=>{
 for(const text of ['Passbook safeguards:','Cheque book safeguards:','Branch Phone No.','Account No.','Date of Opening A/c','Nomination Registered','Accountant']) {assert(quick.includes(text));assert(!print.includes(text));}
 assert(quick.includes('src="data:image/png;base64,LOGO"'));assert(!print.includes('src="data:image/png;base64,LOGO"'));
 assert.equal((quick.match(/<li>/g)||[]).length,10);
});
test('both modes print same customer values, positions and photo without sample personal data',()=>{
 const fields=html=>[...html.matchAll(/<span data-field="([^"]+)"[^>]*>.*?<\/span>/g)].map(x=>x[0]);
 assert.deepEqual(fields(quick),fields(print));
 for(const html of [quick,print]) {
  for(const value of ['TEST CUSTOMER','TEST NOMINEE','TEST ADDRESS','05-10-2026','data:image/png;base64,TEST'])assert(html.includes(value));
  assert(!/SHOULD NEVER PRINT|Aadhaar|638499|RUBEL|Signature|Seal/.test(html));
 }
});
test('Union search requests photos and keeps values layer visible for printing',()=>{
 const passbook=fs.readFileSync(new URL('../src/Passbook.tsx',import.meta.url),'utf8');
 assert.equal((passbook.match(/includePhoto: isAssamQuick \|\| isUnion/g)||[]).length,2);
 assert(passbook.includes('.union-document *'));
 assert(passbook.includes('@page { size: 210mm 215mm; margin: 0; }'));
 assert(passbook.includes('photoPreview: result.photo?.previewDataUrl'));
 assert(!passbook.includes('formatType === "passbook" && isUnionBank'));
});
test('Union final nomination row uses the measured 215/107/79 mm geometry',()=>{
 assert(source.includes('const UNION_DATA_TOP_MM = 17'));
 assert(source.includes('const UNION_DATA_LAST_ANCHOR_MM = 96'));
 assert(source.includes('value("nomination",c.nominee ? "Y" : "",109,100,10)'));
});
test('isolated PR2 proof excludes the upper non-printable panel',()=>{
 const proof=fs.readFileSync(new URL('./pr2-ui.browser.mjs',import.meta.url),'utf8');
 assert(proof.includes('.union-upper,.union-fold,.union-logo,.union-brand,.union-photo{display:none!important}'));
 assert(proof.includes("physicalDataOriginMm:bank==='union'?124:113"));
 assert(proof.includes("physicalDataHeightMm:bank==='union'?79:64.5"));
 assert(proof.includes('physicalInkAllowanceMm:4'));
 assert(proof.includes('physicalOriginInkAllowanceMm:1.5'));
});
