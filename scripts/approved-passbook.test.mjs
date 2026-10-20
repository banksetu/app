import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(compile(source).replaceAll('react/jsx-runtime',pathToFileURL(resolve(root,'node_modules/react/jsx-runtime.js')).href)).toString('base64');
const artworkSource=await readFile(resolve(root,'src/approvedPassbookArtwork.ts'),'utf8');
const artworkUrl=moduleUrl(artworkSource);
const artwork=await import(artworkUrl);
const componentSource=await readFile(resolve(root,'src/ApprovedPassbookInfo.tsx'),'utf8');
const component=await import(moduleUrl(componentSource.replace("'./approvedPassbookArtwork'",JSON.stringify(artworkUrl))));
const branch={name:'BRANCH A',postOffice:'POST A',district:'DISTRICT A',pin:'001200',email:'A@EXAMPLE.COM',ifsc:'ABCD0000001',micr:'000123000',branchCode:'0001'};

test('every bank and customer value comes from the selected records with leading zeros intact',()=>{
  const values=component.approvedPassbookValues({enrolId:'000001',accountNo:'000123400',name:'FIRST CUSTOMER',contact:'0000000000',pan:'ABCDE0000F',accountOpeningDate:'2024-08-24',issueDate:'2020-01-01',nominee:'2',jointHolder:'JOINT NAME',coName:'GUARDIAN',fullAddress:'ROAD A\nPOST A\nPIN-001200'},branch,new Date(2026,9,20));
  assert.deepEqual(Object.fromEntries(['branchName','postOffice','district','branchPin','branchEmail','ifsc','micr','branchCode','customerId','accountNo'].map(key=>[key,values[key]])),{
    branchName:'BRANCH A',postOffice:'POST A',district:'DISTRICT A',branchPin:'001200',branchEmail:'A@EXAMPLE.COM',ifsc:'ABCD0000001',micr:'000123000',branchCode:'(0001)',customerId:'000001',accountNo:'000123400'});
  assert.equal(values.address1,'C/O GUARDIAN');assert.equal(values.address2,'ROAD A, POST A');assert.equal(values.address3,'PIN-001200');assert.equal(values.address4,'');
  assert.equal(values.openedOn,'24-08-2024');assert.equal(values.issueDate,'20-10-2026');
  assert.equal(values.bottomDate,values.issueDate);assert.equal(values.nominee,'2');
  const next=component.approvedPassbookValues({name:'SECOND CUSTOMER'},{...branch,name:'BRANCH B',postOffice:'POST B',micr:'900000009'});
  assert.equal(next.branchName,'BRANCH B');assert.equal(next.holder,'SECOND CUSTOMER');assert.equal(next.micr,'900000009');
  assert.equal(next.customerId,'');assert.equal(next.accountNo,'');assert.equal(next.issueDate,component.passbookPrintDate());assert.equal(next.nominee,'1');
  assert(!JSON.stringify(next).includes('FIRST CUSTOMER'));
});

test('long values preserve the exact font scales and existing label/colon origins',()=>{
  const short=component.approvedPassbookValues({name:'A'},branch);
  const long=component.approvedPassbookValues({name:'A LONG CUSTOMER NAME WITH MANY WORDS'},branch);
  const before=JSON.stringify(artwork.APPROVED_LABELS);
  for(const values of [short,long]){
    const html=renderToStaticMarkup(component.ApprovedPassbookArtwork({values}));
    assert.match(html,/width="206mm" height="85mm"/);
    assert.match(html,/data-field="holder"/);
    assert(!html.includes('<image'));assert(!html.includes('<foreignObject'));assert(!html.includes('<text'));
  }
  const slot=artwork.APPROVED_SLOTS.holder;
  assert.equal(slot.scale,.75);
  for(let i=0;i<long.holder.length;i++)assert.equal(component.approvedCharacterScale(slot,i),.75);
  assert.equal(JSON.stringify(artwork.APPROVED_LABELS),before);
  assert.equal(component.approvedCharacterPosition(slot,0),307.70001);
  assert.deepEqual(component.approvedPassbookProblems(long),[]);
  const excessive={...long,holder:'LONG NAME '.repeat(30)};
  assert(component.approvedPassbookProblems(excessive).some(problem=>problem.startsWith('holder:')));
  assert.equal(excessive.holder.length,300);
});

test('plain zero is unchanged; addresses use three fixed rows without loss or compression changes',()=>{
  assert.equal((artwork.APPROVED_GLYPHS['0'].match(/M/g)||[]).length,2,'outer and inner zero outlines only; no central dot');
  const source='C/O GUARDIAN\nVILLAGE WITH A LONG NAME\nPOST OFFICE\nASSAM,INDIA PIN-001200';
  const values=component.approvedPassbookValues({coName:'GUARDIAN',fullAddress:source},branch);
  assert.equal(values.address1,'C/O GUARDIAN');assert.equal(values.address2,'VILLAGE WITH A LONG NAME, POST OFFICE');assert.equal(values.address3,'ASSAM, INDIA PIN-001200');assert.equal(values.address4,'');
  const spaced=component.approvedPassbookValues({fullAddress:'C/O GUARDIAN\nVILLAGE\n\nASSAM,INDIA PIN-001200'},branch);
  assert.equal(spaced.address3,'ASSAM, INDIA PIN-001200');assert.equal(spaced.address4,'');
  const postal=component.approvedPassbookValues({coName:'GUARDIAN',fullAddress:'VILLAGE\nASSAM,INDIA PIN-001200'},branch);
  assert.equal(postal.address3,'ASSAM, INDIA PIN-001200');assert.equal(postal.address4,'');
  const large='LONG ADDRESS '.repeat(100).trim();
  const overflow=component.approvedPassbookValues({fullAddress:large},branch);
  assert.equal(overflow.address2,large);
  assert(component.approvedPassbookProblems(overflow).some(problem=>problem.startsWith('address2:')));
  assert(component.approvedPassbookProblems({...values,holder:'नाम'}).some(problem=>problem.includes('outside the approved font')));
});

test('slash dates, print-day rollover, care-of parsing and nominee edits preserve approved output',()=>{
  const customer={coName:'TEST PARENT',address:'TEST VILLAGE',postOffice:'TEST POST',pinCode:'001200',accountOpeningDate:'19/10/2026',fullAddress:'C/O: OLD PARENT, Vill- TEST VILLAGE, P.O- TEST POST, DISTRICT A, ASSAM, 001200'};
  const values=component.approvedPassbookValues(customer,branch,new Date(2026,9,20));
  assert.equal(values.address1,'C/O TEST PARENT');assert.equal(values.address2,'VILL-TEST VILLAGE, P.O-TEST POST');assert.equal(values.address3,'DISTRICT A, ASSAM, PIN-001200');
  assert.equal(values.openedOn,'19-10-2026');assert.equal(values.nominee,'1');
  const tomorrow=component.approvedPassbookValues({...customer,nominee:'3'},branch,new Date(2026,9,21));
  assert.equal(tomorrow.issueDate,'21-10-2026');assert.equal(tomorrow.bottomDate,'21-10-2026');assert.equal(tomorrow.nominee,'3');
  const slot=component.APPROVED_INFO_SLOTS.nominee;
  assert.equal(slot.scale,.75);assert.equal(slot.advance,artwork.APPROVED_SLOTS.holder.advance);
  const parsed=component.approvedPassbookValues({fullAddress:'C/O TEST PARENT\nVILL-TEST, P.O-POST\nASSAM, PIN-001200'},branch);
  assert.equal(parsed.address1,'C/O TEST PARENT');assert.equal(parsed.address2,'VILL-TEST, P.O-POST');assert.equal(parsed.address3,'ASSAM, PIN-001200');
});

test('renderer is scoped to Assam Passbook Print and existing print/search actions remain',async()=>{
  const source=await readFile(resolve(root,'src/Passbook.tsx'),'utf8');
  assert.match(source,/const isApprovedAssamPrint = formatType === 'passbook' && isAssamBank/);
  assert.match(source,/isApprovedAssamPrint \? <ApprovedPassbookInfo customer=\{p\} bank=\{BRANCH\} \/> : <PassbookInfoFields/);
  assert.match(source,/isAssamQuick \? <AssamQuickPassbook/);
  assert.match(source,/isUnion \? <UnionPassbook/);
  assert.match(source,/action: "searchCustomer"/);
  assert.match(source,/await requireLicensedWrite\(\);/);
  assert.match(source,/const printOutcome=await printCurrentDocument\(duplex\)/);
  assert.match(source,/if \(printOutcome.accepted\) try/);
  assert.match(source,/await apiRequest\(\{ action: "markPassbookPrinted", rowNumber \}\)/);
  assert(!artworkSource.includes('BADARPUR'));
  assert(!artworkSource.includes('7345026003110'));
});
