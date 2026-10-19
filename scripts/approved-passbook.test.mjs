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
  const values=component.approvedPassbookValues({enrolId:'000001',accountNo:'000123400',name:'FIRST CUSTOMER',contact:'0000000000',pan:'ABCDE0000F',accountOpeningDate:'2024-08-24',issueDate:'2026-10-20',nominee:'2',jointHolder:'JOINT NAME',coName:'GUARDIAN',fullAddress:'ROAD A\nPOST A\nPIN-001200'},branch);
  assert.deepEqual(Object.fromEntries(['branchName','postOffice','district','branchPin','branchEmail','ifsc','micr','branchCode','customerId','accountNo'].map(key=>[key,values[key]])),{
    branchName:'BRANCH A',postOffice:'POST A',district:'DISTRICT A',branchPin:'001200',branchEmail:'A@EXAMPLE.COM',ifsc:'ABCD0000001',micr:'000123000',branchCode:'(0001)',customerId:'000001',accountNo:'000123400'});
  assert.equal(values.address1,'C/O GUARDIAN');assert.equal(values.address4,'PIN-001200');
  assert.equal(values.openedOn,'24/08/2024');assert.equal(values.issueDate,'20-10-2026');
  assert.equal(values.bottomDate,values.issueDate);assert.equal(values.nominee,'2');
  const next=component.approvedPassbookValues({name:'SECOND CUSTOMER'},{...branch,name:'BRANCH B',postOffice:'POST B',micr:'900000009'});
  assert.equal(next.branchName,'BRANCH B');assert.equal(next.holder,'SECOND CUSTOMER');assert.equal(next.micr,'900000009');
  assert.equal(next.customerId,'');assert.equal(next.accountNo,'');assert.equal(next.issueDate,'');
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

test('plain zero keeps its two outlines and addresses are never truncated or duplicated',()=>{
  assert.equal((artwork.APPROVED_GLYPHS['0'].match(/M/g)||[]).length,2,'outer and inner zero outlines only; no central dot');
  const source='C/O GUARDIAN\nVILLAGE WITH A LONG NAME\nPOST OFFICE\nASSAM,INDIA PIN-001200';
  const values=component.approvedPassbookValues({coName:'GUARDIAN',fullAddress:source},branch);
  assert.equal([values.address1,values.address2,values.address3,values.address4].join('\n'),source);
  const spaced=component.approvedPassbookValues({fullAddress:'C/O GUARDIAN\nVILLAGE\n\nASSAM,INDIA PIN-001200'},branch);
  assert.equal(spaced.address3,'');assert.equal(spaced.address4,'ASSAM,INDIA PIN-001200');
  const postal=component.approvedPassbookValues({coName:'GUARDIAN',fullAddress:'VILLAGE\nASSAM,INDIA PIN-001200'},branch);
  assert.equal(postal.address3,'');assert.equal(postal.address4,'ASSAM,INDIA PIN-001200');
  const large='LONG ADDRESS '.repeat(100).trim();
  const overflow=component.approvedPassbookValues({fullAddress:large},branch);
  assert.equal([overflow.address1,overflow.address2,overflow.address3,overflow.address4].join(' '),large);
  assert(component.approvedPassbookProblems(overflow).some(problem=>problem.startsWith('address4:')));
  assert(component.approvedPassbookProblems({...values,holder:'नाम'}).some(problem=>problem.includes('outside the approved font')));
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
