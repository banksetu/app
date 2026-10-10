import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import crypto from 'node:crypto';
import {createOfflineSession} from '../cloudflare/offlineSession.js';
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});globalThis.__pinnedKey=publicKey.export({format:'jwk'});
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64');
let saved={records:[],operations:[]};globalThis.__offlineRepo={read:async()=>structuredClone(saved),transact:async(_scope,change)=>change(saved)};globalThis.__offlineAuth={currentUser:{uid:'u1'}};const storage=new Map();globalThis.sessionStorage={removeItem:key=>storage.delete(key),getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};
let session,grantCalls=0;globalThis.__offlineWorker=async()=>{grantCalls++;return session};globalThis.__tenantApi={setTenantApiUrl:()=>{},setTenantWorkspaceReady:value=>storage.set('ready',value)};
let source=fs.readFileSync('src/core/offlineSession.ts','utf8').replace('import { auth } from "../firebase";','const auth=globalThis.__offlineAuth;').replace('import { callBankSetuWorker } from "../workerApi";','const callBankSetuWorker=globalThis.__offlineWorker;').replace('import { customerRepository } from "./customerRepository";','const customerRepository=globalThis.__offlineRepo;').replace('import { setTenantApiUrl, setTenantWorkspaceReady } from "../tenantApi";','const {setTenantApiUrl,setTenantWorkspaceReady}=globalThis.__tenantApi;').replace('import trustedKey from "../generated/licensePublicKey.json";','const trustedKey=globalThis.__pinnedKey;');
const offline=await import(compile(source));const backup=await import(compile(fs.readFileSync('src/core/backup.ts','utf8')));
test('signed offline session resumes same user after restart, rejects tampering, expiry and foreign UID, and invalidates on revocation',async()=>{
 const now=Date.now();const claims={uid:'u1',tenantId:'tenant',connectionId:'conn',role:'client_admin',status:'approved',subscriptionStatus:'active',apiUrl:'https://script.google.com/macros/s/bridge/exec',issuedAt:now,expiresAt:now+4*3600000};
 session=await createOfflineSession(JSON.stringify({private_key:privateKey.export({type:'pkcs8',format:'pem'})}),claims);
 assert(!session.publicKey.d);await offline.enrollOfflineSession();
 storage.set('bankSetuTenantId','tenant');storage.set('bankSetuConnectionId','conn');storage.set('bankSetuAccountRole','client_admin');
 await offline.enrollOfflineSession();assert.equal(grantCalls,1,'a valid signed grant avoids an identical Worker request');
 storage.clear();assert.equal((await offline.resumeOfflineSession('u1')).tenantId,'tenant');assert.equal(storage.get('ready'),true);
 const attacker=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const forged=await createOfflineSession(JSON.stringify({private_key:attacker.privateKey.export({type:'pkcs8',format:'pem'})}),claims);
 await assert.rejects(offline.verifyOfflineSession(forged,'u1'),/signature/,'an attacker-supplied public key cannot sign their own access grant');
 await assert.rejects(offline.verifyOfflineSession({...session,payload:JSON.stringify({...claims,role:'client_user'})},'u1'),/signature/);await assert.rejects(offline.verifyOfflineSession(session,'other'),/another account/);await assert.rejects(offline.verifyOfflineSession(session,'u1',now+4*3600000+1),/expired/);
 await offline.clearOfflineSession('u1');await assert.rejects(offline.resumeOfflineSession('u1'),/First login/);
});
test('licensed offline grant can last five days but never beyond its signed expiry',async()=>{
 const now=Date.now();const claims={uid:'u1',tenantId:'tenant',connectionId:'conn',role:'client_admin',status:'approved',subscriptionStatus:'active',licenseRequired:true,apiUrl:'https://script.google.com/macros/s/bridge/exec',issuedAt:now,expiresAt:now+5*86400000};
 const signed=await createOfflineSession(JSON.stringify({private_key:privateKey.export({type:'pkcs8',format:'pem'})}),claims);
 assert.equal((await offline.verifyOfflineSession(signed,'u1',now+4*86400000)).tenantId,'tenant');
 await assert.rejects(offline.verifyOfflineSession(signed,'u1',claims.expiresAt),/expired/);
 const excessive=await createOfflineSession(JSON.stringify({private_key:privateKey.export({type:'pkcs8',format:'pem'})}),{...claims,expiresAt:now+6*86400000});
 await assert.rejects(offline.verifyOfflineSession(excessive,'u1'),/expired/);
});
test('backup restoration retains pending data, rejects foreign scopes, deduplicates operation replay and records differing versions as conflicts',()=>{
 const scope='u1:tenant:conn',id=crypto.randomUUID(),opId=crypto.randomUUID();const record={key:id,scope,recordId:id,rowNumber:2,revision:'r1',pending:true,customer:{name:'Restored'}};const op={key:opId,scope,recordId:id,operationId:opId,action:'updateCustomer',baseRevision:'r1',customer:record.customer,rowNumber:2,createdAt:Date.now(),state:'pending'};const archive=backup.makeBackup(scope,{records:[record],operations:[op]});
 assert.throws(()=>backup.parseBackup(JSON.stringify(archive),'u2:tenant:conn'),/belonging/);
 const parsed=backup.parseBackup(JSON.stringify(archive),scope);const empty={records:[],operations:[]};assert.equal(backup.mergeBackup(empty,parsed).operations,1);assert.equal(backup.mergeBackup(empty,parsed).operations,0);
 const current={records:[{...record,customer:{name:'Existing edit'}}],operations:[]};assert.equal(backup.mergeBackup(current,parsed).conflicts,1);assert.equal(current.records[0].customer.name,'Existing edit');assert.equal(current.operations[0].customer.name,'Restored');assert.equal(current.operations[0].conflictSource,'backup');assert.equal(current.operations[0].remoteCustomer.revision,'r1');assert.equal(current.operations[0].remoteCustomer.rowNumber,2);
 assert.throws(()=>backup.parseBackup(JSON.stringify({...archive,operations:[{...op,key:'bad'}]}),scope),/invalid/);
});

test('JSON backup round trip retains downloaded Sheet records, local edits, photos and deletion tombstones',()=>{
 const scope='u1:tenant:conn';
 const syncedId=crypto.randomUUID(),pendingId=crypto.randomUUID(),deletedId=crypto.randomUUID(),operationId=crypto.randomUUID();
 const records=[
  {key:syncedId,scope,recordId:syncedId,rowNumber:2,revision:'sheet-r1',pending:false,customer:{name:'Downloaded',photoUrl:'drive-id',photoPreview:'data:image/png;base64,eA=='}},
  {key:pendingId,scope,recordId:pendingId,rowNumber:1000000000,revision:'',pending:true,customer:{name:'Offline entry',accountNo:'123'}},
  {key:deletedId,scope,recordId:deletedId,rowNumber:4,revision:'sheet-r2',pending:false,deleted:true,customer:{name:'Deleted'}}
 ];
 const operations=[{key:operationId,scope,operationId,recordId:pendingId,action:'saveCustomer',baseRevision:'',rowNumber:1000000000,createdAt:Date.now(),state:'pending',customer:records[1].customer}];
 const archive=JSON.stringify(backup.makeBackup(scope,{records,operations}));
 const target={records:[],operations:[]};
 assert.deepEqual(backup.mergeBackup(target,backup.parseBackup(archive,scope)),{records:3,operations:1,conflicts:0});
 assert.deepEqual(target.records,records);assert.deepEqual(target.operations,operations);
 assert.deepEqual(backup.mergeBackup(target,backup.parseBackup(archive,scope)),{records:0,operations:0,conflicts:0});
});

test('Master offline grant keeps user-scoped API settings and rejects a client tenant',async()=>{
 const now=Date.now();const claims={uid:'u1',tenantId:'master:u1',connectionId:'master-conn',role:'master_owner',status:'approved',subscriptionStatus:'active',apiUrl:'https://script.google.com/macros/s/master/exec',issuedAt:now,expiresAt:now+3600000};
 session=await createOfflineSession(JSON.stringify({private_key:privateKey.export({type:'pkcs8',format:'pem'})}),claims);await offline.enrollOfflineSession();storage.clear();await offline.resumeOfflineSession('u1');assert.equal(storage.get('bankSetuTenantId'),undefined);assert.equal(storage.get('bankSetuMasterLocalEnabled'),'true');assert.equal(storage.get('bankSetuConnectionMode'),'master-local');
 const bad=await createOfflineSession(JSON.stringify({private_key:privateKey.export({type:'pkcs8',format:'pem'})}),{...claims,tenantId:'client-tenant'});await assert.rejects(offline.verifyOfflineSession(bad,'u1'),/scope/);
});
