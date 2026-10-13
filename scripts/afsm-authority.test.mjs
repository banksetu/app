import test from 'node:test';import assert from 'node:assert/strict';import worker from '../cloudflare/worker.js';import {setupPushFixture} from '../cloudflare/push-fixture.js';
test('AFSM confirmation uses server time and authenticated tenant, active demo/annual/lifetime only',async()=>{
 const fixture=setupPushFixture(),fetchMock=globalThis.fetch;
 globalThis.fetch=(url,options)=>String(url).includes('identitytoolkit.googleapis.com')?Promise.resolve(Response.json({users:[{localId:'client-user',email:'synthetic@example.invalid',emailVerified:true}]})):fetchMock(url,options);
 fixture.env.ALLOWED_ORIGINS='https://banksetu-app.web.app';fixture.env.FIREBASE_WEB_API_KEY='synthetic';
 fixture.put('users/client-user',{role:'client_user',tenantId:'tenant-a',status:'approved',subscriptionStatus:'active'});fixture.put('tenants/tenant-a',{status:'active',ownerUid:'client-user'});
 const request=()=>new Request('https://worker.invalid/afsm-confirmation',{method:'POST',headers:{origin:'https://banksetu-app.web.app',authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),tenantId:'attacker-chosen-tenant',confirmedAt:'1999-01-01'})});
 try{
 for(const plan of ['demo','annual','lifetime']){
  const now=Date.now();fixture.put('tenantLicenses/tenant-a',{tenantId:'tenant-a',plan,status:'active',activatedAt:new Date(now).toISOString(),startsAt:new Date(now).toISOString(),expiresAt:new Date(now+(plan==='demo'?5:1)*86400000).toISOString()});
  const response=await worker.fetch(request(),fixture.env);assert.equal(response.status,200);const result=await response.json();assert.equal(result.tenantId,'tenant-a');assert.equal(result.uid,'client-user');assert(Math.abs(Date.parse(result.confirmedAt)-Date.now())<5000);
 }
 for(const status of ['suspended','revoked','expired']){fixture.put('tenantLicenses/tenant-a',{tenantId:'tenant-a',plan:'annual',status,expiresAt:'2020-01-01'});assert.equal((await worker.fetch(request(),fixture.env)).status,403);}
 }finally{fixture.restore();}
});
