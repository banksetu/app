import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import worker from './worker.js';
const project='synthetic-banksetu';
const base=`projects/${project}/databases/(default)/documents`;
const wrap=(value)=>typeof value==='string'?{stringValue:value}:typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:value===null?{nullValue:null}:{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,wrap(v)]))}};
const fields=value=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,wrap(v)]));
const doc=(key,value,revision=1)=>({name:`${base}/${key}`,fields:fields(value),updateTime:`2026-10-10T00:00:0${revision}.000Z`});
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={ALLOWED_ORIGINS:'https://banksetu-app.web.app',FIREBASE_PROJECT_ID:project,FIREBASE_WEB_API_KEY:'synthetic-key',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:'synthetic@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})})};
const settings={annualPaise:149900,lifetimePaise:499900,annualAvailable:true,lifetimeAvailable:true,upgradeCreditEnabled:true,maxCreditPaise:149900,graceDays:7,paymentInstructions:'Contact Master Admin.'};
const originalFetch=globalThis.fetch;
test('server-only annual activation, renewal and duplicate approval are atomic and tenant scoped',async()=>{
  const store=new Map([
    ['users/master',doc('users/master',{role:'master_owner',status:'approved',subscriptionStatus:'active'})],
    ['users/client',doc('users/client',{role:'client_admin',tenantId:'tenant-a',status:'approved',subscriptionStatus:'active',licenseRequired:true})],
    ['tenants/tenant-a',doc('tenants/tenant-a',{tenantId:'tenant-a',ownerUid:'client',status:'active'})],
    ['tenantSettings/tenant-a',doc('tenantSettings/tenant-a',{tenantId:'tenant-a',bankName:'Synthetic Bank',apiUrl:'https://script.google.com/macros/s/original/exec'})],
  ]);
  let commitCount=0;
  globalThis.fetch=async (url,options={})=>{
    const text=String(url);
    if(text.includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'synthetic',expires_in:3600}));
    if(text.includes('accounts:lookup')){const master=JSON.parse(options.body).idToken==='master';return new Response(JSON.stringify({users:[{localId:master?'master':'client',email:master?'owner@example.invalid':'client@example.invalid',emailVerified:true}]}));}
    if(text.includes('firestore.googleapis.com')){
      const path=decodeURIComponent(text.split('/documents')[1]||'');
      if(path===':runQuery'){
        const query=JSON.parse(options.body).structuredQuery;
        const ordered=[...store.values()].filter(item=>item.name.includes('/licenseAudit/')).sort((a,b)=>String(b.fields.at.stringValue).localeCompare(String(a.fields.at.stringValue))||b.name.localeCompare(a.name));
        const cursor=query.startAt?.values;
        const after=cursor?ordered.filter(item=>String(item.fields.at.stringValue)<cursor[0].stringValue||String(item.fields.at.stringValue)===cursor[0].stringValue&&item.name<cursor[1].referenceValue):ordered;
        return new Response(JSON.stringify(after.slice(0,query.limit).map(document=>({document}))));
      }
      if(path===':commit'){
        const writes=JSON.parse(options.body).writes;
        for(const write of writes){const key=write.update.name.slice(base.length+1);const old=store.get(key);if(write.currentDocument?.exists===false&&old||write.currentDocument?.updateTime&&old?.updateTime!==write.currentDocument.updateTime)return new Response(JSON.stringify({error:{message:'Conflict'}}),{status:409});}
        for(const write of writes){const key=write.update.name.slice(base.length+1);store.set(key,{...write.update,updateTime:`2026-10-10T00:00:${String(++commitCount).padStart(2,'0')}.000Z`});}
        return new Response('{}');
      }
      const key=path.replace(/^\//,'').split('?')[0];const existing=store.get(key);
      if(options.method==='PATCH'){
        const patch=JSON.parse(options.body);
        store.set(key,{...existing,fields:{...existing?.fields,...patch.fields}});
        return new Response(JSON.stringify(store.get(key)));
      }
      return existing?new Response(JSON.stringify(existing)):new Response(JSON.stringify({error:{message:'Not found'}}),{status:404});
    }
    throw new Error(`Unexpected request: ${text}`);
  };
  const call=async(token,path,body)=>{
    const response=await worker.fetch(new Request(`https://worker.example${path}`,{method:'POST',headers:{origin:'https://banksetu-app.web.app',authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)}),env);
    return {status:response.status,body:await response.json()};
  };
  try{
    assert.equal((await call('client','/license-save-settings',{pricing:settings})).status,403);
    assert.equal((await call('client','/presence-heartbeat',{})).status,403);
    assert.equal((await call('client','/save-client-bridge-url',{apiUrl:'https://script.google.com/macros/s/new-deployment/exec'})).status,403);
    const pending=await call('client','/license-me',{});
    assert.equal(pending.body.view.canWrite,false);
    assert.equal(pending.body.receipt,null);
    assert.equal((await call('master','/create-client',{})).status,409);
    assert.equal((await call('master','/license-save-settings',{pricing:settings})).status,200);
    const id='01234567-89ab-4cde-8fab-0123456789ab';
    assert.equal((await call('client','/license-admin-assign',{tenantId:'tenant-a',plan:'annual',requestId:id,paymentConfirmed:true})).status,403);
    assert.equal((await call('master','/license-admin-assign',{tenantId:'tenant-a',plan:'annual',requestId:id,paymentConfirmed:true})).status,200);
    const verified=await call('client','/license-me',{});
    const first=verified.body.license;
    assert.equal(first.tenantId,'tenant-a');assert.equal(first.plan,'annual');assert.equal(first.revision,1);
    assert.equal((await call('client','/save-client-bridge-url',{apiUrl:'https://unsafe.example/exec'})).status,400);
    assert.equal((await call('client','/save-client-bridge-url',{apiUrl:'https://script.google.com/macros/s/new-deployment/exec',tenantId:'another-tenant'})).status,200);
    assert.equal(store.get('tenantSettings/tenant-a').fields.apiUrl.stringValue,'https://script.google.com/macros/s/new-deployment/exec');
    assert.equal(store.get('tenantSettings/tenant-a').fields.bankName.stringValue,'Synthetic Bank');
    assert.equal(store.has('tenantSettings/another-tenant'),false);
    const receipt=verified.body.receipt;
    const keyResponse=await worker.fetch(new Request('https://worker.example/license-public-key'),env);
    assert.equal(keyResponse.status,200);
    const publicKey=(await keyResponse.json()).publicKey;
    const key=await crypto.subtle.importKey('jwk',publicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const signature=Uint8Array.from(atob(receipt.signature.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
    assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(receipt.payload)));
    const claims=JSON.parse(receipt.payload);assert.equal(claims.tenantId,'tenant-a');assert.equal(claims.uid,'client');assert(claims.validUntil-claims.issuedAt<=5*86400000);assert(claims.validUntil<=Date.parse(first.expiresAt));
    const renewal='12345678-89ab-4cde-8fab-0123456789ab';
    assert.equal((await call('client','/license-request-change',{kind:'renewal',requestId:renewal})).status,200);
    assert.equal((await call('master','/license-admin-decision',{requestId:renewal,action:'approve'})).status,400);
    assert.equal((await call('master','/license-admin-decision',{requestId:renewal,action:'approve',paymentConfirmed:true})).status,200);
    assert.equal((await call('master','/license-admin-decision',{requestId:renewal,action:'approve',paymentConfirmed:true})).body.repeated,true);
    const current=(await call('client','/license-me',{})).body.license;
    assert.equal(current.revision,2);assert(new Date(current.expiresAt)>new Date(first.expiresAt));
    const upgrade='23456789-89ab-4cde-8fab-0123456789ab';
    const request=(await call('client','/license-request-change',{kind:'upgrade',requestId:upgrade}));
    assert.equal(request.status,200);assert.equal(request.body.quotedPaise,350000);
    assert.equal((await call('master','/license-admin-decision',{requestId:upgrade,action:'approve',paymentConfirmed:true})).status,200);
    assert.equal((await call('master','/license-admin-decision',{requestId:upgrade,action:'approve',paymentConfirmed:true})).body.repeated,true);
    const lifetime=(await call('client','/license-me',{})).body.license;
    assert.equal(lifetime.tenantId,'tenant-a');assert.equal(lifetime.plan,'lifetime');assert.equal(lifetime.expiresAt,null);assert.equal(lifetime.revision,3);
    const stateId='34567890-89ab-4cde-8fab-0123456789ab';
    assert.equal((await call('client','/license-admin-state',{tenantId:'tenant-a',action:'suspend',requestId:stateId})).status,403);
    assert.equal((await call('master','/license-admin-state',{tenantId:'tenant-a',action:'suspend',requestId:stateId})).body.status,'suspended');
    assert.equal((await call('master','/license-admin-state',{tenantId:'tenant-a',action:'suspend',requestId:stateId})).body.repeated,true);
    assert.equal((await call('client','/presence-heartbeat',{})).status,403);
    assert.equal((await call('client','/save-client-bridge-url',{apiUrl:''})).status,403);
    assert.equal((await call('client','/license-me',{})).body.view.state,'suspended');
    assert.equal((await call('master','/license-admin-state',{tenantId:'tenant-a',action:'reactivate',requestId:'45678901-89ab-4cde-8fab-0123456789ab'})).body.status,'active');
    for(let index=0;index<55;index++){
      const id=`history-${String(index).padStart(3,'0')}`;
      store.set(`licenseAudit/${id}`,doc(`licenseAudit/${id}`,{action:'synthetic_test',tenantId:'tenant-a',actorUid:'master',at:new Date(Date.UTC(2026,9,10,0,0,index)).toISOString()}));
    }
    const firstPage=await call('master','/license-admin-history',{});
    assert.equal(firstPage.body.activities.length,50);assert(firstPage.body.nextCursor);
    const secondPage=await call('master','/license-admin-history',{cursor:firstPage.body.nextCursor});
    assert(secondPage.body.activities.length>=5);assert.equal(secondPage.body.nextCursor,null);
    assert.equal(new Set([...firstPage.body.activities,...secondPage.body.activities].map(item=>item.id)).size,firstPage.body.activities.length+secondPage.body.activities.length);
    assert.equal((await call('client','/license-admin-history',{})).status,403);
  }finally{globalThis.fetch=originalFetch;}
});
