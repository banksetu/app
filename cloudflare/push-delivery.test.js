import test from "node:test";
import assert from "node:assert/strict";
import {sendTenantPush,drainQueuedPush,deliverScheduledNotices,handleSyncPushEvent,purgeExpiredPushArtifacts} from "./worker.js";
import {setupPushFixture} from "./push-fixture.js";

const deviceId=index=>index.toString(16).padStart(8,"0")+"-1234-4abc-8def-123456789abc";
function recipients(fixture,count=100){
  fixture.put("tenants/tenant-a",{status:"active"});
  for(let index=1;index<=count;index++){
    fixture.put("users/user-"+index,{tenantId:"tenant-a",status:"approved",subscriptionStatus:"active"});
    fixture.put("pushDevices/"+deviceId(index),{uid:"user-"+index,tenantId:"tenant-a",token:("T"+index).padEnd(100,"A"),scopedData:true,expiresAt:new Date(Date.now()+86400000).toISOString()});
  }
}
test("FCM queue resumes all 100 recipients with fewer than 50 subrequests per invocation",async()=>{
 const f=setupPushFixture();try{
  recipients(f);f.put("customers/preserved",{accountNo:"00001234",photo:"existing-photo",pendingSync:true});const customer=JSON.stringify(f.store.get("customers/preserved"));
  let before=f.calls.length;await sendTenantPush(f.env,"tenant-a",{id:"event-batch",title:"License updated",body:"Open Bank Setu."});assert(f.calls.length-before<50);assert.equal(f.sent.length,8);
  while([...f.store.keys()].some(key=>key.startsWith("pendingPushEvents/"))){before=f.calls.length;await drainQueuedPush(f.env);assert(f.calls.length-before<50);}
  assert.equal(f.sent.length,100);assert.equal(new Set(f.sent.map(message=>message.token)).size,100);
  for(const message of f.sent){assert.deepEqual(message.notification,{title:"License updated",body:"Open Bank Setu."});assert.equal(message.data.tenantId,"tenant-a");assert(message.data.uid.startsWith("user-"));assert.equal(message.android.priority,"HIGH");assert.equal(message.android.notification.channel_id,"banksetu_license");}
  assert.equal(JSON.stringify(f.store.get("customers/preserved")),customer);
 }finally{f.restore();}
});
test("customer sync push uses one fixed cooldown document and contains no customer data",async()=>{
 const f=setupPushFixture();try{
  recipients(f,1);f.put("customers/preserved",{name:"Private customer",accountNo:"12345",pendingSync:true});const before=JSON.stringify(f.store.get("customers/preserved"));
  const actor={uid:"user-1",profile:{role:"client_admin",tenantId:"tenant-a"}};
  const call=id=>handleSyncPushEvent(new Request("https://worker.test/push-sync-event",{method:"POST",body:JSON.stringify({eventId:id,action:"saveCustomer"})}),f.env,actor);
  assert.equal((await call("11111111-1111-4111-8111-111111111111")).status,200);assert.equal(f.sent.length,1);
  assert.equal((await call("22222222-2222-4222-8222-222222222222")).status,200);assert.equal(f.sent.length,1);
  assert.equal([...f.store.keys()].filter(key=>key.startsWith("pushSyncSignals/")).length,1);
  assert.equal(f.sent[0].data.category,"sync");assert.equal(f.sent[0].notification.body,"Customer changes from another device are ready to sync.");
  assert(!JSON.stringify(f.sent[0]).includes("Private customer"));assert.equal(JSON.stringify(f.store.get("customers/preserved")),before);
 }finally{f.restore();}
});
test("expired push queue and dedupe claims are removed without touching customer data",async()=>{
 const f=setupPushFixture();try{
  const old=new Date(Date.now()-1000);f.put("pendingPushEvents/old",{expiresAt:old});f.put("pushEventClaims/old",{expiresAt:old});f.put("customers/keep",{pendingSync:true});
  await purgeExpiredPushArtifacts(f.env);assert.equal(f.store.has("pendingPushEvents/old"),false);assert.equal(f.store.has("pushEventClaims/old"),false);assert.equal(f.store.has("customers/keep"),true);
 }finally{f.restore();}
});
test("transient push failure stays queued and logout/account switch or tenant deletion blocks delivery",async()=>{
 const f=setupPushFixture();try{
  recipients(f,2);f.failNext();await sendTenantPush(f.env,"tenant-a",{id:"retry-event",title:"License updated",body:"Open Bank Setu."});assert.equal(f.sent.length,0);
  const pending=[...f.store.values()].find(doc=>doc.name.includes("/pendingPushEvents/"));assert.equal(f.values(pending).cursor,0);
  f.put("pushDevices/"+deviceId(1),{uid:"other",tenantId:"tenant-b",token:"B".repeat(100),scopedData:true,expiresAt:new Date(Date.now()+86400000).toISOString()});
  await drainQueuedPush(f.env);assert.equal(f.sent.length,1);assert.equal(f.sent[0].data.uid,"user-2");
  await sendTenantPush(f.env,"tenant-a",{id:"deletion-event",title:"License updated",body:"Open Bank Setu."});
  // Queue a transient retry, then revoke the tenant before the next server pass.
  f.failNext();await sendTenantPush(f.env,"tenant-a",{id:"pending-delete",title:"License updated",body:"Open Bank Setu."});const count=f.sent.length;
  f.put("tenants/tenant-a",{status:"offboarded"});await drainQueuedPush(f.env);assert.equal(f.sent.length,count);
 }finally{f.restore();}
});
test("scheduled sweep persists its cursor, detects scheduled activation and avoids duplicate events",async()=>{
 const f=setupPushFixture();try{
  recipients(f,1);f.put("tenants/tenant-b",{status:"active"});
  const began=new Date(Date.now()-60000).toISOString();
  f.put("tenantLicenses/tenant-a",{tenantId:"tenant-a",plan:"demo",status:"scheduled",activatedAt:began,expiresAt:new Date(Date.parse(began)+5*86400000).toISOString(),updatedAt:new Date(Date.now()-86400000).toISOString(),revision:1});
  f.put("tenantLicenses/tenant-b",{tenantId:"tenant-b",plan:"lifetime",status:"active",activatedAt:new Date(Date.now()-86400000).toISOString(),updatedAt:new Date(Date.now()-60000).toISOString(),revision:1});
  const before=f.calls.length;await deliverScheduledNotices(f.env);await drainQueuedPush(f.env);assert(f.calls.length-before<50);assert.equal(f.values(f.store.get("appSettings/pushSweep")).pageToken,"1");assert.equal(f.sent[0].data.eventId,"1:started");
  await deliverScheduledNotices(f.env);assert.equal(f.values(f.store.get("appSettings/pushSweep")).pageToken,"");
  await deliverScheduledNotices(f.env);await drainQueuedPush(f.env);assert.equal(f.sent.filter(message=>message.data.eventId==="1:started").length,1);assert.equal(f.sent.filter(message=>message.data.category==="update").length,1);
 }finally{f.restore();}
});
