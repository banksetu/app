const test=require('node:test');const assert=require('node:assert/strict');
const {createBackgroundNotifications}=require('./background-notifications.cjs');
const session={uid:'user-a',tenantId:'tenant-a',refreshToken:'synthetic-refresh',worker:'https://banksetu-client-api.banksetu2026.workers.dev'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('background receiver refreshes auth without a renderer, deduplicates changes and clears on revocation',async()=>{
 let stored=null,revision=1,revoked=false;const notices=[];
 const fetch=async url=>{
  if(url.includes('securetoken'))return Response.json({user_id:session.uid,id_token:'synthetic-id',refresh_token:'rotated-refresh'});
  if(revoked)return new Response('{}',{status:403});
  if(url.endsWith('/license-me'))return Response.json({uid:'user-a',tenantId:'tenant-a',license:{tenantId:'tenant-a',revision},view:{state:revision===1?'demo_active':'expired'}});
  if(url.endsWith('/license-my-requests'))return Response.json({requests:[]});
  return Response.json({windowsVersion:'1.0.72'});
 };
 const receiver=createBackgroundNotifications({fetch,read:()=>null,write:value=>stored=value,notify:value=>notices.push(value),currentVersion:'1.0.72'});
 try{receiver.bind(session);await tick();assert.equal(notices.length,0);assert.equal(stored.refreshToken,'rotated-refresh');revision=2;await receiver.poll();assert.equal(notices.length,1);await receiver.poll();assert.equal(notices.length,1);revoked=true;await receiver.poll();assert.equal(receiver.status().enabled,false);assert.equal(stored,null);}finally{receiver.stop();}
});
test('foreign identity and cross-tenant response never produce a notification',async()=>{
 for(const identity of ['other-user','user-a']){
  const notices=[];const receiver=createBackgroundNotifications({fetch:async url=>url.includes('securetoken')?Response.json({user_id:identity,id_token:'id'}):url.endsWith('/license-me')?Response.json({uid:'user-a',tenantId:'other-tenant',license:{tenantId:'other-tenant',revision:2},view:{state:'active'}}):Response.json({requests:[]}),read:()=>null,write:()=>{},notify:value=>notices.push(value),currentVersion:'1.0.72'});
  try{receiver.bind(session);await tick();assert.equal(receiver.status().enabled,false);assert.equal(notices.length,0);}finally{receiver.stop();}
 }
});
test('logout while an authenticated poll is pending cannot restore the notification session',async()=>{
 let resolve,stored=null;const receiver=createBackgroundNotifications({fetch:()=>new Promise(done=>resolve=done),read:()=>null,write:value=>stored=value,notify:()=>assert.fail('stale notification'),currentVersion:'1.0.72'});
 receiver.bind(session);receiver.clear();resolve(Response.json({user_id:'user-a',id_token:'id'}));await tick();assert.equal(stored,null);assert.equal(receiver.status().enabled,false);receiver.stop();
});
