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
 assert.match(html,/translate\(307.70001 360.20078\)/);
 assert(!html.includes('data-label="JOINT HOLDER"'));
 assert.deepEqual(word.wordPassbookProblems(values),[]);
 const long={...values,holder:'LONG NAME '.repeat(50)};
 assert(word.wordPassbookProblems(long).some(p=>p.startsWith('holder:')));assert.equal(long.holder.length,500);
});
test('all label and colon origins/baselines come from original artwork',()=>{
 for(const label of word.WORD_LABELS)assert(artwork.APPROVED_LABELS.some(c=>c.x===label.x&&c.y===label.y));
 assert.deepEqual(word.WORD_LABELS.filter(c=>c.text===':').map(c=>[c.x,c.y]),artwork.APPROVED_LABELS.filter(c=>c.char===':').map(c=>[c.x,c.y]));
});
test('new typography preserves tenant/customer binding, date, edits and three address rows',()=>{
 const a=component.approvedPassbookValues({name:'FIRST',accountOpeningDate:'19/10/2026',coName:'PARENT',fullAddress:'VILL-TEST, P.O-POST, ASSAM, 001200'},branch,new Date(2026,9,21));
 assert.equal(a.nominee,'1');assert.equal(a.openedOn,'19-10-2026');assert.equal(a.issueDate,'21-10-2026');assert.equal(a.operatedBy,'SELF');assert.equal(a.address1,'C/O PARENT');assert.equal(a.address4,'');
 const b=component.approvedPassbookValues({name:'SECOND',nominee:'3',jointHolder:'JOINT'},{...branch,name:'SECOND BRANCH',micr:'900000009'});
 const html=renderToStaticMarkup(word.WordPassbookArtwork({values:b}));assert(html.includes('SECOND BRANCH'));assert(html.includes('900000009'));assert(html.includes('data-label="JOINT HOLDER"'));assert(!html.includes('FIRST'));assert.equal(b.nominee,'3');
});
