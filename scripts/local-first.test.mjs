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
let handler=async()=>{throw new Error('offline');};globalThis.fetch=(...args)=>handler(...args);
globalThis.__repository=repository;
let source=fs.readFileSync('src/core/localData.ts','utf8').replace('import { isAndroid, shareAndroidBackup } from "../platform/android/runtime";','const isAndroid=()=>false;const shareAndroidBackup=async()=>{};').replace('import { auth } from "../firebase";','const auth=globalThis.__auth;').replace('import { customerRepository as repository } from "./customerRepository";','const repository=globalThis.__repository;');
globalThis.__backup=await import(compile(fs.readFileSync("src/core/backup.ts","utf8")));
source=source.replace('import { makeBackup, parseBackup, mergeBackup } from "./backup";','const {makeBackup,parseBackup,mergeBackup}=globalThis.__backup;');
const engine=await import(compile(source));
function connect(id='connection-a') {storage.set('bankSetuOfflineUntil',String(Date.now()+3600000));storage.set('bankSetuTenantId','tenant-a');storage.set('bankSetuConnectionId',id);storage.set('bankSetuConnectionMode','option-b');storage.set('bankSetuWorkspaceReady','true');storage.set('bankSetuBridgeUrl','https://script.google.com/macros/s/bridge/exec');storage.set('bankSetuAccountRole','client_admin');}
const customer={name:'Alice',accountNo:'1001',enrolId:'C001',uidaiNo:'123456789012'};
const request=body=>engine.localDataFetch('https://script.google.com/macros/s/bridge/exec',{method:'POST',body:JSON.stringify({...body,idToken:'never-store-this'})}).then(response=>response.json());
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
 const before=calls.length;const hit=await request({action:'searchCustomer',query:'Existing 0'});assert.equal(hit.local,true);assert.equal(calls.length,before,'local hits never await Google');
 navigator.onLine=false;assert.equal((await request({action:'searchCustomer',query:'Existing 1250'})).customer.name,'Existing 1250');
 }finally{stop();}
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
 await settle();assert.equal(attempts,1);assert([...timers.values()].some(t=>t.delay===5000));assert.equal((await repository.read(scope)).operations[0].state,'pending');assert.equal((await engine.getLocalStatus()).syncing,false);
 const retry=[...timers.values()].find(t=>t.delay===5000);retry.fn();await settle();assert.equal(attempts,2);assert([...timers.values()].some(t=>t.delay===10000));
 healthy=true;window.dispatchEvent(new Event('online'));await settle();assert.equal(attempts,3);assert.equal((await repository.read(scope)).operations.length,0);assert(activity.includes(true));assert.equal(activity.at(-1),false);assert(recoveries>=2);
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

test('online add waits for the existing sync and delete reports success only after row and Drive confirmation',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('immediate-actions');navigator.onLine=true;
 const sent=[];let confirmDelete=false;
 handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){
   sent.push(body.operation.action);
   if(body.operation.action==='deleteCustomer')return new Response(JSON.stringify({success:true,deleted:true,driveDeleted:true,rowDeleted:confirmDelete}));
   return new Response(JSON.stringify({success:true,rowNumber:2,revision:'r1',customer:{...body.operation.customer,recordId:body.operation.recordId,rowNumber:2,revision:'r1'}}));
 }return new Response(JSON.stringify({success:true,customers:[],hasNextPage:false,nextCursor:0}));};
 const saved=await request({action:'saveCustomer',customer:{...customer,enrolId:'IMMEDIATE',accountNo:'7722'}});
 assert(saved.success);assert(sent.includes('saveCustomer'));assert.equal((await repository.read('user-a:tenant-a:immediate-actions')).operations.length,0);
 const pending=await request({action:'deleteCustomer',rowNumber:2});assert.equal(pending.success,false);assert.equal(pending.queued,true);
 assert.equal((await request({action:'searchCustomer',query:'IMMEDIATE'})).success,false);
 confirmDelete=true;await engine.syncNow(false);
 assert.equal((await repository.read('user-a:tenant-a:immediate-actions')).operations.length,0);
 assert(sent.filter(action=>action==='deleteCustomer').length>=2);
 navigator.onLine=false;
});

test('sheet-only records download and revisionless local-only records use the existing save queue',async()=>{
 storage.clear();globalThis.__auth.currentUser={uid:'user-a',getIdToken:async()=> 'token'};connect('two-way');navigator.onLine=true;
 const scope='user-a:tenant-a:two-way';const localId=crypto.randomUUID();
 await repository.transact(scope,state=>state.records.push({key:localId,scope,recordId:localId,rowNumber:1000000001,revision:'',customer:{...customer,enrolId:'LOCAL',accountNo:'9001'},pending:false}));
 let saves=0;handler=async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==='syncCustomerOperation'){
   saves++;return new Response(JSON.stringify({success:true,rowNumber:3,revision:'r1',customer:{...body.operation.customer,recordId:localId,rowNumber:3,revision:'r1'}}));
 }return new Response(JSON.stringify({success:true,customers:[{...customer,enrolId:'SHEET',accountNo:'9002',recordId:'cloud-only',rowNumber:2,revision:'r1'}],hasNextPage:false,nextCursor:1}));};
 await engine.syncNow();let state=await repository.read(scope);assert.equal(state.records.find(row=>row.recordId==='cloud-only').customer.enrolId,'SHEET');assert(state.operations.some(op=>op.recordId===localId&&op.action==='saveCustomer'));
 await engine.syncNow(false);state=await repository.read(scope);assert.equal(saves,1);assert.equal(state.records.find(row=>row.recordId===localId).revision,'r1');
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
