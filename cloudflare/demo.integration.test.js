import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import worker from './worker.js';

const project='synthetic-demo';
const base=`projects/${project}/databases/(default)/documents`;
const wrap=value=>typeof value==='string'?{stringValue:value}:typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:value===null?{nullValue:null}:{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,wrap(item)]))}};
const fields=value=>Object.fromEntries(Object.entries(value).map(([key,item])=>[key,wrap(item)]));
const document=(path,value)=>({name:`${base}/${path}`,fields:fields(value),updateTime:'2026-10-10T00:00:00.000Z'});
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={ALLOWED_ORIGINS:'https://banksetu-app.web.app',FIREBASE_PROJECT_ID:project,FIREBASE_WEB_API_KEY:'synthetic-key',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:'synthetic@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})})};

test('demo is server-owned, single-use, sample-only and converts without moving customer records',async()=>{
  const store=new Map([
    ['users/master',document('users/master',{role:'master_owner',status:'approved',subscriptionStatus:'active'})],
    ['users/demo-user',document('users/demo-user',{role:'client_admin',tenantId:'trial-a',status:'pending',subscriptionStatus:'inactive',licenseRequired:true,licensingInvite:true})],
    ['tenants/trial-a',document('tenants/trial-a',{tenantId:'trial-a',ownerUid:'demo-user',status:'active',bankName:'Synthetic Demo'})],
    ['tenantSettings/trial-a',document('tenantSettings/trial-a',{tenantId:'trial-a',spreadsheetId:'',photoFolderId:''})],
    ['appSettings/licensing',document('appSettings/licensing',{pricing:{annualPaise:149900,lifetimePaise:499900,annualAvailable:true,lifetimeAvailable:true,upgradeCreditEnabled:false,maxCreditPaise:0,graceDays:0,paymentInstructions:'Contact Master Admin.'}})],
  ]);
  const beforeKeys=[...store.keys()];let revision=0;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const text=String(url);
    if(text.includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'synthetic',expires_in:3600}));
    if(text.includes('accounts:lookup'))return new Response(JSON.stringify({users:[{localId:JSON.parse(options.body).idToken==='master'?'master':'demo-user',email:'synthetic@example.invalid',emailVerified:true}]}));
    if(text.includes('firestore.googleapis.com')){
      const path=decodeURIComponent(text.split('/documents')[1]||'');
      if(path===':commit'){
        const writes=JSON.parse(options.body).writes;
        for(const write of writes){const key=write.update.name.slice(base.length+1),old=store.get(key);if((write.currentDocument?.exists===false&&old)||(write.currentDocument?.updateTime&&old?.updateTime!==write.currentDocument.updateTime))return new Response('{}',{status:409});}
        for(const write of writes){const key=write.update.name.slice(base.length+1);store.set(key,{...write.update,updateTime:`2026-10-10T00:00:${String(++revision).padStart(2,'0')}.000Z`});}
        return new Response('{}');
      }
      const item=store.get(path.replace(/^\//,''));return item?new Response(JSON.stringify(item)):new Response('{}',{status:404});
    }
    throw new Error(`Unexpected request: ${text}`);
  };
  const call=async(token,path,body={})=>{const response=await worker.fetch(new Request(`https://worker.example${path}`,{method:'POST',headers:{origin:'https://banksetu-app.web.app',authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)}),env);return {status:response.status,body:await response.json()};};
  try{
    const id='11111111-1111-4111-8111-111111111111';
    assert.equal((await call('demo','/license-admin-demo',{tenantId:'trial-a',requestId:id})).status,403);
    const activated=await call('master','/license-admin-demo',{tenantId:'trial-a',requestId:id});
    assert.equal(activated.status,200);assert.equal(activated.body.license.plan,'demo');
    assert.equal(Date.parse(activated.body.license.expiresAt)-Date.parse(activated.body.license.activatedAt),5*86400000);
    assert.equal((await call('master','/license-admin-demo',{tenantId:'trial-a',requestId:id})).body.repeated,true);
    assert.equal((await call('master','/license-admin-demo',{tenantId:'trial-a',requestId:'22222222-2222-4222-8222-222222222222'})).status,409);
    const me=await call('demo','/license-me');
    assert.equal(me.body.view.state,'demo_active');assert.equal(JSON.parse(me.body.receipt.payload).plan,'demo');
    assert.equal((await call('demo','/get-google-setup')).status,403);
    assert.equal((await call('demo','/connect-option-b',{})).status,403);
    const grant=await call('demo','/get-offline-session');
    assert.equal(grant.status,200);assert.equal(JSON.parse(grant.body.payload).demoOnly,true);
    assert.equal((await call('demo','/license-admin-demo-convert',{tenantId:'trial-a',plan:'annual',requestId:'33333333-3333-4333-8333-333333333333',paymentConfirmed:true})).status,403);
    const converted=await call('master','/license-admin-demo-convert',{tenantId:'trial-a',plan:'annual',requestId:'33333333-3333-4333-8333-333333333333',paymentConfirmed:true});
    assert.equal(converted.status,200);assert.equal(converted.body.license.demoOnly,false);
    assert.equal(converted.body.productionWorkspaceRequiresConnection,true);
    assert.equal((await call('master','/license-admin-demo-convert',{tenantId:'trial-a',plan:'annual',requestId:'33333333-3333-4333-8333-333333333333',paymentConfirmed:true})).body.repeated,true);
    assert.equal(store.get('tenantSettings/trial-a').fields.spreadsheetId.stringValue,'');
    assert.equal(beforeKeys.some(key=>key.startsWith('customers/')),false);
    assert.equal([...store.keys()].some(key=>key.startsWith('customers/')),false);
  }finally{globalThis.fetch=original;}
});
