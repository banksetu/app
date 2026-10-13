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
    ['users/client',doc('users/client',{role:'client_admin',tenantId:'tenant-a',status:'approved',subscriptionStatus:'active'})],
    ['tenants/tenant-a',doc('tenants/tenant-a',{tenantId:'tenant-a',ownerUid:'client',status:'active'})],
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
        const update=JSON.parse(options.body);const merged={...existing,name:`${base}/${key}`,fields:{...existing?.fields,...update.fields},updateTime:'2026-10-13T00:00:00.000Z'};store.set(key,merged);return Response.json(merged);
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
    const pending=await call('client','/license-me',{});
    assert.equal(pending.body.view.canWrite,false);
    assert.equal(pending.body.receipt,null);
    assert.equal((await call('client','/save-workspace-bank-settings',{bankInfo:{}})).status,403,'pending clients cannot write setup before license activation');
    assert.equal((await call('client','/presence-heartbeat',{})).status,403,'pending clients remain blocked from operations');
    assert.equal((await call('master','/create-client',{})).status,400);
    assert.equal((await call('master','/license-save-settings',{pricing:settings})).status,200);
    const id='01234567-89ab-4cde-8fab-0123456789ab';
    const deniedAssignment=await call('client','/license-admin-assign',{tenantId:'tenant-a',plan:'annual',requestId:id,paymentConfirmed:true});
    assert.equal(deniedAssignment.status,403,JSON.stringify(deniedAssignment.body));
    const indiaToday=new Date(Date.now()+330*60_000).toISOString().slice(0,10);
    assert.equal((await call('master','/license-admin-assign',{tenantId:'tenant-a',plan:'annual',requestId:id,paymentConfirmed:true,startDate:indiaToday})).status,200,'a selected India date of today activates immediately');
    store.set('tenants/tenant-future',doc('tenants/tenant-future',{tenantId:'tenant-future',ownerUid:'future',status:'active'}));
    const futureDate=new Date(Date.now()+3*86400000+330*60_000).toISOString().slice(0,10);
    const future=(await call('master','/license-admin-assign',{tenantId:'tenant-future',plan:'annual',requestId:'67890123-89ab-4cde-8fab-0123456789ab',paymentConfirmed:true,startDate:futureDate,durationMonths:12,paidPaise:149900}));
    assert.equal(future.status,200,JSON.stringify(future.body));assert.equal(future.body.license.status,'scheduled');assert.equal(future.body.license.activatedAt,new Date(`${futureDate}T00:00:00+05:30`).toISOString());
    const scheduledState={tenantId:'tenant-future',action:'suspend',requestId:'67890124-89ab-4cde-8fab-0123456789ab'};
    assert.equal((await call('master','/license-admin-state',scheduledState)).body.status,'suspended');
    assert.equal((await call('master','/license-admin-state',{...scheduledState,action:'reactivate',requestId:'67890125-89ab-4cde-8fab-0123456789ab'})).body.status,'active');
    const scheduledFields=store.get('tenantLicenses/tenant-future').fields;
    assert.equal(scheduledFields.activatedAt.stringValue,future.body.license.activatedAt,'reactivation preserves the scheduled start');
    const verified=await call('client','/license-me',{});
    const first=verified.body.license;
    assert.equal(first.tenantId,'tenant-a');assert.equal(first.plan,'annual');assert.equal(first.revision,1);
    const receipt=verified.body.receipt;
    const keyResponse=await worker.fetch(new Request('https://worker.example/license-public-key'),env);
    assert.equal(keyResponse.status,200);
    const publicKey=(await keyResponse.json()).publicKey;
    const key=await crypto.subtle.importKey('jwk',publicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const signature=Uint8Array.from(atob(receipt.signature.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
    assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(receipt.payload)));
    const claims=JSON.parse(receipt.payload);assert.equal(claims.tenantId,'tenant-a');assert.equal(claims.uid,'client');assert(claims.validUntil-claims.issuedAt<=5*86400000);assert(claims.validUntil<=Date.parse(first.expiresAt));
    store.set('tenantSettings/tenant-a',doc('tenantSettings/tenant-a',{spreadsheetId:'existing-sheet',photoFolderId:'existing-folder',bridgeUrl:'existing-bridge'}));
    const registration={bankName:'Synthetic CSP',passbookBank:'Test Bank',branchName:'Test Branch',operatorName:'Synthetic Operator',mobile:'0123456789',address:'Test Address'};
    assert.equal((await call('master','/save-client-registration',registration)).status,403);
    assert.equal((await call('client','/save-client-registration',{...registration,mobile:'invalid'})).status,400);
    assert.equal((await call('client','/save-client-registration',registration)).status,200);
    const savedSettings=store.get('tenantSettings/tenant-a').fields;
    assert.equal(savedSettings.mobile.stringValue,'0123456789');assert.equal(savedSettings.bankInfo.mapValue.fields.operatorName.stringValue,'Synthetic Operator');
    for(const [field,value] of Object.entries({spreadsheetId:'existing-sheet',photoFolderId:'existing-folder',bridgeUrl:'existing-bridge'}))assert.equal(savedSettings[field].stringValue,value,'registration preserves the verified Google resource connection');
    const renewal='12345678-89ab-4cde-8fab-0123456789ab';
    assert.equal((await call('client','/license-request-change',{kind:'renewal',requestId:renewal,transactionId:'UTR12345678',paymentDate:indiaToday,paidPaise:149900})).status,200);
    assert.equal(store.get(`licenseRequests/${renewal}`).fields.paymentStatus.stringValue,'client_reported');
    assert.equal((await call('master','/license-admin-decision',{requestId:renewal,action:'approve'})).status,400);
    assert.equal((await call('master','/license-admin-decision',{requestId:renewal,action:'approve',paymentConfirmed:true})).status,200);
    assert.equal((await call('master','/license-admin-decision',{requestId:renewal,action:'approve',paymentConfirmed:true})).body.repeated,true);
    const current=(await call('client','/license-me',{})).body.license;
    assert.equal(current.revision,2);assert(new Date(current.expiresAt)>new Date(first.expiresAt));
    assert.equal((await call('client','/license-request-change',{kind:'upgrade',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',transactionId:'UTR12345678'})).status,409,'one UTR cannot be reused for another request');
    const upgrade='23456789-89ab-4cde-8fab-0123456789ab';
    const request=(await call('client','/license-request-change',{kind:'upgrade',requestId:upgrade}));
    assert.equal(request.status,200);assert.equal(request.body.quotedPaise,350000);
    assert.equal((await call('master','/license-admin-decision',{requestId:upgrade,action:'approve',paymentConfirmed:true})).status,200);
    assert.equal((await call('master','/license-admin-decision',{requestId:upgrade,action:'approve',paymentConfirmed:true})).body.repeated,true);
    const lifetime=(await call('client','/license-me',{})).body.license;
    assert.equal(lifetime.tenantId,'tenant-a');assert.equal(lifetime.plan,'lifetime');assert.equal(lifetime.expiresAt,null);assert.equal(lifetime.revision,3);
    // Manage popup actions use the same protected transition model, without a client request.
    store.set('tenants/managed',doc('tenants/managed',{tenantId:'managed',status:'active'}));
    store.set('tenantLicenses/managed',doc('tenantLicenses/managed',{...first,tenantId:'managed'}));
    const change={tenantId:'managed',kind:'renewal',requestId:'abcdef01-89ab-4cde-8fab-0123456789ab',paymentConfirmed:true};
    assert.equal((await call('client','/license-admin-change',change)).status,403);
    assert.equal((await call('master','/license-admin-change',{...change,paymentConfirmed:false})).status,400);
    assert.equal((await call('master','/license-admin-change',{...change,durationMonths:0})).status,400);
    const renewed=await call('master','/license-admin-change',change);
    assert.equal(renewed.status,200,JSON.stringify(renewed.body));
    assert.equal(renewed.body.license.tenantId,'managed');assert.equal(renewed.body.license.revision,2);
    assert(Date.parse(renewed.body.license.expiresAt)>Date.parse(first.expiresAt));
    assert.equal((await call('master','/license-admin-change',change)).body.repeated,true);
    const managedUpgrade={...change,kind:'upgrade',requestId:'abcdef02-89ab-4cde-8fab-0123456789ab'};
    const converted=await call('master','/license-admin-change',managedUpgrade);
    assert.equal(converted.status,200,JSON.stringify(converted.body));assert.equal(converted.body.license.plan,'lifetime');
    assert.equal(converted.body.license.paidPaise,350000);assert.equal(converted.body.license.expiresAt,null);
    assert.equal((await call('master','/license-admin-change',managedUpgrade)).body.repeated,true);
    store.set('tenantLicenses/managed',doc('tenantLicenses/managed',{...first,tenantId:'managed',status:'suspended'}));
    assert.equal((await call('master','/license-admin-change',change)).status,409);
    store.set('tenantLicenses/managed',doc('tenantLicenses/managed',{...first,tenantId:'managed',status:'revoked'}));
    assert.equal((await call('master','/license-admin-change',change)).status,409);
    store.set('tenants/managed',doc('tenants/managed',{tenantId:'managed',status:'offboarding'}));
    assert.equal((await call('master','/license-admin-change',managedUpgrade)).status,409);
    assert.equal(store.get('tenantLicenses/tenant-a').fields.plan.stringValue,'lifetime','other tenant licenses remain untouched');
    const stateId='34567890-89ab-4cde-8fab-0123456789ab';
    assert.equal((await call('client','/license-admin-state',{tenantId:'tenant-a',action:'suspend',requestId:stateId})).status,403);
    assert.equal((await call('master','/license-admin-state',{tenantId:'tenant-a',action:'suspend',requestId:stateId})).body.status,'suspended');
    assert.equal((await call('master','/license-admin-state',{tenantId:'tenant-a',action:'suspend',requestId:stateId})).body.repeated,true);
    assert.equal((await call('client','/presence-heartbeat',{})).status,403);
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

test('authoritative license listing excludes fully offboarded and orphaned tenants while preserving active, expired demo, suspended and user counts',async()=>{
  const store=new Map([
    ['users/master',doc('users/master',{role:'master_owner',status:'approved',subscriptionStatus:'active'})],
    ['tenants/paid',doc('tenants/paid',{tenantId:'paid',bankName:'Paid CSP',status:'active'})],
    ['tenants/demo',doc('tenants/demo',{tenantId:'demo',status:'active'})],
    ['tenants/deleted',doc('tenants/deleted',{tenantId:'deleted',status:'offboarded'})],
    ['tenantLicenses/paid',doc('tenantLicenses/paid',{tenantId:'paid',plan:'lifetime',status:'suspended',revision:1})],
    ['tenantLicenses/demo',doc('tenantLicenses/demo',{tenantId:'demo',plan:'demo',status:'active',activatedAt:'2026-09-01T00:00:00.000Z',expiresAt:'2026-09-06T00:00:00.000Z'})],
    ['tenantLicenses/deleted',doc('tenantLicenses/deleted',{tenantId:'deleted',plan:'demo',status:'active',activatedAt:'2026-09-01T00:00:00.000Z',expiresAt:'2026-09-06T00:00:00.000Z'})],
    ['licenseRequests/orphan',doc('licenseRequests/orphan',{tenantId:'deleted',status:'pending'})],
  ]);
  globalThis.fetch=async(url,options={})=>{
    const text=String(url);
    if(text.includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'synthetic',expires_in:3600}));
    if(text.includes('accounts:lookup'))return new Response(JSON.stringify({users:[{localId:'master',email:'owner@example.invalid',emailVerified:true}]}));
    if(text.includes('firestore.googleapis.com')){
      const path=decodeURIComponent(text.split('/documents')[1]||'');
      if(path.startsWith('/tenantLicenses?')||path.startsWith('/tenants?')||path.startsWith('/licenseRequests?')||path.startsWith('/users?')){
        const collection=path.split('?')[0].slice(1);
        return new Response(JSON.stringify({documents:[...store].filter(([key])=>key.startsWith(`${collection}/`)).map(([,value])=>value)}));
      }
      const key=path.replace(/^\//,'').split('?')[0],value=store.get(key);
      return value?new Response(JSON.stringify(value)):new Response('{}',{status:404});
    }
    throw Error(`Unexpected request ${text} ${options.method}`);
  };
  const list=async()=>{const response=await worker.fetch(new Request('https://worker.example/license-admin-list',{method:'POST',headers:{origin:'https://banksetu-app.web.app',authorization:'Bearer master','content-type':'application/json'},body:'{}'}),env);assert.equal(response.status,200);return response.json();};
  try{
    let result=await list();assert.equal(result.summary.total,2);assert.equal(result.summary.demo,1);assert.equal(result.summary.expired,1);assert.equal(result.summary.suspended,1);assert.equal(result.summary.pending,0);assert.equal(result.licenses.length,2);
    store.set('users/new-user',doc('users/new-user',{role:'client_user',tenantId:'paid'}));assert.equal((await list()).summary.total,2);
    store.delete('users/new-user');assert.equal((await list()).summary.total,2);
    store.set('tenants/new',doc('tenants/new',{tenantId:'new',status:'active'}));const added=await list();assert.equal(added.summary.total,3);assert.equal(added.summary.pendingClients,1);assert.equal(added.licenses.find(item=>item.tenantId==='demo').viewState,'demo_expired');
    store.set('tenants/demo',doc('tenants/demo',{tenantId:'demo',status:'offboarding'}));assert.equal((await list()).summary.total,3,'partial offboarding remains counted');
    store.set('tenants/demo',doc('tenants/demo',{tenantId:'demo',status:'offboarded'}));result=await list();assert.equal(result.summary.total,2);assert.equal(result.summary.demo,0);assert.equal(result.summary.expired,0);
    store.delete('tenants/paid');result=await list();assert.equal(result.summary.total,1);assert.equal(result.summary.suspended,0);
  }finally{globalThis.fetch=originalFetch;}
});
