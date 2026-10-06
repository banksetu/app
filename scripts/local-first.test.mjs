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
let source=fs.readFileSync('src/core/localData.ts','utf8').replace('import { isAndroid, shareAndroidBackup } from "../platform/android/runtime";', 'const isAndroid=()=>false; const shareAndroidBackup=async()=>{throw new Error("Native sharing is unavailable in this web test")};').replace('import { auth } from "../firebase";','const auth=globalThis.__auth;').replace('import { customerRepository as repository } from "./customerRepository";','const repository=globalThis.__repository;');
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
