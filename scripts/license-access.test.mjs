import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {generateKeyPairSync,sign,webcrypto} from 'node:crypto';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});
const signed=claims=>{const payload=JSON.stringify(claims);return {payload,signature:sign('sha256',Buffer.from(payload),privateKey).toString('base64url')};};
function harness(){
  let now=Date.now(),calls=0,remote;
  class Clock extends Date {static now(){return now;}}
  const values=new Map(),session=new Map(),timers=[];
  const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)});
  const auth={currentUser:{uid:'user-a'}},navigator={onLine:true},modules={};
  const context={Date:Clock,JSON,Math,Number,Promise,Error,TypeError,TextEncoder,Uint8Array,atob,crypto:webcrypto,localStorage:storage(values),sessionStorage:storage(session),navigator,window:{},setTimeout:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},clearTimeout:timer=>{if(timer)timer.cancelled=true;}};
  function load(file){
    if(modules[file])return modules[file];
    const exports={};modules[file]=exports;
    const source=ts.transpileModule(fs.readFileSync(`src/core/${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText;
    vm.runInNewContext(source,{...context,exports,require:path=>path.endsWith('firebase')?{auth}:path.endsWith('workerApi')?{callBankSetuWorker:async()=>{calls++;return remote();}}:path.endsWith('.json')?jwk:load(path.replace('./',''))});
    return exports;
  }
  const api=load('licenseAccess'),receipts=load('licenseReceipt');
  const response=(state='active',revision=1,extra={})=>{
    const plan=extra.plan||'annual',canWrite=['active','expiring_soon','demo_active'].includes(state),expiresAt=new Clock(now+(plan==='demo'?5:365)*86400000).toISOString();
    const shared={uid:auth.currentUser.uid,tenantId:session.get('bankSetuTenantId'),revision,state,plan,expiresAt,issuedAt:now,validUntil:now+5*86400000,...extra};
    return {view:{state,canWrite,daysRemaining:canWrite?5:0},authorization:signed({purpose:'banksetu-license-status-v1',...shared,canWrite}),receipt:canWrite?signed({purpose:'banksetu-license-v1',...shared}):null};
  };
  const bind=(uid='user-a',tenantId='tenant-a',role='client_admin',flag)=>{auth.currentUser={uid};session.set('bankSetuTenantId',tenantId);api.bindLicenseAccount(uid,{tenantId,role,licenseRequired:flag});};
  bind();
  return {api,receipts,session,values,auth,navigator,timers,bind,response,setRemote:fn=>remote=fn,calls:()=>calls,now:()=>now,advance:ms=>now+=ms};
}
test('missing and false profile flags cannot bypass licensing; master exemption is separate',async()=>{
 for(const flag of [undefined,false,true]){
  const h=harness();h.bind('user-a','tenant-a','client_admin',flag);h.setRemote(()=>h.response('pending'));
  await assert.rejects(h.api.requireLicensedWrite(),/pending, expired/);
  assert.equal(h.api.getLicensePermission().canWrite,false);assert.equal(h.session.get('bankSetuLicenseRequired'),'true');
 }
 const h=harness();h.bind('master','','master_owner');await h.api.requireLicensedWrite();assert.equal(h.calls(),0);
});
test('suspended, revoked, pending and expired / zero days immediately block writes, even after cache reuse',async()=>{
 for(const state of ['suspended','revoked','pending','expired']){
  const h=harness();h.values.set('customer-data','retained-photo-and-pending-queue');h.setRemote(()=>h.response());
  await h.api.requireLicensedWrite();assert.equal(h.api.getLicensePermission().canWrite,true);
  h.setRemote(()=>h.response(state,2));await h.api.refreshLicensePermission();
  assert.equal(h.api.getLicensePermission().state,state);assert.equal(h.api.getLicensePermission().daysRemaining,0);
  h.navigator.onLine=false;await assert.rejects(h.api.requireLicensedWrite());
  assert.equal(h.api.getLicensePermission().canWrite,false);assert.equal(h.values.get('customer-data'),'retained-photo-and-pending-queue');
 }
});
test('same-day online checks always use server status rather than cached permission',async()=>{
 const h=harness();h.setRemote(()=>h.response());await h.api.refreshLicensePermission();
 h.setRemote(()=>h.response('suspended',2));await assert.rejects(h.api.requireLicensedWrite());
 assert.equal(h.calls(),2);assert.equal(h.api.getLicensePermission().canWrite,false);
});
test('offline expiry blocks exactly at the boundary; cached claims cannot extend expiry',async()=>{
 const h=harness();h.setRemote(()=>h.response('active',1,{validUntil:h.now()+1000}));await h.api.refreshLicensePermission();
 h.navigator.onLine=false;await h.api.requireLicensedWrite();h.advance(1001);
 await assert.rejects(h.api.requireLicensedWrite());assert.equal(h.api.getLicensePermission().canWrite,false);
});
test('authorization revision rejects an old signed receipt and renewal securely unlocks',async()=>{
 const h=harness();const first=h.response();h.setRemote(()=>first);await h.api.requireLicensedWrite();
 h.setRemote(()=>h.response('suspended',2));await h.api.refreshLicensePermission();
 h.setRemote(()=>first);await assert.rejects(h.api.requireLicensedWrite());
 h.setRemote(()=>h.response('active',3));await h.api.requireLicensedWrite();assert.equal(h.api.getLicensePermission().revision,3);
 h.receipts.saveLicenseReceipt(first.receipt,'user-a','tenant-a');h.navigator.onLine=false;
 await assert.rejects(h.api.requireLicensedWrite());
});
test('offline outages allow a valid signed receipt; explicit server denial never falls back',async()=>{
 const h=harness();h.setRemote(()=>h.response());await h.api.requireLicensedWrite();
 h.setRemote(()=>{throw Object.assign(new Error('temporary'),{status:503});});await h.api.requireLicensedWrite();
 h.setRemote(()=>{throw Object.assign(new Error('denied'),{status:403});});await assert.rejects(h.api.requireLicensedWrite());
 h.navigator.onLine=false;await assert.rejects(h.api.requireLicensedWrite());
});
test('account switching rejects in-flight authorizations and prevents cross-tenant receipt reuse',async()=>{
 const h=harness();let finish;const prior=h.response();h.setRemote(()=>new Promise(resolve=>finish=resolve));
 const pending=h.api.refreshLicensePermission();h.bind('user-b','tenant-b');finish(prior);await pending;
 assert.equal(h.api.getLicensePermission().canWrite,false);assert.equal(h.api.getLicensePermission().uid,'user-b');
 h.navigator.onLine=false;await assert.rejects(h.api.requireLicensedWrite());
});
test('separate valid five-day sample-only demo remains allowed, then expires',async()=>{
 const h=harness();h.session.set('bankSetuConnectionMode','demo');h.setRemote(()=>h.response('demo_active',1,{plan:'demo'}));await h.api.requireLicensedWrite();
 assert.equal(h.session.get('bankSetuDemoWorkspace'),'active');h.navigator.onLine=false;h.advance(5*86400000);
 await assert.rejects(h.api.requireLicensedWrite());assert.equal(h.session.get('bankSetuDemoWorkspace'),'expired');
});
test('route policy blocks every protected route and preserves the specified read-only routes',()=>{
 const h=harness();
 const source=ts.transpileModule(fs.readFileSync('src/core/licensePolicy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};vm.runInNewContext(source,{exports});
 for(const page of ['customer-entry','quick-passbook','passbook','bank-formats','search','reports'])assert.equal(exports.canOpenLicensePage(page,true,false),false,page);
 for(const page of ['dashboard','customers','all-customer-data','settings','sync-backup','license-management','support'])assert.equal(exports.canOpenLicensePage(page,true,false),true,page);
 h.api.resetLicensePermission();
});
