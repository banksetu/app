import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{supportMedia} from './worker.js';
import {SUPPORT_MEDIA_TTL} from './supportMedia.js';
import {setupPushFixture} from './push-fixture.js';

function fixture(){
 const f=setupPushFixture();f.env.ALLOWED_ORIGINS='https://banksetu-app.web.app';f.env.FIREBASE_WEB_API_KEY='synthetic-key';
 for(const [uid,role,tenantId]of [['master','master_owner',''],['client-a','client_admin','tenant-a'],['user-a','client_user','tenant-a'],['client-b','client_admin','tenant-b']])f.put('users/'+uid,{uid,role,tenantId,name:uid,email:uid+'@example.test',status:'approved',subscriptionStatus:'active'});
 for(const tenantId of ['tenant-a','tenant-b']){
  f.put('tenants/'+tenantId,{status:'active',ownerUid:'client-'+tenantId.at(-1)});
  f.put('tenantLicenses/'+tenantId,{tenantId,plan:'lifetime',status:'active',activatedAt:'2026-01-01T00:00:00Z',expiresAt:null,revision:1});
 }
 f.call=async(uid,route,body)=>worker.fetch(new Request('https://worker.example'+route,{method:'POST',headers:{origin:f.env.ALLOWED_ORIGINS,authorization:'Bearer '+uid,'content-type':'application/json'},body:JSON.stringify(body)}),f.env);
 return f;
}
const photo='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9S3CqVEAAAAASUVORK5CYII=';
const audio=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVEfmt '),Buffer.alloc(24),Buffer.from('data'),Buffer.alloc(20)]).toString('base64');
const upload=(type='photo',clientUid='client-a')=>({clientUid,operationId:crypto.randomUUID(),mimeType:type==='photo'?'image/png':'audio/wav',data:type==='photo'?photo:audio,text:'Caption kept permanently'});

test('real Worker routes send/read photos and audio in both directions, with idempotent retry and tenant isolation',async()=>{
 const f=fixture();try{
  for(const [sender,receiver,type]of [['master','client-a','photo'],['client-a','master','audio'],['user-a','master','audio']]){
   const body=upload(type,sender==='user-a'?'user-a':'client-a');
   const response=await f.call(sender,'/support-media-send',body);assert.equal(response.status,200,await response.clone().text());
   const saved=await response.json();assert.equal(Date.parse(saved.expiresAt)-Date.now()>SUPPORT_MEDIA_TTL-5000,true);
   const read=await f.call(receiver,'/support-media-read',{id:saved.messageId});assert.equal(read.status,200,await read.clone().text());assert.equal((await read.json()).data,body.data);assert.equal(read.headers.get('cache-control'),'private, no-store');
   assert.equal((await f.call('client-b','/support-media-read',{id:saved.messageId})).status,403);
   assert.equal((await f.call(sender,'/support-media-send',body)).status,200);
  }
  assert.equal([...f.store.keys()].filter(key=>key.includes('/messages/')).length,3);
 }finally{f.restore();}
});
test('exact 24-hour expiry denies reads, cron deletes media bytes and keeps message text',async()=>{
 const f=fixture(),clock=Date.now;try{
  const response=await f.call('master','/support-media-send',upload());const saved=await response.json();
  Date.now=()=>Date.parse(saved.expiresAt);
  assert.equal((await f.call('client-a','/support-media-read',{id:saved.messageId})).status,410);
  await worker.scheduled({},f.env);
  assert.equal([...f.store.keys()].some(key=>key.startsWith('supportMedia/')),false);
  assert.equal(f.values(f.store.get('supportConversations/client-a/messages/'+saved.messageId)).text,'Caption kept permanently');
 }finally{Date.now=clock;f.restore();}
});
test('maximum-size audio is chunked, read without loss, and completely removed on expiry',async()=>{
 const f=fixture();try{
  const bytes=Buffer.alloc(2*1024*1024);bytes.write('RIFF');bytes.write('WAVE',8);
  const body={...upload('audio'),data:bytes.toString('base64')};
  const response=await f.call('client-a','/support-media-send',body);assert.equal(response.status,200,await response.clone().text());
  const saved=await response.json(),read=await f.call('master','/support-media-read',{id:saved.messageId});assert.equal((await read.json()).data,body.data);
  assert.equal([...f.store.keys()].filter(key=>key.includes('/chunks/')).length,15);
  await supportMedia.purgeExpired(f.env,Date.parse(saved.expiresAt));assert(![...f.store.keys()].some(key=>key.startsWith('supportMedia/')));
 }finally{f.restore();}
});
test('client-admin deletion purges all tenant threads, orphan threads and media chunks while another tenant stays intact',async()=>{
 const f=fixture();try{
  await f.call('master','/support-media-send',upload('photo','client-a'));
  await f.call('user-a','/support-media-send',upload('audio','user-a'));
  const other=await (await f.call('master','/support-media-send',upload('photo','client-b'))).json();
  f.put('supportConversations/orphan',{tenantId:'tenant-a',clientUid:'orphan'});f.put('supportConversations/orphan/messages/old',{tenantId:'tenant-a',text:'old text'});
  const response=await f.call('master','/delete-user',{uid:'client-a'});
  assert.equal(response.status,200,await response.clone().text());
  assert.equal([...f.store.values()].some(doc=>doc.name.includes('/supportConversations/')&&f.values(doc).tenantId==='tenant-a'),false);
  assert.equal([...f.store.values()].some(doc=>doc.name.includes('/supportMedia/')&&f.values(doc).tenantId==='tenant-a'),false);
  assert.equal([...f.store.keys()].filter(key=>key.startsWith('supportMedia/')).length,2,'only the other tenant metadata/chunk remain');
  assert.equal((await f.call('client-b','/support-media-read',{id:other.messageId})).status,200);
 }finally{f.restore();}
});
test('offboarding race fails atomically without leaving media or a chat message',async()=>{
 const f=fixture();try{
  f.beforeNextCommit(()=>f.put('tenants/tenant-a',{status:'offboarding',ownerUid:'client-a'}));
  const response=await f.call('master','/support-media-send',upload());assert.equal(response.status,409);
  assert.equal([...f.store.keys()].some(key=>key.startsWith('supportMedia/')||key.startsWith('supportConversations/')),false);
 }finally{f.restore();}
});
test('interrupted client deletion remains blocked and retries without retaining chat files',async()=>{
 const f=fixture();try{
  const saved=await(await f.call('master','/support-media-send',upload())).json();
  f.beforeNextCommit(()=>{throw Error('synthetic cleanup interruption');});
  assert.equal((await f.call('master','/delete-user',{uid:'client-a'})).status,500);
  assert(f.store.has('users/client-a'));assert(f.store.has('supportMedia/'+saved.messageId));
  assert.equal(f.values(f.store.get('tenants/tenant-a')).status,'offboarding');
  const retried=await f.call('master','/delete-user',{uid:'client-a'});assert.equal(retried.status,200,await retried.clone().text());
  assert(!f.store.has('users/client-a'));assert(!f.store.has('supportMedia/'+saved.messageId));
  assert(!f.store.has('supportConversations/client-a/messages/'+saved.messageId));
 }finally{f.restore();}
});
test('video, invalid MIME bytes and oversize uploads are rejected; cleanup failures retain data for retry',async()=>{
 const f=fixture();try{
  assert.equal((await f.call('master','/support-media-send',{...upload(),mimeType:'video/webm'})).status,400);
  assert.equal((await f.call('master','/support-media-send',{...upload(),data:btoa('not a photo at all')})).status,400);
  assert.equal((await f.call('master','/support-media-send',{...upload(),data:'A'.repeat(3000000)})).status,413);
  const saved=await(await f.call('master','/support-media-send',upload())).json();
  f.beforeNextCommit(()=>{throw Error('temporary storage failure');});
  await assert.rejects(supportMedia.purgeExpired(f.env,Date.parse(saved.expiresAt)),/storage failure/);
  assert(f.store.has('supportMedia/'+saved.messageId));
  await supportMedia.purgeExpired(f.env,Date.parse(saved.expiresAt));
  assert(!f.store.has('supportMedia/'+saved.messageId));
 }finally{f.restore();}
});
