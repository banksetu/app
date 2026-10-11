const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createLicenseGuard}=require('./license-guard.cjs');
const {createStore}=require('./store.cjs');

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const authorize=createLicenseGuard(publicKey.export({format:'jwk'}));
const signed=claims=>{const payload=JSON.stringify(claims);return {payload,signature:sign('sha256',Buffer.from(payload),privateKey).toString('base64url')};};
const now=Date.now(),uid='synthetic-user',tenantId='synthetic-tenant',scope=`${uid}:${tenantId}:google-sheet-a`;
const grant=overrides=>signed({uid,tenantId,role:'client_admin',connectionId:'google-sheet-a',status:'approved',subscriptionStatus:'active',licenseRequired:true,issuedAt:now-1000,expiresAt:now+86400000,...overrides});
const receipt=overrides=>signed({purpose:'banksetu-license-v1',uid,tenantId,revision:1,state:'active',plan:'annual',issuedAt:now-1000,validUntil:now+86400000,expiresAt:new Date(now+365*86400000).toISOString(),...overrides});
const fake=(session,licensed=false,existing=false)=>({read:key=>key===`offline:${uid}`?{offlineSession:session}:{records:existing?[{id:'saved'}]:[],operations:[]},isLicensed:()=>licensed});

test('native customer commits need matching signed workspace and current licensed entitlement',()=>{
  assert.equal(authorize(fake(grant()),scope,receipt(),now),true);
  assert.throws(()=>authorize(fake(grant()),scope,undefined,now),/Signed workspace authorization/);
  assert.throws(()=>authorize(fake(grant()),scope,receipt({state:'pending'}),now),/pending, expired/);
  assert.throws(()=>authorize(fake(grant()),scope,receipt({validUntil:now-1}),now),/pending, expired/);
  assert.throws(()=>authorize(fake(grant()),scope,receipt({tenantId:'another-tenant'}),now),/pending, expired/);
  assert.throws(()=>authorize(fake(grant({tenantId:'another-tenant'})),scope,receipt(),now),/does not match/);
  assert.throws(()=>authorize(fake(grant({expiresAt:now-1})),scope,receipt(),now),/expired/);
  const forged={...receipt(),payload:JSON.stringify({plan:'lifetime'})};
  assert.throws(()=>authorize(fake(grant()),scope,forged,now),/signature|invalid/);
});

test('native guard retains legacy data without treating it as a client entitlement',()=>{
  assert.throws(()=>authorize(fake(undefined),scope,undefined,now),/Verify this workspace online/);
  assert.throws(()=>authorize(fake(undefined,false,true),scope,undefined,now),/Verify this workspace online/);
  assert.throws(()=>authorize(fake(undefined,true,true),scope,undefined,now),/Verify this workspace online/);
  const legacy=grant({licenseRequired:false,expiresAt:now+7*3600000});
  assert.throws(()=>authorize(fake(legacy,true,true),scope,undefined,now),/Signed workspace authorization/);
  assert.throws(()=>authorize(fake(legacy,false,true),scope,undefined,now),/Signed workspace authorization/);
  assert.equal(authorize(fake(legacy,false,true),scope,receipt(),now),true);
  assert.equal(authorize(fake(undefined),`offline:${uid}`,undefined,now),false);
});

test('sample demo grant and receipt stay within their dedicated workspace',()=>{
  const demoScope=`${uid}:demo:${tenantId}:demo-sample`;
  const demoGrant=grant({demoOnly:true,connectionId:'demo-sample'});
  assert.equal(authorize(fake(demoGrant),demoScope,receipt({state:'demo_active',plan:'demo'}),now),true);
  assert.throws(()=>authorize(fake(demoGrant),scope,receipt({state:'demo_active',plan:'demo'}),now),/does not match/);
  assert.throws(()=>authorize(fake(demoGrant),demoScope,receipt({state:'active'}),now),/pending, expired/);
});

test('licensed SQLite customer and pending operation survive restart and grant removal without a write bypass',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-license-test-'));
 try{
  let store=createStore(directory),empty={records:[],operations:[]};
  store.commit(`offline:${uid}`,empty,{...empty,offlineSession:grant()});
  const after={records:[{scope,recordId:'synthetic-customer'}],operations:[{scope,operationId:'synthetic-pending'}]};
  store.commit(scope,empty,after,authorize(store,scope,receipt(),now));
  store.close();store=createStore(directory);
  assert.deepEqual(store.read(scope),after);
  assert.equal(store.isLicensed(scope),true);
  const oldGrant=store.read(`offline:${uid}`);
  store.commit(`offline:${uid}`,oldGrant,empty);
  assert.throws(()=>authorize(store,scope,receipt(),now),/Verify this workspace online/);
  assert.deepEqual(store.read(scope),after);
  store.close();
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('native authorization persists suspension revision across restart, blocks printing and preserves pending customer/photo data',()=>{
 const {createLicenseAuthority}=require('./license-guard.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-authority-test-'));
 const status=(state,revision)=>signed({purpose:'banksetu-license-status-v1',uid,tenantId,revision,state,canWrite:state==='active',plan:'annual',issuedAt:now-1000,validUntil:now+86400000});
 try{
  let store=createStore(directory),empty={records:[],operations:[]};
  store.commit(`offline:${uid}`,empty,{...empty,offlineSession:grant({licenseRequired:undefined})});
  const data={records:[{scope,recordId:'customer',customer:{photoDataUrl:'retained-photo'}}],operations:[{scope,operationId:'pending'}]};
  store.commit(scope,empty,data,true);
  let authority=createLicenseAuthority(publicKey.export({format:'jwk'}),store);
  authority.session(uid);authority.status(status('active',1),now);authority.acceptReceipt(receipt(),now);authority.protectedAction();
  authority.status(status('suspended',2),now);
  assert.throws(()=>authority.protectedAction());assert.throws(()=>authorize(store,scope,receipt(),now),/superseded/);
  store.close();store=createStore(directory);authority=createLicenseAuthority(publicKey.export({format:'jwk'}),store);authority.session(uid);
  assert.throws(()=>authority.status(status('active',1),now),/stale/);
  assert.throws(()=>authority.acceptReceipt(receipt(),now),/superseded/);
  assert.deepEqual(store.read(scope),data);
  authority.status(status('active',3),now);authority.acceptReceipt(receipt({revision:3}),now);authority.protectedAction();
  authority.session('another-user');assert.throws(()=>authority.protectedAction());assert.throws(()=>authority.commit(scope,receipt({revision:3})),/invalid|changed/i);
  assert.deepEqual(store.read(scope),data);store.close();
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
