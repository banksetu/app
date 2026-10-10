import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {indexedDB} from 'fake-indexeddb';
const compile = source => 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64');
globalThis.indexedDB=indexedDB;
const {indexedDbRepository: repository}=await import(compile(fs.readFileSync('src/platform/web/indexedDbRepository.ts','utf8')));
const storage=new Map();globalThis.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
globalThis.window=new EventTarget();globalThis.__auth={currentUser:{uid:'user-a',getIdToken:async()=> 'fresh-firebase-token'}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});
let handler=async()=>{throw new Error('offline');};
let protectionOverride;
let protectionCalls=0;
let inventoryOverride,inventoryCalls=0;
globalThis.fetch=async(...args)=>{
 const body=args[1]?.body?JSON.parse(args[1].body):{};
 if(body.action==='getPhotoPresence'){inventoryCalls++;return new Response(JSON.stringify({success:true,complete:true,connectionId:storage.get('bankSetuConnectionId'),customerIds:inventoryOverride||[]}));}
 if(body.action==='getSyncProtection'){
   protectionCalls++;
   const connectionId=storage.get('bankSetuConnectionId');
   const scope=`${globalThis.__auth.currentUser.uid}:${storage.get('bankSetuMasterLocalEnabled')==='true'?`master:${globalThis.__auth.currentUser.uid}`:storage.get('bankSetuTenantId')}:${connectionId}`;
   const state=await repository.read(scope);
   return new Response(JSON.stringify(protectionOverride||{success:true,protectionVersion:1,connectionId,resetId:'',activeIds:state.records.filter(r=>r.revision).map(r=>r.recordId),deletedIds:[]}));
 }
 return handler(...args);
};
globalThis.__repository=repository;
let source=fs.readFileSync('src/core/localData.ts','utf8').replace('import { isAndroid, shareAndroidBackup } from "../platform/android/runtime";','const isAndroid=()=>false;const shareAndroidBackup=async()=>{};').replace('import { auth } from "../firebase";','const auth=globalThis.__auth;').replace('import { customerRepository as repository } from "./customerRepository";','const repository=globalThis.__repository;');
globalThis.__backup=await import(compile(fs.readFileSync("src/core/backup.ts","utf8")));
source=source.replace('import { makeBackup, parseBackup, mergeBackup } from "./backup";','const {makeBackup,parseBackup,mergeBackup}=globalThis.__backup;');
const engine=await import(compile(source));
function connect(id='connection-a') {storage.set('bankSetuOfflineUntil',String(Date.now()+3600000));storage.set('bankSetuTenantId','tenant-a');storage.set('bankSetuConnectionId',id);storage.set('bankSetuConnectionMode','option-b');storage.set('bankSetuWorkspaceReady','true');storage.set('bankSetuBridgeUrl','https://script.google.com/macros/s/bridge/exec');storage.set('bankSetuAccountRole','client_admin');}
const customer={name:'Alice',accountNo:'1001',enrolId:'C001',uidaiNo:'123456789012'};
const request=body=>engine.localDataFetch('https://script.google.com/macros/s/bridge/exec',{method:'POST',body:JSON.stringify({...body,idToken:'never-store-this'})}).then(response=>response.json());
const tenantApiSource=fs.readFileSync('src/tenantApi.ts','utf8').replace('import { getAuth } from "firebase/auth";','const getAuth=()=>globalThis.__auth;');
const {getCustomerSearchApiUrl,getTenantApiUrl}=await import(compile(tenantApiSource));
test('stale cached bridge URL still searches verified local workspace first and uses only its bound bridge for cloud fallback',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('search-bridge');navigator.onLine=false;
 const saved=await request({action:'saveCustomer',customer:{...customer,name:'Bridge Cached',accountNo:'00045',enrolId:'BRIDGE-1'}});assert(saved.success);
 const verified=storage.get('bankSetuBridgeUrl');
 // Simulate an Android tenant cache left behind by the previous bridge deployment.
 globalThis.localStorage={getItem:()=> 'https://script.google.com/macros/s/old-bridge/exec'};
 assert.equal(getCustomerSearchApiUrl(true),verified);
 assert.equal(getTenantApiUrl(),verified);
 let calls=0;navigator.onLine=true;
 handler=async(url,init)=>{calls++;assert.equal(String(url),verified);assert.equal(JSON.parse(init.body).action,'searchCustomer');return new Response(JSON.stringify({success:true,customer:{recordId:'remote-1',revision:'r1',rowNumber:12,name:'Remote Match',enrolId:'REMOTE-1',accountNo:'0099'},rowNumber:12}));};
 const local=await engine.localDataFetch(getCustomerSearchApiUrl(true),{method:'POST',body:JSON.stringify({action:'searchCustomer',query:'Bridge Cached'})}).then(response=>response.json());
 assert.equal(local.customer.recordId,saved.recordId);assert.equal(calls,0);
 const remote=await engine.localDataFetch(getCustomerSearchApiUrl(true),{method:'POST',body:JSON.stringify({action:'searchCustomer',query:'Remote Match'})}).then(response=>response.json());
 assert.equal(remote.customer.name,'Remote Match');assert.equal(calls,1);
 const stale=await engine.localDataFetch('https://script.google.com/macros/s/old-bridge/exec',{method:'POST',body:JSON.stringify({action:'searchCustomer',query:'Bridge Cached',idToken:'token'})}).then(response=>response.json());
 assert.equal(stale.customer.recordId,saved.recordId);
 assert.equal(calls,1,'stale bridge never receives customer request');
 const fallback=await engine.localDataFetch('https://script.google.com/macros/s/old-bridge/exec',{method:'POST',body:JSON.stringify({action:'searchCustomer',query:'unseen cloud match'})}).then(response=>response.json());
 assert.equal(fallback.customer.name,'Remote Match');assert.equal(calls,2,'cloud fallback uses the verified bridge');
 navigator.onLine=false;storage.set('bankSetuTenantId','another-tenant');
 const other=await engine.localDataFetch(getCustomerSearchApiUrl(true),{method:'POST',body:JSON.stringify({action:'searchCustomer',query:'Bridge Cached'})}).then(response=>response.json());
 assert.equal(other.success,false,'other tenant cannot read cached customer');
 storage.set('bankSetuWorkspaceReady','false');assert.equal(getCustomerSearchApiUrl(true),'');
});
test('IndexedDB persists customer and queue in one atomic transaction and rolls back failed changes',async()=>{
 await repository.transact('atomic',state=>{state.records.push({recordId:'kept'});state.operations.push({operationId:'kept'});});
 await assert.rejects(repository.transact('atomic',state=>{state.records.push({recordId:'lost'});throw Error('abort');}));
 const state=await repository.read('atomic');assert.equal(state.records.length,1);assert.equal(state.operations.length,1);
});
test('offline save, search, retry, connection isolation and explicit conflict review',async()=>{
 connect();const saved=await request({action:'saveCustomer',customer});assert(saved.success&&saved.queued);
 let state=await repository.read('user-a:tenant-a:connection-a');assert.equal(state.records.length,1);assert.equal(state.operations.length,1);assert(!JSON.stringify(state).includes('never-store-this'));
 const search=await request({action:'searchCustomer',query:'alice'});assert.equal(search.customer.name,'Alice');assert.equal(search.customer.recordId,saved.recordId);
 connect('connection-b');const miss=await request({action:'searchCustomer',query:'alice'});assert.equal(miss.success,false);assert.equal((await repository.read('user-a:tenant-a:connection-a')).operations.length,1);
 connect();navigator.onLine=true;let sent=[];
 handler=async(_url,init)=>{const body=JSON.parse(init.body);sent.push(body);throw Error('timeout after cloud commit');};
 await assert.rejects(engine.syncNow());assert.equal((await repository.read('user-a:tenant-a:connection-a')).operations.length,1);
 const originalId=sent[0].operation.operationId;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){sent.push(body);return new Response(JSON.stringify({success:true,rowNumber:9,revision:'r1',customer:{...customer,recordId:saved.recordId,revision:'r1',rowNumber:9}}));}return new Response(JSON.stringify({success:true,customers:[{...customer,recordId:saved.recordId,revision:'r1',rowNumber:9}],hasNextPage:false,nextCursor:1}));};
 await engine.syncNow();assert.equal(sent.at(-1).operation.operationId,originalId);state=await repository.read('user-a:tenant-a:connection-a');assert.equal(state.operations.length,0);assert.equal(state.records[0].rowNumber,9);
 navigator.onLine=false;await request({action:'updateCustomer',rowNumber:9,customer:{...customer,name:'Local edit'}});navigator.onLine=true;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);return new Response(JSON.stringify(body.action==='syncCustomerOperation'?{success:false,code:'CONFLICT',message:'Changed remotely',customer:{...customer,name:'Cloud edit',recordId:saved.recordId,revision:'r2',rowNumber:4}}:{success:true,customers:[{...customer,name:'Cloud edit',recordId:saved.recordId,revision:'r2',rowNumber:4}],hasNextPage:false,nextCursor:1}));};
 await engine.syncNow();const conflicts=await engine.getConflicts();assert.equal(conflicts[0].remoteCustomer.name,'Cloud edit');assert.equal((await repository.read('user-a:tenant-a:connection-a')).records[0].customer.name,'Local edit');
 storage.set('bankSetuAccountRole','client_user');await assert.rejects(engine.resolveConflict(conflicts[0].operationId,'local'),/Admin/);storage.set('bankSetuAccountRole','client_admin');
 await engine.resolveConflict(conflicts[0].operationId,'cloud');state=await repository.read('user-a:tenant-a:connection-a');assert.equal(state.operations.length,0);assert.equal(state.records[0].customer.name,'Cloud edit');assert.equal(state.records[0].rowNumber,4);
});

test('session-only pause resumes manually and every local customer change auto-resumes without losing its queue',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('pause-device');navigator.onLine=false;
 engine.pauseSync();assert.equal(engine.isSyncPaused(),true);assert.equal((await engine.getLocalStatus()).paused,true);
 engine.resumeSync();assert.equal(engine.isSyncPaused(),false);
 engine.pauseSync();const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'PAUSE-1',accountNo:'8101'}});
 assert(saved.queued);assert.equal(engine.isSyncPaused(),false,'a local add automatically resumes sync');
 let state=await repository.read('user-a:tenant-a:pause-device');assert.equal(state.operations.length,1);
 await repository.transact('user-a:tenant-a:pause-device',current=>{current.operations=[];current.records[0].pending=false;current.records[0].revision='r1';current.records[0].customer.uidaiNo='';});
 engine.pauseSync();const status=await request({action:'updateCustomer',rowNumber:saved.rowNumber,statusOnly:true,statusField:'status',statusValue:'Active',customer:{name:'must not overwrite'}});
 assert(status.success&&status.queued);assert.equal(engine.isSyncPaused(),false,'a status change automatically resumes sync');
 state=await repository.read('user-a:tenant-a:pause-device');assert.equal(state.records[0].customer.name,'Alice');assert.equal(state.records[0].customer.status,'Active');assert.deepEqual(state.operations[0].customer,{status:'Active'});
});

test('rapid duplicate saves and simultaneous status changes retain one identity and all fields',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('rapid-device');navigator.onLine=false;
 const first={...customer,enrolId:'RAPID-1',accountNo:'9811001'};
 const results=await Promise.allSettled(Array.from({length:5},()=>request({action:'saveCustomer',customer:first})));
 assert.equal(results.filter(result=>result.status==='fulfilled'&&result.value.success).length,1);
 const scope='user-a:tenant-a:rapid-device';let state=await repository.read(scope);
 assert.equal(state.records.length,1);assert.equal(state.operations.length,1);
 await repository.transact(scope,current=>{current.records[0].revision='cloud-v1';current.records[0].pending=false;current.operations=[];current.records[0].customer.uidaiNo='';});
 const rowNumber=state.records[0].rowNumber;
 const updates=await Promise.allSettled([
   request({action:'updateCustomer',rowNumber,statusOnly:true,statusField:'status',statusValue:'Active'}),
   request({action:'updateCustomer',rowNumber,statusOnly:true,statusField:'passbookStatus',statusValue:'Printed'})
 ]);
 assert.equal(updates.filter(result=>result.status==='fulfilled'&&result.value.success).length,1);
 state=await repository.read(scope);assert.equal(state.records[0].customer.name,first.name);assert.equal(state.records[0].customer.uidaiNo,'');assert.equal(state.operations.length,1);
});

test('Master local-first save/search/sync stays outside client scope and retains original connection',async()=>{
 const clientBefore=await repository.read('user-a:tenant-a:connection-a');
 globalThis.__auth.currentUser={uid:'master-user',getIdToken:async()=> 'master-token'};
 storage.clear();storage.set('bankSetuAccountRole','master_owner');storage.set('bankSetuMasterLocalEnabled','true');storage.set('bankSetuConnectionMode','master-local');storage.set('bankSetuConnectionId','master-existing-sheet');storage.set('bankSetuBridgeUrl','https://script.google.com/macros/s/bridge/exec');storage.set('bankSetuWorkspaceReady','true');storage.set('bankSetuOfflineUntil',String(Date.now()+3600000));navigator.onLine=false;
 const result=await request({action:'saveCustomer',customer:{name:'Master customer',accountNo:'9876543210',enrolId:'M001',uidaiNo:'123456789012'}});assert(result.queued);
 const scope='master-user:master:master-user:master-existing-sheet';let state=await repository.read(scope);assert.equal(state.operations.length,1);const recordId=state.records[0].recordId;
 assert.equal((await request({action:'searchCustomer',query:'Master customer'})).customer.name,'Master customer');assert.deepEqual(await repository.read('user-a:tenant-a:connection-a'),clientBefore);
 navigator.onLine=true;let writes=0;handler=async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.masterLocalSync,true);if(body.action==='syncCustomerOperation'){writes++;assert.equal(body.connectionId,'master-existing-sheet');return new Response(JSON.stringify({success:true,rowNumber:2,revision:'r1',customer:{...body.operation.customer,recordId,revision:'r1'}}));}return new Response(JSON.stringify({success:true,customers:[{...state.records[0].customer,recordId,revision:'r1',rowNumber:2}],hasNextPage:false}));};
 await engine.syncNow();state=await repository.read(scope);assert.equal(state.operations.length,0);assert.equal(writes,1);await engine.syncNow();assert.equal(writes,1);assert.deepEqual(await repository.read('user-a:tenant-a:connection-a'),clientBefore);
 storage.set('bankSetuConnectionId','master-replacement');navigator.onLine=false;assert.equal((await request({action:'searchCustomer',query:'Master customer'})).success,false);
});

test('fresh installation downloads every page automatically, hydrates photos and searches locally',async()=>{
 globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};storage.clear();connect('fresh-device');navigator.onLine=true;
 globalThis.document=new EventTarget();document.visibilityState='visible';
 const records=Array.from({length:1251},(_,i)=>({recordId:'cloud-'+i,rowNumber:i+2,revision:'v1',name:'Existing '+i,accountNo:String(i),...(i===0?{photoUrl:'drive-photo'}:{})}));
 const calls=[];
 handler=async(_url,init)=>{const body=JSON.parse(init.body);calls.push(body.action);assert.equal(body.connectionId,'fresh-device');
 if(body.action==='getCustomerByRowNumber')return new Response(JSON.stringify({success:true,customer:{...records[0],photoPreview:'data:image/png;base64,cGhvdG8='},rowNumber:2}));
 assert.equal(body.action,'getCustomerPage');const end=Math.min(body.cursor+250,records.length);return new Response(JSON.stringify({success:true,customers:records.slice(body.cursor,end),nextCursor:end,hasNextPage:end<records.length}));};
 // Mount before workspace verification completes, then wake when it becomes ready.
 storage.delete('bankSetuWorkspaceReady');const stop=engine.startLocalSync();
 try{
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls.length,0);
 storage.set('bankSetuWorkspaceReady','true');window.dispatchEvent(new Event('banksetu-workspace-change'));
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){const status=await engine.getLocalStatus();if(status.lastCompletedAt&&status.mediaPending===0&&!status.syncing)break;await new Promise(resolve=>setTimeout(resolve,50));}
 const state=await repository.read('user-a:tenant-a:fresh-device');assert.equal(state.records.length,1251);assert(state.pull.lastCompletedAt);assert.match(state.records.find(record=>record.recordId==='cloud-0').customer.photoPreview,/data:image/);
 assert.equal((await engine.getActiveLocalCustomers()).length,1251);
 assert.equal((await engine.getLocalStatus()).records,1251);
 const before=calls.length;const hit=await request({action:'searchCustomer',query:'Existing 0'});assert.equal(hit.local,true);assert.equal(calls.length,before,'local hits never await Google');
 navigator.onLine=false;assert.equal((await request({action:'searchCustomer',query:'Existing 1250'})).customer.name,'Existing 1250');
 }finally{stop();}
});

test('10,000 generated customers import through durable 250-row pages, including a 3,000-row restart checkpoint',async()=>{
 globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};storage.clear();connect('bulk-device');navigator.onLine=true;
 const scope='user-a:tenant-a:bulk-device';
 const rows=Array.from({length:10000},(_,i)=>({recordId:`bulk-${i}`,rowNumber:i+2,revision:'v1',name:`Customer ${i}`,accountNo:`B${i}`,photoUrl:'',photoAvailable:false}));
 let failed=false,pages=0;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.action,'getCustomerPage');assert.equal(body.pageSize,250);
   if(body.cursor===3000&&!failed){failed=true;throw Error('Synthetic connection loss');}
   pages++;const end=Math.min(body.cursor+250,rows.length);
   return new Response(JSON.stringify({success:true,customers:rows.slice(body.cursor,end),nextCursor:end,hasNextPage:end<rows.length}));
 };
 for(let i=0;i<3;i++)await engine.syncNow(true);
 let state=await repository.read(scope);assert.equal(state.records.length,3000);assert.equal(state.pull.cursor,3000);
 await assert.rejects(engine.syncNow(true),/Synthetic connection loss/);
 state=await repository.read(scope);assert.equal(state.records.length,3000);assert.equal(state.pull.cursor,3000);
 for(let i=0;i<7;i++)await engine.syncNow(true);
 state=await repository.read(scope);assert.equal(state.records.length,10000);assert.equal(new Set(state.records.map(record=>record.recordId)).size,10000);
 assert.equal(state.pull.cursor,0);assert(state.pull.lastCompletedAt);assert.equal(state.operations.length,0);assert.equal(pages,40);
});

test('oversized Google pages shrink with a durable cursor and resume without duplicate customers',async()=>{
 globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};storage.clear();connect('adaptive-device');navigator.onLine=true;
 const scope='user-a:tenant-a:adaptive-device';
 const rows=Array.from({length:130},(_,i)=>({recordId:`adaptive-${i}`,rowNumber:i+2,revision:'r1',name:`Adaptive ${i}`,photoAvailable:false,photoUrl:''}));
 const sizes=[];let lost=false;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.action,'getCustomerPage');sizes.push(body.pageSize);
   if(body.pageSize>40)return new Response('too large',{status:413});
   if(body.cursor>0&&!lost){lost=true;throw Error('Connection interrupted after first page');}
   const end=Math.min(body.cursor+body.pageSize,rows.length);
   return new Response(JSON.stringify({success:true,customers:rows.slice(body.cursor,end),nextCursor:end,hasNextPage:end<rows.length}));
 };
 for(let i=0;i<3;i++)await engine.syncNow(true);
 let state=await repository.read(scope);assert.deepEqual(sizes.slice(0,3),[250,125,62]);assert.equal(state.pull.pageSize,31);assert.equal(state.records.length,0);
 await assert.rejects(engine.syncNow(true),/Connection interrupted/);
 state=await repository.read(scope);assert.equal(state.pull.cursor,31);assert.equal(state.records.length,31);
 await engine.syncNow(true);state=await repository.read(scope);
 assert.equal(state.records.length,130);assert.equal(new Set(state.records.map(record=>record.recordId)).size,130);
 assert.equal(state.pull.pageSize,31);assert.equal(state.pull.cursor,0);
});

test('interrupted download resumes its cursor, exposes error and never overwrites a pending local edit',async()=>{
 connect('resume-device');navigator.onLine=true;const scope='user-a:tenant-a:resume-device';
 await repository.transact(scope,state=>state.records.push({key:'edit',recordId:'edit',scope,rowNumber:2,revision:'old',customer:{name:'Unsynced edit'},pending:true}));
 let fail=true;const cursors=[];
 handler=async(_url,init)=>{const body=JSON.parse(init.body);cursors.push(body.cursor);if(body.cursor===250&&fail)throw Error('Network interrupted');return new Response(JSON.stringify({success:true,customers:body.cursor===0?[{recordId:'edit',name:'Cloud old',rowNumber:2},{recordId:'older',name:'Older',rowNumber:3}]:[{recordId:'last',name:'Last',rowNumber:4}],hasNextPage:body.cursor===0,nextCursor:body.cursor===0?250:251}));};
 await assert.rejects(engine.syncNow(),/Network interrupted/);assert.match((await engine.getLocalStatus()).error,/Network interrupted/);assert.equal((await repository.read(scope)).pull.cursor,250);
 fail=false;await engine.syncNow();const state=await repository.read(scope);assert.equal(cursors.at(-1),250);assert.equal(state.records.find(r=>r.recordId==='edit').customer.name,'Unsynced edit');assert.equal(state.records.find(r=>r.recordId==='older').deleted,undefined);assert.equal((await engine.getLocalStatus()).error,'');
});

test('shared recovery backs off, reconnects immediately, retains queued identity and exposes real activity',async()=>{
 connect('health-engine');navigator.onLine=false;globalThis.document=new EventTarget();document.visibilityState='visible';
 const saved=await request({action:'saveCustomer',customer});const scope='user-a:tenant-a:health-engine';const original=(await repository.read(scope)).operations[0].operationId;
 const nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;
 const timers=new Map();let id=0;globalThis.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay});return id};globalThis.clearTimeout=key=>timers.delete(key);
 let healthy=false,attempts=0,recoveries=0;const activity=[];
 const changed=()=>{void engine.getLocalStatus().then(status=>activity.push(status.syncing))};window.addEventListener('banksetu-sync-change',changed);
 engine.configureConnectionRecovery(async()=>{recoveries++});
 handler=async(_url,init)=>{if(!init?.body)return new Response('{}');const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){attempts++;assert.equal(body.operation.operationId,original);if(!healthy)throw Error('Backend unavailable');return new Response(JSON.stringify({success:true,rowNumber:2,revision:'r1',customer:{...customer,recordId:saved.recordId,rowNumber:2,photoPreview:'data:image/png;base64,eA=='}}));}return new Response(JSON.stringify({success:true,customers:[{...customer,recordId:saved.recordId,rowNumber:2,revision:'r1',photoPreview:'data:image/png;base64,eA=='}],hasNextPage:false}));};
 const settle=async()=>{for(let i=0;i<40;i++)await new Promise(resolve=>setImmediate(resolve));};
 navigator.onLine=true;const stop=engine.startLocalSync();
 try{
 await settle();assert.equal(attempts,1);assert([...timers.values()].some(t=>t.delay>=4000&&t.delay<=6000));assert.equal((await repository.read(scope)).operations[0].state,'pending');assert.equal((await engine.getLocalStatus()).syncing,false);
 const retry=[...timers.values()].find(t=>t.delay>=4000&&t.delay<=6000);retry.fn();await settle();assert.equal(attempts,2);assert([...timers.values()].some(t=>t.delay>=8000&&t.delay<=12000));
 healthy=true;navigator.onLine=false;window.dispatchEvent(new Event('offline'));navigator.onLine=true;window.dispatchEvent(new Event('online'));await settle();assert.equal(attempts,3);assert.equal((await repository.read(scope)).operations.length,0);assert(activity.includes(true));assert.equal(activity.at(-1),false);assert(recoveries>=2);
 const before=attempts;document.visibilityState='visible';window.dispatchEvent(new Event('focus'));await settle();assert.equal(attempts,before,'focus does not poll an already healthy connection');
 }finally{stop();engine.configureConnectionRecovery(undefined);window.removeEventListener('banksetu-sync-change',changed);globalThis.setTimeout=nativeTimeout;globalThis.clearTimeout=nativeClear;}
});

test('foreground resume immediately reconciles queued work through the shared engine',async()=>{
 connect('resume-on-return');navigator.onLine=false;globalThis.document=new EventTarget();document.visibilityState='hidden';
 const saved=await request({action:'saveCustomer',customer});const scope='user-a:tenant-a:resume-on-return';
 let writes=0,recoveries=0;
 engine.configureConnectionRecovery(async()=>{recoveries++;});
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){writes++;return new Response(JSON.stringify({success:true,rowNumber:8,revision:'r1',customer:{...customer,recordId:saved.recordId,rowNumber:8,revision:'r1'}}));}return new Response(JSON.stringify({success:true,customers:[{...customer,recordId:saved.recordId,rowNumber:8,revision:'r1'}],hasNextPage:false}));};
 const stop=engine.startLocalSync();
 try{
   await new Promise(resolve=>setTimeout(resolve,10));assert.equal(writes,0);
   document.visibilityState='visible';navigator.onLine=true;document.dispatchEvent(new Event('visibilitychange'));
   const deadline=Date.now()+3000;while(Date.now()<deadline&&(await repository.read(scope)).operations.length)await new Promise(resolve=>setTimeout(resolve,10));
   assert.equal((await repository.read(scope)).operations.length,0);assert.equal(writes,1);assert.equal(recoveries,1);
 }finally{stop();engine.configureConnectionRecovery(undefined);}
});

test('manual header refresh forces reconciliation through the same engine state',async()=>{
 connect('header-refresh');navigator.onLine=true;globalThis.document=new EventTarget();document.visibilityState='visible';
 let pulls=0;handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='getCustomerPage')pulls++;return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false}));};
 const stop=engine.startLocalSync();
 try{
   const deadline=Date.now()+3000;while(Date.now()<deadline&&!pulls)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(pulls,1);
   window.dispatchEvent(new CustomEvent('banksetu-sync-request',{detail:{refresh:true}}));
   while(Date.now()<deadline+3000&&pulls<2)await new Promise(resolve=>setTimeout(resolve,10));
   assert.equal(pulls,2);
 }finally{stop();}
});

test('idle workspace makes one hourly reconciliation, no focus pull, and manual sync bypasses the interval',async()=>{
 storage.clear();connect('hourly-idle');navigator.onLine=true;globalThis.document=new EventTarget();document.visibilityState='visible';
 const previousUser=globalThis.__auth.currentUser,originalNow=Date.now,originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 let now=1800000000000,tokens=0,worker=0,pages=0,nextId=0;protectionCalls=0;
 Date.now=()=>now;globalThis.__auth.currentUser={uid:'user-a',getIdToken:async(force)=>{assert(!force);tokens++;return 'cached-token';}};
 const timers=new Map();globalThis.setTimeout=(fn,delay)=>{const id=++nextId;timers.set(id,{fn,delay});return id;};globalThis.clearTimeout=id=>timers.delete(id);
 engine.configureConnectionRecovery(async()=>{worker++;});
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='getCustomerPage'){pages++;return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false}));}throw Error(`Unexpected ${body.action}`);};
 // getSyncProtection is intercepted by the fixture fetch wrapper.
 const settle=async()=>{for(let i=0;i<50;i++)await new Promise(resolve=>setImmediate(resolve));};
 const stop=engine.startLocalSync();
 try{
   await settle();assert.equal(pages,1);assert.equal(protectionCalls,1);assert.equal(worker,1);assert.equal(tokens,2);
   let state=await repository.read('user-a:tenant-a:hourly-idle');assert.equal(state.pull.lastCompletedAt,now);
   for(let i=0;i<2;i++){const fast=[...timers.values()].find(timer=>timer.delay===250);if(!fast)break;now+=250;fast.fn();await settle();}
   now+=30*60000;window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));await settle();
   assert.equal(pages,1);assert.equal(protectionCalls,1);assert.equal(worker,1);assert.equal(tokens,2);
   const due=[...timers.values()].find(timer=>timer.delay>=29*60000&&timer.delay<=30*60000);assert(due,JSON.stringify([...timers.values()].map(timer=>timer.delay)));now+=due.delay;due.fn();await settle();
   assert.equal(pages,2);assert.equal(protectionCalls,2);assert.equal(worker,2);assert.equal(tokens,4);
   await engine.syncNow(true);assert.equal(pages,3);assert.equal(protectionCalls,3);assert.equal(tokens,6);
   state=await repository.read('user-a:tenant-a:hourly-idle');assert.equal(state.pull.lastCompletedAt,now);
 }finally{stop();engine.configureConnectionRecovery(undefined);Date.now=originalNow;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;globalThis.__auth.currentUser=previousUser;}
});

test('permanent rejected upload remains reviewable without a fast retry loop',async()=>{
 storage.clear();connect('permanent-upload');navigator.onLine=false;
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'INVALID-1',accountNo:'91001'}});assert(saved.queued);
 navigator.onLine=true;let writes=0;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){
   writes++;return new Response(JSON.stringify({success:false,code:'INVALID_INPUT',message:'Invalid customer field.'}));
 }return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false}));};
 await engine.syncNow(true);
 const scope='user-a:tenant-a:permanent-upload';const state=await repository.read(scope);
 assert.equal(state.operations.length,1);assert.equal(state.operations[0].state,'failed');assert.equal(state.operations[0].recordId,saved.recordId);
 await engine.syncNow(false);assert.equal(writes,1);assert.equal((await engine.getLocalStatus()).conflicts,1);
});

test('authentication recovery refreshes the Firebase token at most once and retains unsent work',async()=>{
 storage.clear();connect('auth-recovery');navigator.onLine=false;const previous=globalThis.__auth.currentUser;
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'AUTH-1',accountNo:'91002'}});assert(saved.queued);
 let forced=0,attempts=0;globalThis.__auth.currentUser={uid:'user-a',getIdToken:async(force)=>{if(force)forced++;return force?'renewed':'cached';}};
 navigator.onLine=true;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){
   attempts++;return attempts===1?new Response('',{status:401}):new Response(JSON.stringify({success:false,code:'AUTH_REQUIRED'}));
 }return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false}));};
 try{await assert.rejects(engine.syncNow(true),/authentication needs attention/);assert.equal(attempts,2);assert.equal(forced,1);
   const state=await repository.read('user-a:tenant-a:auth-recovery');assert.equal(state.operations[0].state,'pending');assert.equal(state.operations[0].recordId,saved.recordId);
 }finally{globalThis.__auth.currentUser=previous;}
});

test('HTTP 429 Retry-After delays the next upload and keeps its operation identity',async()=>{
 storage.clear();connect('rate-limit');navigator.onLine=false;globalThis.document=new EventTarget();document.visibilityState='visible';
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'RATE-1',accountNo:'91003'}});
 const scope='user-a:tenant-a:rate-limit',id=(await repository.read(scope)).operations[0].operationId;
 const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout,timers=new Map();let nextId=0,attempts=0;
 globalThis.setTimeout=(fn,delay)=>{const key=++nextId;timers.set(key,{fn,delay});return key};globalThis.clearTimeout=key=>timers.delete(key);
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){
   attempts++;assert.equal(body.operation.operationId,id);
   if(attempts===1)return new Response('',{status:429,headers:{'Retry-After':'120'}});
   return new Response(JSON.stringify({success:true,rowNumber:2,revision:'r1',customer:{...customer,recordId:saved.recordId,rowNumber:2,revision:'r1'}}));
 }return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false}));};
 navigator.onLine=true;const settle=async()=>{for(let i=0;i<40;i++)await new Promise(resolve=>setImmediate(resolve));};const stop=engine.startLocalSync();
 try{
   await settle();assert.equal(attempts,1);assert.equal((await repository.read(scope)).operations[0].state,'pending');
   const retry=[...timers.values()].find(timer=>timer.delay>=120000);assert(retry);
   retry.fn();await settle();assert.equal(attempts,2);assert.equal((await repository.read(scope)).operations.length,0);
 }finally{stop();globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;}
});

test('stopping the lifecycle engine aborts active cloud work and preserves its queue',async()=>{
 connect('stop-cleanly');navigator.onLine=false;const saved=await request({action:'saveCustomer',customer});const scope='user-a:tenant-a:stop-cleanly';
 navigator.onLine=true;globalThis.document=new EventTarget();document.visibilityState='visible';engine.configureConnectionRecovery(async()=>{});
 let observedSignal;let resolveStarted;const started=new Promise(resolve=>{resolveStarted=resolve;});
 handler=(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){observedSignal=init.signal;resolveStarted();return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));}return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false}));};
 const stop=engine.startLocalSync();
 try{await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(new Error('sync did not start')),3000))]);stop();assert.equal(observedSignal.aborted,true);await new Promise(resolve=>setTimeout(resolve,10));assert.equal((await repository.read(scope)).operations[0].state,'pending');assert.equal((await repository.read(scope)).records[0].recordId,saved.recordId);}
 finally{stop();engine.configureConnectionRecovery(undefined);}
});

test('online entry survives auth refresh failure; cloud fallback caches customers for later local search',async()=>{
 connect('fast-entry');navigator.onLine=true;const user=globalThis.__auth.currentUser;const token=user.getIdToken;user.getIdToken=async()=>{throw Error('refresh unavailable')};
 try{assert.equal(await engine.getDataIdToken(),'');const saved=await request({action:'saveCustomer',customer});assert(saved.queued);assert.equal((await repository.read('user-a:tenant-a:fast-entry')).operations.length,1);}finally{user.getIdToken=token;}
 connect('fallback');let reads=0;
 handler=async()=>{reads++;return new Response(JSON.stringify({success:true,rowNumber:2,customer:{recordId:'found',name:'Cloud customer',revision:'r1'}}));};
 await request({action:'searchCustomer',query:'Cloud customer'});assert.equal(reads,1);assert.equal((await request({action:'searchCustomer',query:'Cloud customer'})).local,true);assert.equal(reads,1);
});

test('customer delete stays local first, syncs immediately on reconnect, and never crosses a tenant scope',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'fresh-firebase-token'};
 connect('delete-a');navigator.onLine=false;
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'DELETE-1',accountNo:'9901'}});
 const deleted=await request({action:'deleteCustomer',rowNumber:saved.rowNumber});
 assert.equal(deleted.success,false);assert.equal(deleted.deleted,true);assert.equal(deleted.queued,true);
 assert.equal((await request({action:'searchCustomer',query:'DELETE-1'})).success,false);
 let state=await repository.read('user-a:tenant-a:delete-a');assert.equal(state.operations.length,2);
 connect('delete-other');assert.equal((await request({action:'searchCustomer',query:'DELETE-1'})).success,false);
 connect('delete-a');navigator.onLine=true;let actions=[];
 handler=async(_url,init)=>{const body=JSON.parse(init.body);actions.push(body.action);
   if(body.action==='syncCustomerOperation')return new Response(JSON.stringify({
     success:true,rowNumber:9,revision:body.operation.action==='deleteCustomer'?'r2':'r1',
     deleted:body.operation.action==='deleteCustomer',driveDeleted:body.operation.action==='deleteCustomer',rowDeleted:body.operation.action==='deleteCustomer',
     customer:{...customer,recordId:saved.recordId,rowNumber:9,revision:'r2'}}));
   return new Response(JSON.stringify({success:true,customers:[],deletedIds:[saved.recordId],hasNextPage:false,nextCursor:1}));
 };
 await engine.syncNow(false);
 state=await repository.read('user-a:tenant-a:delete-a');assert.equal(state.operations.length,0);assert.equal(state.records[0].deleted,true);
 assert.equal((await engine.getActiveLocalCustomers()).length,0);
 assert.equal(actions.filter(item=>item==='syncCustomerOperation').length,2);
 assert.equal((await repository.read('user-a:tenant-a:delete-other')).records.length,0);
 navigator.onLine=false;const second=await request({action:'saveCustomer',customer:{...customer,enrolId:'DELETE-2',accountNo:'9902'}});
 await request({action:'deleteCustomer',rowNumber:second.rowNumber});navigator.onLine=true;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);return new Response(JSON.stringify(body.action==='syncCustomerOperation'?
   {success:true,rowNumber:10,revision:'r3',deleted:body.operation.action==='deleteCustomer',customer:{...customer,recordId:second.recordId,rowNumber:10,revision:'r3'}}:
   {success:true,customers:[],hasNextPage:false,nextCursor:1}));};
 await assert.rejects(engine.syncNow(false),/row and Drive deletion are not confirmed/);
 state=await repository.read('user-a:tenant-a:delete-a');assert(state.operations.some(op=>op.action==='deleteCustomer'&&op.state==='pending'));
 assert.equal(state.records.find(record=>record.recordId===second.recordId).deleted,true);
 navigator.onLine=false;
});

test('dashboard and list share active scoped records; temporary cleanup preserves customers and queue',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};
 connect('count-view');navigator.onLine=false;
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'COUNT-1',accountNo:'9911'}});
 const scope='user-a:tenant-a:count-view';
 await repository.transact(scope,state=>{
   state.records.push({key:'cloud',scope,recordId:'cloud',rowNumber:2,revision:'r1',pending:false,
     customer:{name:'Cloud only',accountNo:'9912',photoUrl:'drive-photo',photoPreview:'data:image/png;base64,cGhvdG8='}});
   state.records.push({key:'duplicate',scope,recordId:'cloud',rowNumber:2,revision:'r1',pending:false,customer:{name:'Duplicate cloud row'}});
   state.records.push({key:'deleted',scope,recordId:'deleted',rowNumber:3,revision:'r1',pending:false,deleted:true,customer:{name:'Deleted'}});
 });
 assert.deepEqual((await engine.getActiveLocalCustomers()).map(item=>item.recordId),[saved.recordId,'cloud']);
 assert.equal((await engine.getLocalStatus()).records,2);
 assert.equal(await engine.clearTemporaryLocalData(),1);
 const state=await repository.read(scope);
 assert.equal(state.records.find(item=>item.recordId==='cloud').customer.photoPreview,undefined);
 assert.equal(state.records.find(item=>item.recordId==='cloud').customer.photoUrl,'drive-photo');
 assert.equal(state.operations.length,1);
 await request({action:'deleteCustomer',rowNumber:saved.rowNumber});
 assert.deepEqual((await engine.getActiveLocalCustomers()).map(item=>item.recordId),['cloud']);
 assert.equal((await engine.getLocalStatus()).records,1);
 connect('other-count-view');assert.equal((await engine.getActiveLocalCustomers()).length,0);
});

test('online add and delete respond after local commit while cloud confirmation clears the queue',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('immediate-actions');navigator.onLine=true;
 const sent=[];let confirmDelete=false;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){
   sent.push(body.operation.action);
   if(body.operation.action==='deleteCustomer')return new Response(JSON.stringify({success:true,deleted:true,driveDeleted:true,rowDeleted:confirmDelete}));
   return new Response(JSON.stringify({success:true,rowNumber:2,revision:'r1',customer:{...body.operation.customer,recordId:body.operation.recordId,rowNumber:2,revision:'r1'}}));
 }return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false,nextCursor:0}));};
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'IMMEDIATE',accountNo:'7722'}});
 assert(saved.success&&saved.queued);assert.equal(sent.length,0);assert.equal((await repository.read('user-a:tenant-a:immediate-actions')).operations.length,1);
 await engine.syncNow(false);assert(sent.includes('saveCustomer'));
 const pending=await request({action:'deleteCustomer',rowNumber:2});assert.equal(pending.success,false);assert.equal(pending.queued,true);
 assert.equal((await request({action:'searchCustomer',query:'IMMEDIATE'})).success,false);
 await assert.rejects(engine.syncNow(false),/row and Drive deletion are not confirmed/);
 confirmDelete=true;await engine.syncNow(false);
 assert.equal((await repository.read('user-a:tenant-a:immediate-actions')).operations.length,0);
 assert(sent.filter(action=>action==='deleteCustomer').length>=2);
 navigator.onLine=false;
});

test('DELETE sends only stable identity, retains pending on cloud rejection, and keeps Firebase session',async()=>{
 storage.clear();const user={uid:'user-a',getIdToken:async()=> 'authenticated-token'};globalThis.__auth.currentUser=user;connect('delete-retry');navigator.onLine=false;
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'RETRY-1',accountNo:'7788'}});
 const deleted=await request({action:'deleteCustomer',rowNumber:saved.rowNumber});assert.equal(deleted.success,false);
 const scope='user-a:tenant-a:delete-retry';let state=await repository.read(scope);
 const operation=state.operations.find(op=>op.action==='deleteCustomer');assert.deepEqual(operation.customer,{});assert.equal(state.records.find(row=>row.recordId===saved.recordId).deleted,true);
 let reject=true;const sent=[];navigator.onLine=true;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.idToken,'authenticated-token');if(body.action==='syncCustomerOperation'){
   sent.push(body.operation.action);
   if(body.operation.action==='deleteCustomer'&&reject)return new Response(JSON.stringify({success:false,code:'SERVER_ERROR',message:'Google temporarily unavailable'}));
   return new Response(JSON.stringify(body.operation.action==='deleteCustomer'?{success:true,deleted:true,driveDeleted:true,rowDeleted:true,recordId:saved.recordId}:{success:true,rowNumber:2,revision:'r1',customer:{...customer,recordId:saved.recordId,rowNumber:2,revision:'r1'}}));
 }return new Response(JSON.stringify({success:true,customers:[],deletedIds:[saved.recordId],hasNextPage:false,nextCursor:1}));};
 await assert.rejects(engine.syncNow(false),/temporarily unavailable/);state=await repository.read(scope);
 assert(state.operations.some(op=>op.operationId===operation.operationId&&op.state==='pending'));assert.equal(globalThis.__auth.currentUser,user);
 reject=false;await engine.syncNow(false);state=await repository.read(scope);
 assert.equal(state.operations.length,0);assert.equal(state.records.find(row=>row.recordId===saved.recordId).deleted,true);
 assert.equal((await request({action:'searchCustomer',query:'RETRY-1'})).success,false);assert.equal(globalThis.__auth.currentUser,user);
 assert.deepEqual(sent,['saveCustomer','deleteCustomer','deleteCustomer']);navigator.onLine=false;
});
test('sync protection reports the actual bridge rejection and retains the pending operation',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('protection-diagnostic');navigator.onLine=false;
 await request({action:'saveCustomer',customer});const scope='user-a:tenant-a:protection-diagnostic';
 navigator.onLine=true;let uploads=0;handler=async(_url,init)=>{if(JSON.parse(init.body).action==='syncCustomerOperation')uploads++;return new Response('{}');};
 try{
   protectionOverride={success:false,code:'SERVER_ERROR',message:'Firebase authentication required.'};
   await assert.rejects(engine.syncNow(false),/Firebase authentication required/);
   protectionOverride={success:false,code:'CONNECTION_CHANGED',message:'Workspace connection changed.'};
   await assert.rejects(engine.syncNow(false),/Reconnect this tenant/);
   assert.equal(uploads,0);assert.equal((await repository.read(scope)).operations[0].state,'pending');
 }finally{protectionOverride=undefined;navigator.onLine=false;}
});

test('another device removes a cloud-deleted customer on next refresh and never recreates it',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('shared-tenant');navigator.onLine=false;
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'CROSS-DEVICE',accountNo:'9921'}});
 const scope='user-a:tenant-a:shared-tenant';await repository.transact(scope,state=>{state.records[0].pending=false;state.records[0].revision='cloud-r1';state.operations=[];});
 navigator.onLine=true;handler=async(_url,init)=>{const body=JSON.parse(init.body);return new Response(JSON.stringify(body.action==='getCustomerPage'?{success:true,customers:[],deletedIds:[saved.recordId],hasNextPage:false,nextCursor:250}:{success:false,message:'Customer not found.'}));};
 await engine.syncNow(true);let state=await repository.read(scope);
 assert.equal(state.records.find(row=>row.recordId===saved.recordId).deleted,true);
 assert.equal(state.operations.length,0);
 await engine.syncNow(true);state=await repository.read(scope);
 assert.equal(state.records.find(row=>row.recordId===saved.recordId).deleted,true);
 assert.equal((await request({action:'searchCustomer',query:'CROSS-DEVICE'})).success,false);
 navigator.onLine=false;
});

test('sheet-only records download, queued local saves upload, and orphan cache rows stay hidden',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('two-way');navigator.onLine=false;
 const scope='user-a:tenant-a:two-way';
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'LOCAL',accountNo:'9001'}});
 const localId=saved.recordId,orphanId=crypto.randomUUID();
 await repository.transact(scope,state=>state.records.push({key:orphanId,scope,recordId:orphanId,rowNumber:1000000002,revision:'',customer:{...customer,enrolId:'STALE',accountNo:'9003'},pending:false}));
 navigator.onLine=true;
 let saves=0;handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){
   saves++;return new Response(JSON.stringify({success:true,rowNumber:3,revision:'r1',customer:{...body.operation.customer,recordId:localId,rowNumber:3,revision:'r1'}}));
 }return new Response(JSON.stringify({success:true,customers:[{...customer,enrolId:'SHEET',accountNo:'9002',recordId:'cloud-only',rowNumber:2,revision:'r1'}],hasNextPage:false,nextCursor:1}));};
 await engine.syncNow();let state=await repository.read(scope);assert.equal(state.records.find(row=>row.recordId==='cloud-only').customer.enrolId,'SHEET');
 assert.equal(saves,1);assert.equal(state.records.find(row=>row.recordId===localId).revision,'r1');
 assert.equal(state.operations.length,0);assert.equal((await engine.getActiveLocalCustomers()).length,2);
 assert(state.records.some(row=>row.recordId===orphanId),'orphan remains recoverable in local backup');
 navigator.onLine=false;
});

test('a pending local delete cannot reappear through cloud search or paged customer listing',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'fresh-firebase-token'};
 connect('delete-tombstone');navigator.onLine=false;
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'TOMB-1',accountNo:'9911'}});
 await request({action:'deleteCustomer',rowNumber:saved.rowNumber});
 navigator.onLine=true;
 const stale={...customer,enrolId:'TOMB-1',accountNo:'9911',recordId:saved.recordId,rowNumber:7,revision:'r1'};
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation')throw Error('cloud unavailable');return new Response(JSON.stringify({success:true,customer:stale,customers:[stale],matches:[stale],rowNumber:7}));};
 assert.equal((await request({action:'searchCustomer',query:'TOMB-1'})).success,false);
 assert.equal((await request({action:'getAllCustomers',page:1,pageSize:15})).success,false);
 const state=await repository.read('user-a:tenant-a:delete-tombstone');
 assert.equal(state.records.find(record=>record.recordId===saved.recordId).deleted,true);
 assert(state.operations.some(op=>op.action==='deleteCustomer'&&op.state==='pending'));
 navigator.onLine=false;
});

test('remote delete and direct Sheet removal block stale uploads before normal reconciliation',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('shared-delete');navigator.onLine=true;
 const scope='user-a:tenant-a:shared-delete';
 const ids=['keep','deleted','manual'];
 await repository.transact(scope,state=>ids.forEach((recordId,i)=>state.records.push({key:recordId,scope,recordId,rowNumber:i+2,revision:'r1',customer:{name:recordId},pending:false})));
 await repository.transact(scope,state=>state.operations.push({key:'pending-edit',scope,operationId:'pending-edit',recordId:'deleted',action:'updateCustomer',customer:{name:'Stale edit'},baseRevision:'r1',rowNumber:3,createdAt:1,state:'pending'}));
 protectionOverride={success:true,protectionVersion:1,connectionId:'shared-delete',resetId:'',activeIds:['keep'],deletedIds:['deleted']};
 let writes=0;handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation')writes++;return new Response(JSON.stringify({success:true,customers:[{recordId:'keep',rowNumber:2,revision:'r1',name:'Valid'}],hasNextPage:false,nextCursor:1}));};
 try{
 await engine.syncNow(true);const state=await repository.read(scope);
 assert.equal(writes,0);assert(state.records.find(r=>r.recordId==='deleted').deleted);assert(state.records.find(r=>r.recordId==='manual').deleted);
 assert.equal(state.operations[0].state,'conflict');assert.deepEqual((await engine.getActiveLocalCustomers()).map(r=>r.recordId),['keep']);
 }finally{protectionOverride=undefined;navigator.onLine=false;}
});

test('shared reset clears only the current tenant cache, restores valid cloud rows, and blocks unsynced changes',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('reset-device');navigator.onLine=true;
 const scope='user-a:tenant-a:reset-device';
 await repository.transact(scope,state=>{for(let i=0;i<3;i++)state.records.push({key:'old-'+i,scope,recordId:'old-'+i,rowNumber:i+2,revision:'r1',customer:{name:'Old '+i},pending:false});state.documents={mapping:{safe:true}};});
 protectionOverride={success:true,protectionVersion:1,connectionId:'reset-device',resetId:'reset-from-other-device',activeIds:['cloud-valid'],deletedIds:[]};
 handler=async()=>new Response(JSON.stringify({success:true,customers:[{recordId:'cloud-valid',rowNumber:2,revision:'r2',name:'Valid cloud'}],hasNextPage:false,nextCursor:1}));
 try{
 await engine.syncNow(true);let state=await repository.read(scope);assert.equal(state.resetId,'reset-from-other-device');assert.equal(state.records.length,1);assert.equal((await engine.getActiveLocalCustomers()).length,1);assert.deepEqual(state.documents,{mapping:{safe:true}});
 connect('other-reset-tenant');assert.equal((await engine.getActiveLocalCustomers()).length,0);
 connect('reset-device');navigator.onLine=false;await request({action:'saveCustomer',customer:{...customer,enrolId:'PENDING-RESET',accountNo:'9009'}});
 protectionOverride={...protectionOverride,resetId:'newer-reset'};navigator.onLine=true;
 await assert.rejects(engine.syncNow(true),/shared reset is pending/);
 state=await repository.read(scope);assert.equal(state.operations.length,1);assert(state.records.some(r=>r.customer.enrolId==='PENDING-RESET'));
 }finally{protectionOverride=undefined;navigator.onLine=false;}
});

test('admin reset publishes a shared marker only after safety checks and downloads Sheet data',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('admin-reset');navigator.onLine=true;
 const scope='user-a:tenant-a:admin-reset';
 await repository.transact(scope,state=>state.records.push({key:'old',scope,recordId:'old',rowNumber:2,revision:'r1',customer:{name:'Old'},pending:false}));
 let published=0,sharedResetId='';
 protectionOverride={success:true,protectionVersion:1,connectionId:'admin-reset',resetId:'',activeIds:['old','new'],deletedIds:[]};
 handler=async(_url,init)=>{const body=JSON.parse(init.body);
   if(body.action==='publishLocalReset'){
     published++;sharedResetId=body.resetId;protectionOverride={...protectionOverride,resetId:sharedResetId};
     return new Response(JSON.stringify(protectionOverride));
   }
   return new Response(JSON.stringify({success:true,customers:[{recordId:'new',rowNumber:3,revision:'r2',name:'Cloud valid'}],hasNextPage:false,nextCursor:1}));
 };
 try{
  assert.equal(await engine.resetLocalDatabase(),1);
  assert.equal(published,1);assert.equal((await repository.read(scope)).resetId,sharedResetId);
  assert.deepEqual((await engine.getActiveLocalCustomers()).map(r=>r.recordId),['new']);
  await repository.transact(scope,state=>{state.records[0].customer.photoDataUrl='data:image/png;base64,cGhvdG8=';});
  await assert.rejects(engine.resetLocalDatabase(),/resolve every pending/);assert.equal(published,1);
  await repository.transact(scope,state=>{delete state.records[0].customer.photoDataUrl;});
  navigator.onLine=false;await request({action:'saveCustomer',customer:{...customer,enrolId:'UNSYNCED',accountNo:'9090'}});
  navigator.onLine=true;await assert.rejects(engine.resetLocalDatabase(),/resolve every pending/);assert.equal(published,1);
 }finally{protectionOverride=undefined;navigator.onLine=false;}
});

test('verified missing photo stays out of repeated sync; changed reference resumes existing photo download',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('photo-status');navigator.onLine=true;
 const scope='user-a:tenant-a:photo-status',recordId='missing-photo';
 await repository.transact(scope,state=>{state.records.push({key:recordId,scope,recordId,rowNumber:2,revision:'r1',customer:{name:'Photo customer',enrolId:'PHOTO-1'},pending:false});state.pull={cursor:0,seen:[],startedAt:Date.now(),lastCompletedAt:Date.now()};});
 let downloads=0;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.action,'getCustomerByRowNumber');downloads++;return new Response(JSON.stringify(downloads===1?{success:true,photoNotFound:true,customer:{recordId,rowNumber:2,revision:'r1',name:'Photo customer',enrolId:'PHOTO-1'}}:{success:true,customer:{recordId,rowNumber:2,revision:'r2',name:'Photo customer',enrolId:'PHOTO-1',photoUrl:'new-photo',photoPreview:'data:image/png;base64,cGhvdG8='}}));};
 try{
  await engine.syncNow(false);assert.equal(downloads,1);assert.equal((await engine.getLocalStatus()).mediaPending,0);
  await engine.syncNow(false);assert.equal(downloads,1);
  await repository.transact(scope,state=>{state.records[0].customer.photoUrl='new-photo';state.records[0].photoCheckedAt=undefined;});
  await engine.syncNow(false);assert.equal(downloads,2);
  assert.match((await repository.read(scope)).records[0].customer.photoPreview,/data:image/);
 }finally{navigator.onLine=false;}
});

test('legacy photo hydration uses bounded parallel reads, skips cached photos and duplicate jobs',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('parallel-photos');navigator.onLine=true;
 const scope='user-a:tenant-a:parallel-photos';
 await repository.transact(scope,state=>{
   for(let i=0;i<6;i++)state.records.push({key:`photo-${i}`,scope,recordId:`photo-${i}`,rowNumber:i+2,revision:'r1',customer:{enrolId:`P-${i}`,photoUrl:`drive-${i}`},pending:false});
   state.records.push({key:'cached',scope,recordId:'cached',rowNumber:8,revision:'r1',customer:{enrolId:'CACHED',photoUrl:'drive-cached',photoPreview:'data:image/jpeg;base64,eA=='},pending:false});
   state.records.push({key:'discovery',scope,recordId:'discovery',rowNumber:9,revision:'r1',customer:{enrolId:'DISCOVERY'},pending:false});
   state.records.push({...state.records[0],key:'duplicate'});
   state.pull={cursor:0,seen:[],startedAt:Date.now(),lastCompletedAt:Date.now()};
 });
 let active=0,maxActive=0;const calls=[];
 handler=async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.action,'getCustomerByRowNumber');calls.push(body.recordId);active++;maxActive=Math.max(maxActive,active);
   await new Promise(resolve=>setTimeout(resolve,12));active--;
   return new Response(JSON.stringify({success:true,photoNotFound:body.recordId==='discovery',customer:{recordId:body.recordId,rowNumber:body.rowNumber,revision:'r1',enrolId:body.recordId==='discovery'?'DISCOVERY':`P-${body.recordId.split('-')[1]}`,photoUrl:body.recordId==='discovery'?'':`drive-${body.recordId.split('-')[1]}`,photoPreview:body.recordId==='discovery'?'':'data:image/jpeg;base64,eA=='}}));
 };
 try{
   await engine.syncNow(false);assert.equal(calls.length,7);assert.equal(new Set(calls).size,7);assert(maxActive>1&&maxActive<=3);
   assert.equal(calls.at(-1),'discovery');assert.equal((await engine.getLocalStatus()).mediaPending,0);
   await engine.syncNow(false);assert.equal(calls.length,7);
 }finally{navigator.onLine=false;}
});

test('photo failure retries later without blocking new photo upload; new save preempts legacy reads',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('photo-priority');navigator.onLine=true;
 const scope='user-a:tenant-a:photo-priority';
 await repository.transact(scope,state=>{state.records.push({key:'old',scope,recordId:'old',rowNumber:2,revision:'r1',customer:{enrolId:'OLD',photoUrl:'old-photo'},pending:false});state.pull={cursor:0,seen:[],startedAt:Date.now(),lastCompletedAt:Date.now()};});
 let started;const inFlight=new Promise(resolve=>started=resolve);let aborted=0,uploads=0,reads=0;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);
   if(body.action==='syncCustomerOperation'){uploads++;assert(body.operation.customer.photoDataUrl);return new Response(JSON.stringify({success:true,rowNumber:3,revision:'r2',customer:{...body.operation.customer,recordId:body.operation.recordId,rowNumber:3,revision:'r2',photoUrl:'new-drive-photo',photoPreview:body.operation.customer.photoDataUrl}}));}
   reads++;
   if(reads===1){started();return new Promise((_resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Photo request did not yield')),3000);init.signal.addEventListener('abort',()=>{clearTimeout(timer);aborted++;reject(init.signal.reason);},{once:true});});}
   if(reads===2)return new Response(JSON.stringify({success:false,message:'Temporary Drive error'}));
   return new Response(JSON.stringify({success:true,customer:{recordId:'old',rowNumber:2,revision:'r1',enrolId:'OLD',photoUrl:'old-photo',photoPreview:'data:image/jpeg;base64,eA=='}}));
 };
 try{
   const first=engine.syncNow(false);await inFlight;
   await request({action:'saveCustomer',customer:{...customer,enrolId:'NEW-PHOTO',accountNo:'8800',photoDataUrl:'data:image/jpeg;base64,eA=='}});
   await first;assert.equal(aborted,1);
   await engine.syncNow(false);assert.equal(uploads,1);
   let state=await repository.read(scope);assert.equal(state.operations.length,0);assert(state.records.find(item=>item.customer.enrolId==='NEW-PHOTO').customer.photoUrl);
   assert(state.records.find(item=>item.recordId==='old').photoRetryAt>Date.now());
   const before=reads;await engine.syncNow(false);assert.equal(reads,before);
   navigator.onLine=false;await engine.syncNow(false);assert.equal(reads,before);navigator.onLine=true;
   await repository.transact(scope,current=>{current.records.find(item=>item.recordId==='old').photoRetryAt=Date.now()-1;});
   await engine.syncNow(false);state=await repository.read(scope);assert.match(state.records.find(item=>item.recordId==='old').customer.photoPreview,/data:image/);
 }finally{navigator.onLine=false;}
});

test('2,734 migrated rows with explicit empty photo metadata make zero photo requests or uploads; remote new photo invalidates absence',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('migrated-2734');navigator.onLine=true;
 const scope='user-a:tenant-a:migrated-2734';
 const records=Array.from({length:2734},(_,i)=>({recordId:`migrated-${i}`,revision:'r1',rowNumber:i+2,name:`Migrated ${i}`,enrolId:`M-${i}`,accountNo:'',uidaiNo:'',photoUrl:''}));
 let photoRequests=0,uploads=0;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);
  if(body.action==='syncCustomerOperation'){uploads++;throw Error('No imported row should upload');}
  if(body.action==='getCustomerByRowNumber'){photoRequests++;assert.equal(body.recordId,'migrated-2');return new Response(JSON.stringify({success:true,customer:{...records[2],photoPreview:'data:image/jpeg;base64,eA=='},rowNumber:4}));}
  assert.equal(body.action,'getCustomerPage');const end=Math.min(body.cursor+250,records.length);return new Response(JSON.stringify({success:true,customers:records.slice(body.cursor,end),nextCursor:end,hasNextPage:end<records.length}));
 };
 try{
  for(let i=0;i<3;i++)await engine.syncNow(false);
  assert.equal((await engine.getLocalStatus()).records,2734);assert.equal((await engine.getLocalStatus()).mediaPending,0);
  await engine.syncNow(false);assert.equal(photoRequests,0);assert.equal(uploads,0);
  const before=await repository.read(scope);assert.equal(before.operations.length,0);assert.deepEqual(before.photoPresence.customerIds,[]);
  records[2]={...records[2],photoUrl:'new-drive-id',revision:'r2'};
  for(let i=0;i<3;i++)await engine.syncNow(true);
  assert.equal(photoRequests,1);assert.equal(uploads,0);assert.match((await repository.read(scope)).records.find(r=>r.recordId==='migrated-2').customer.photoPreview,/data:image/);
 }finally{navigator.onLine=false;}
});

test('busy lock preserves the exact pending operation and retries safely on the next sync',async()=>{
 storage.clear();connect('lock-retry');navigator.onLine=false;const saved=await request({action:'saveCustomer',customer});
 const scope='user-a:tenant-a:lock-retry';const before=await repository.read(scope);navigator.onLine=true;let busy=true;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);
  if(body.action==='syncCustomerOperation')return new Response(JSON.stringify(busy?{success:false,code:'SYNC_BUSY',message:'Another request is active'}:{success:true,revision:'r1',rowNumber:2,customer:{...customer,recordId:saved.recordId,rowNumber:2,revision:'r1',photoUrl:''}}));
  return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false}));
 };
 try{
  await assert.rejects(engine.syncNow(false),/retry automatically/);
  assert.deepEqual((await repository.read(scope)).operations,before.operations);
  busy=false;await engine.syncNow(false);assert.equal((await repository.read(scope)).operations.length,0);
 }finally{navigator.onLine=false;}
});

test('incomplete migrated row accepts only the allowed status patch and keeps full-form validation',async()=>{
 storage.clear();connect('legacy-status');navigator.onLine=false;const scope='user-a:tenant-a:legacy-status';
 await repository.transact(scope,state=>state.records.push({key:'legacy',scope,recordId:'legacy',rowNumber:2,revision:'r1',pending:false,customer:{name:'Legacy',accountNo:'',uidaiNo:'',enrolId:'L-1',photoUrl:'',address:'unchanged'}}));
 const before=await repository.read(scope);
 assert.equal((await request({action:'updateCustomer',recordId:'foreign',rowNumber:2,statusOnly:true,statusField:'status',statusValue:'Active'})).success,false);
 assert.equal((await request({action:'updateCustomer',recordId:'legacy',rowNumber:2,statusOnly:true,statusField:'status',statusValue:'INVALID'})).success,false);
 assert.equal((await request({action:'updateCustomer',rowNumber:2,customer:{name:'Edited',enrolId:'L-1',accountNo:'',uidaiNo:''}})).success,false);
 assert.deepEqual(await repository.read(scope),before);
 const patch=await request({action:'updateCustomer',recordId:'legacy',rowNumber:999,statusOnly:true,statusField:'status',statusValue:'Active',customer:{name:'must not overwrite'}});
 assert(patch.queued);const after=await repository.read(scope);
 assert.deepEqual(after.records[0].customer,{...before.records[0].customer,status:'Active'});
 assert.deepEqual(after.operations[0].customer,{status:'Active'});assert.equal(after.operations[0].statusOnly,true);
});

test('blank URL does not hide an existing legacy customer-ID photo from the verified folder inventory',async()=>{
 storage.clear();connect('legacy-folder-photo');navigator.onLine=true;inventoryOverride=['EXISTING'];
 const scope='user-a:tenant-a:legacy-folder-photo';
 await repository.transact(scope,state=>{state.records.push({key:'present',recordId:'present',scope,rowNumber:2,revision:'r1',customer:{name:'Legacy photo',enrolId:'EXISTING',photoUrl:''},pending:false});state.pull={cursor:0,seen:[],startedAt:Date.now(),lastCompletedAt:Date.now()};});
 let reads=0;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.action,'getCustomerByRowNumber');reads++;return new Response(JSON.stringify({success:true,rowNumber:2,customer:{recordId:'present',rowNumber:2,revision:'r1',enrolId:'EXISTING',photoUrl:'legacy-drive',photoPreview:'data:image/jpeg;base64,eA=='}}));};
 try{await engine.syncNow(false);assert.equal(reads,1);assert.match((await repository.read(scope)).records[0].customer.photoPreview,/data:image/);}
 finally{inventoryOverride=undefined;navigator.onLine=false;}
});

test('lock contention leaves operations pending and concurrent sync requests share one job',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('lock-busy');navigator.onLine=false;
 await request({action:'saveCustomer',customer});const scope='user-a:tenant-a:lock-busy';const before=await repository.read(scope);navigator.onLine=true;
 protectionOverride={success:false,code:'SYNC_BUSY',message:'Another device is committing a change.'};
 try{const first=engine.syncNow(false);assert.equal(engine.syncNow(false),first);await assert.rejects(first,/retry automatically/);assert.deepEqual(await repository.read(scope),before);}finally{protectionOverride=undefined;navigator.onLine=false;}
});

test('pause aborts an already running manual sync without deleting its pending operation',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('pause-inflight');navigator.onLine=false;
 await request({action:'saveCustomer',customer});const scope='user-a:tenant-a:pause-inflight';const before=await repository.read(scope);navigator.onLine=true;
 let started;const ready=new Promise(resolve=>{started=resolve});
 handler=async(_url,init)=>new Promise((_resolve,reject)=>{started();init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});
 const task=engine.syncNow(false);await ready;engine.pauseSync();engine.resumeSync();await task;
 assert.equal(engine.isSyncPaused(),false);assert.deepEqual(await repository.read(scope),before);assert.equal((await engine.getLocalStatus()).error,'');navigator.onLine=false;
});
test('new account session clears pause and preserves the old account queue',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('switch-a');navigator.onLine=false;
 await request({action:'saveCustomer',customer});const previous=await repository.read('user-a:tenant-a:switch-a');
 engine.pauseSync();assert.equal(engine.isSyncPaused(),true);
 engine.resetSyncSession();assert.equal(engine.isSyncPaused(),false);
 globalThis.__auth.currentUser={uid:'user-b',getIdToken:async()=> 'token'};connect('switch-b');
 assert.equal((await engine.getLocalStatus()).pending,0);
 assert.deepEqual(await repository.read('user-a:tenant-a:switch-a'),previous);
 globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('switch-a');
 assert.equal((await engine.getLocalStatus()).pending,1);
});
