import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const source=ts.transpileModule(fs.readFileSync('src/core/licenseAccess.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText;
const storage=new Map([['bankSetuLicenseRequired','true'],['bankSetuTenantId','tenant-a'],['bankSetuLicenseReadOnly','false']]);
const auth={currentUser:{uid:'user-a'}};
const navigator={onLine:false};
let cached=async()=>({issuedAt:Date.now(),state:'active'}),remote=async()=>{throw Error('No network request expected');},calls=0;
const exports={};
vm.runInNewContext(source,{exports,require:specifier=>specifier.endsWith('firebase')?{auth}:specifier.endsWith('workerApi')?{callBankSetuWorker:async()=>{calls++;return remote();}}:{cachedLicenseReceipt:(...args)=>cached(...args),saveLicenseReceipt:()=>{},verifyLicenseReceipt:async value=>value.claims},sessionStorage:{getItem:key=>storage.get(key)||null},navigator,Date,Intl,Error,Promise});

test('pending or expired license cannot mutate local customer data even with a cached active receipt',async()=>{
 storage.set('bankSetuLicenseReadOnly','true');
 await assert.rejects(exports.requireLicensedWrite(),/pending or expired/);
 assert.equal(calls,0);
 storage.set('bankSetuLicenseReadOnly','false');
 cached=async()=>{throw Error('Expired signed receipt');};
 await assert.rejects(exports.requireLicensedWrite(),/Connect to the internet/);
});

test('signed offline active entitlement allows bounded local work, and a new online day checks the server',async()=>{
 cached=async()=>({issuedAt:Date.now(),state:'active'});navigator.onLine=false;
 await exports.requireLicensedWrite();assert.equal(calls,0);
 navigator.onLine=true;cached=async()=>({issuedAt:Date.now()-86400000,state:'active'});
 remote=async()=>({view:{canWrite:false},receipt:null});
 await assert.rejects(exports.requireLicensedWrite(),/pending or expired/);assert.equal(calls,1);
  cached=async()=>({issuedAt:Date.now()-16*60000,state:'active'});
  await assert.rejects(exports.requireLicensedWrite(),/pending or expired/);assert.equal(calls,2,'an online write rechecks a stale same-day entitlement');
  remote=async()=>{throw Object.assign(Error('temporary outage'),{status:503});};
  await exports.requireLicensedWrite();assert.equal(calls,3,'a temporary outage retains a valid signed offline entitlement');
  remote=async()=>{throw Object.assign(Error('license denied'),{status:403});};
  await assert.rejects(exports.requireLicensedWrite(),/license denied/);assert.equal(calls,4,'a server denial never falls back to the cached entitlement');
});
