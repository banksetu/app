import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {classify,notesFor} from './release-notes.mjs';

test('first and later platform releases classify only committed app changes',()=>{
 assert.deepEqual(notesFor([], 'windows'),{});
 const changes=[
  {subject:'fix(windows): Recover paused sync after account switch',paths:['src/core/localData.ts','desktop/main.cjs']},
  {subject:'feat(android): Improve customer search recovery',paths:['src/tenantApi.ts']},
  {subject:'perf: Reduce unnecessary sync requests',paths:['src/core/localData.ts']},
  {subject:'chore: Portfolio copy update',paths:['portfolio/content/site.json']},
  {subject:'Revert "feat: prior feature"',paths:['src/App.tsx']},
  {subject:'feat: prior feature',paths:['src/App.tsx']},
  {subject:'Release metadata v1.0.99',paths:['public/version.json']},
 ];
 assert.deepEqual(notesFor(changes,'windows'),{'Bug Fixes':['Recover paused sync after account switch.'],'Performance & Stability':['Reduce unnecessary sync requests.']});
 assert.deepEqual(notesFor(changes,'android'),{'New Features':['Improve customer search recovery.'],'Performance & Stability':['Reduce unnecessary sync requests.']});
});
test('unclear or sensitive subjects use a neutral summary without leaking secrets or PII',()=>{
 assert.equal(classify('fix: private key abc@example.com', ['src/App.tsx']).text,'Maintenance and reliability updates.');
 assert.equal(classify('Some internal refactor', ['src/App.tsx']).category,'Improvements');
 assert.equal(classify('fix: <script>alert(1)</script>', ['src/App.tsx']).text,'Maintenance and reliability updates.');
});
test('Android only parses its published release section and never inserts HTML',async()=>{
 const source=fs.readFileSync('src/platform/releaseNotes.ts','utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
 const {parsePlatformNotes}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const body='# Bank Setu 1.0.61\n\n## Windows\n\n### Bug Fixes\n- Windows only.\n\n## Android\n\n### New Features\n- Android only.\n\n### Improvements\n- <img onerror=alert(1)>\n';
 const parsed=parsePlatformNotes(body,'Android');
 assert.deepEqual(parsed.categories,{'New Features':['Android only.'],'Improvements':['<img onerror=alert(1)>']});
 assert(!JSON.stringify(parsed).includes('Windows only'));
});
