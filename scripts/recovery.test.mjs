import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('src/core/recovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {classifyRecovery,recoveryJournal}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('recovery classifies safe diagnostics and verifies only an observed retry',()=>{
 assert.equal(classifyRecovery(Error('Lock timeout')), 'database-lock');
 assert.equal(classifyRecovery(Error('Workspace bridge changed')),'bridge');
 assert.equal(classifyRecovery(Error('License expired')),'license');
 const log=recoveryJournal(2);log.add({at:100000,category:'network',action:'bounded retry',result:'recovering'});
 log.add({at:100001,category:'network',action:'bounded retry',result:'recovering'});
 assert.equal(log.list().length,1);
 log.add({at:160002,category:'network',action:'retry original sync',result:'verified'});
 assert.equal(log.list()[0].result,'verified');
 log.add({at:220003,category:'bridge',action:'manual review required',result:'attention'});
 assert.equal(log.list().length,2);log.clear();assert.equal(log.list().length,0);
});
