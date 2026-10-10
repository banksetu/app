const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createLicenseGuard}=require('./license-guard.cjs');

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

test('native guard keeps legacy data but cannot create an unverified workspace or downgrade a licensed one',()=>{
  assert.throws(()=>authorize(fake(undefined),scope,undefined,now),/Verify this workspace online/);
  assert.equal(authorize(fake(undefined,false,true),scope,undefined,now),false);
  assert.throws(()=>authorize(fake(undefined,true,true),scope,undefined,now),/Verify this workspace online/);
  const legacy=grant({licenseRequired:false,expiresAt:now+7*3600000});
  assert.throws(()=>authorize(fake(legacy,true,true),scope,undefined,now),/current signed license/);
  assert.equal(authorize(fake(legacy,false,true),scope,undefined,now),false);
  assert.equal(authorize(fake(undefined),`offline:${uid}`,undefined,now),false);
});

test('sample demo grant and receipt stay within their dedicated workspace',()=>{
  const demoScope=`${uid}:demo:${tenantId}:demo-sample`;
  const demoGrant=grant({demoOnly:true,connectionId:'demo-sample'});
  assert.equal(authorize(fake(demoGrant),demoScope,receipt({state:'demo_active',plan:'demo'}),now),true);
  assert.throws(()=>authorize(fake(demoGrant),scope,receipt({state:'demo_active',plan:'demo'}),now),/does not match/);
  assert.throws(()=>authorize(fake(demoGrant),demoScope,receipt({state:'active'}),now),/pending, expired/);
});
