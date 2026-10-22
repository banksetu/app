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


const glyphUrl=moduleUrl(await readFile(resolve(root,'src/wordPassbookGlyphs.ts'),'utf8'));
const componentUrl=moduleUrl(componentSource.replace("'./approvedPassbookArtwork'",JSON.stringify(artworkUrl)));
const word=await import(moduleUrl((await readFile(resolve(root,'src/WordPassbookInfo.tsx'),'utf8')).replace("'./approvedPassbookArtwork'",JSON.stringify(artworkUrl)).replace("'./ApprovedPassbookInfo'",JSON.stringify(componentUrl)).replace("'./wordPassbookGlyphs'",JSON.stringify(glyphUrl))));
const font=await import(glyphUrl);
test('Word uses Courier New 10pt / 70%, one advance and clean zero',()=>{
 assert.equal(font.WORD_FONT_SIZE_PT,10);assert.equal(font.WORD_HORIZONTAL_SCALE,.7);
 assert.equal((font.WORD_GLYPHS['0'].match(/M/g)||[]).length,2);
 const values=component.approvedPassbookValues({name:'TEST CUSTOMER',accountNo:'000100020003',nominee:'1'},branch);
 const html=renderToStaticMarkup(word.WordPassbookArtwork({values}));
 const scales=[...html.matchAll(/scale\(([^)]+)\)/g)].map(m=>m[1]);assert.equal(new Set(scales).size,1);
 assert.match(html,/width="206mm" height="85mm"/);
 assert(html.includes(`translate(${word.wordValueX('holder',values.holder)} 360.20078)`));
 assert(html.includes('data-label="JOINT HOLDER"'));
 assert.match(html,/aria-label="jointHolder: "/);
 assert.deepEqual(word.wordPassbookProblems(values),[]);
 const long={...values,holder:'LONG NAME '.repeat(50)};
 assert(word.wordPassbookProblems(long).some(p=>p.startsWith('holder:')));assert.equal(long.holder.length,500);
});
test('colons form straight groups with natural-width 70% holder labels',()=>{
 const labels=word.WORD_LABELS;
 const left=labels.filter(l=>l.text===':'&&l.x<70);
 assert.equal(new Set(left.map(l=>l.x)).size,1);
 const holder=labels.find(l=>l.text==='ACC. HOLDER');
 const joint=labels.find(l=>l.text==='JOINT HOLDER');
 assert.equal(holder.x,joint.x);assert.equal(joint.compression,undefined);
 for(const key of ['holder','jointHolder']) assert.equal(labels.find(l=>l.text===':'&&l.y===component.APPROVED_INFO_SLOTS[key].y&&l.x>200).x,word.WORD_HOLDER_COLON_X);
 assert.equal(word.WORD_LABEL_GAP_PT,72/25.4);assert.equal(word.WORD_DATA_GAP_PT,3*72/25.4);
 for(const key of ['branchName','holder','ifsc']){
  const c=key==='branchName'?word.WORD_LEFT_COLON_X:key==='holder'?word.WORD_HOLDER_COLON_X:word.WORD_CODE_COLON_X;
  const unit=font.WORD_FONT_SIZE_PT/font.WORD_FONT_UNITS*font.WORD_HORIZONTAL_SCALE;
  const visibleStart=word.wordValueX(key,'TEST')+font.WORD_INK_BOUNDS.T[0]*unit;
  assert(Math.abs(visibleStart-c-font.WORD_INK_BOUNDS[':'][1]*unit-word.WORD_DATA_GAP_PT)<1e-9);
 }
 for(const key in component.APPROVED_INFO_SLOTS) assert.equal(component.APPROVED_INFO_SLOTS[key].y,artwork.APPROVED_SLOTS[key].y);
});
test('new typography preserves tenant/customer binding, date, edits and three address rows',()=>{
 const a=component.approvedPassbookValues({name:'FIRST',accountOpeningDate:'19/10/2026',coName:'PARENT',fullAddress:'VILL-TEST, P.O-POST, ASSAM, 001200'},branch,new Date(2026,9,21));
 assert.equal(a.nominee,'1');assert.equal(a.openedOn,'19-10-2026');assert.equal(a.issueDate,'21-10-2026');assert.equal(a.operatedBy,'SELF');assert.equal(a.address1,'C/O PARENT');assert.equal(a.address4,'');
 const b=component.approvedPassbookValues({name:'SECOND',nominee:'3',jointHolder:'JOINT'},{...branch,name:'SECOND BRANCH',micr:'900000009'});
 const html=renderToStaticMarkup(word.WordPassbookArtwork({values:b}));assert(html.includes('SECOND BRANCH'));assert(html.includes('900000009'));assert(html.includes('data-label="JOINT HOLDER"'));assert(!html.includes('FIRST'));assert.equal(b.nominee,'3');
});

test('four customer address rows share holder colon ink origin, without affecting Quick',()=>{
 const c={coName:'PARENT',fullAddress:'VILL-TEST, P.O-POST, KARIMGANJ, ASSAM, PIN-001200'};
 const values=word.wordPassbookValues(c,branch);
 assert.deepEqual([values.address1,values.address2,values.address3,values.address4],['C/O PARENT','VILL-TEST, P.O-POST','KARIMGANJ','ASSAM, PIN-001200']);
 const factor=font.WORD_FONT_SIZE_PT/font.WORD_FONT_UNITS*font.WORD_HORIZONTAL_SCALE;
 for(let i=1;i<=4;i++){
  const k='address'+i;
  assert(Math.abs(word.wordValueX(k,values[k])+font.WORD_INK_BOUNDS[values[k][0]][0]*factor-word.WORD_HOLDER_COLON_X-font.WORD_INK_BOUNDS[':'][0]*factor)<1e-9);
 }
 assert.equal(component.approvedPassbookValues(c,branch).address4,'');
 const unknown=word.wordPassbookValues({fullAddress:'VILL-TEST, OTHER DISTRICT'},branch);
 assert.equal(unknown.address3,'OTHER DISTRICT');assert.equal(unknown.address4,'');
});

test('Quick reuses final typography and values with its existing branch-code placement',async()=>{
 const values=word.wordPassbookValues({name:'TEST CUSTOMER',coName:'PARENT',fullAddress:'VILL-TEST, P.O-POST, KARIMGANJ, ASSAM, PIN-001200'},branch);
 const normal=renderToStaticMarkup(word.WordPassbookArtwork({values}));
 const quick=renderToStaticMarkup(word.WordPassbookArtwork({values,quick:true}));
 const withoutBranch=html=>html.replace(/<g data-field="branchCode"[\s\S]*?<\/g>/,'');
 assert.equal(withoutBranch(quick),withoutBranch(normal));
 assert.equal(word.wordValueX('branchCode',values.branchCode,true),134*72/25.4);
 assert.deepEqual(word.wordPassbookProblems(values,true),[]);
 const source=await readFile(resolve(root,'src/AssamQuickPassbook.tsx'),'utf8');
 assert.match(source,/<WordPassbookArtwork quick values=\{wordPassbookValues/);
 assert.match(source,/onClick=\{onEdit\}>Temporary Edit/);
});
