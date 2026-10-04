import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import crypto from 'node:crypto';
import {createOfflineSession} from '../cloudflare/offlineSession.js';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64');
let saved={records:[],operations:[]};globalThis.__offlineRepo={read:async()=>structuredClone(saved),transact:async(_scope,change)=>change(saved)};globalThis.__offlineAuth={currentUser:{uid:'u1'}};const storage=new Map();globalThis.sessionStorage={removeItem:key=>storage.delete(key),getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};
let session;globalThis.__offlineWorker=async()=>session;globalThis.__tenantApi={setTenantApiUrl:()=>{},setTenantWorkspaceReady:value=>storage.set('ready',value)};
let source=fs.readFileSync('src/core/offlineSession.ts','utf8').replace('import { auth } from "../firebase";','const auth=globalThis.__offlineAuth;').replace('import { callBankSetuWorker } from "../workerApi";','const callBankSetuWorker=globalThis.__offlineWorker;').replace('import { customerRepository } from "./customerRepository";','const customerRepository=globalThis.__offlineRepo;').replace('import { setTenantApiUrl, setTenantWorkspaceReady } from "../tenantApi";','const {setTenantApiUrl,setTenantWorkspaceReady}=globalThis.__tenantApi;');
const offline=await import(compile(source));const backup=await import(compile(fs.readFileSync('src/core/backup.ts','utf8')));
test('signed offline session resumes same user after restart, rejects tampering, expiry and foreign UID, and invalidates on revocation',async()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const now=Date.now();const claims={uid:'u1',tenantId:'tenant',connectionId:'conn',role:'client_admin',status:'approved',subscriptionStatus:'active',apiUrl:'https://script.google.com/macros/s/bridge/exec',issuedAt:now,expiresAt:now+3600000};
 session=await createOfflineSession(JSON.stringify({private_key:privateKey.export({type:'pkcs8',format:'pem'})}),claims);
 assert(!session.publicKey.d);await offline.enrollOfflineSession();storage.clear();assert.equal((await offline.resumeOfflineSession('u1')).tenantId,'tenant');assert.equal(storage.get('ready'),true);
 await assert.rejects(offline.verifyOfflineSession({...session,payload:JSON.stringify({...claims,role:'client_user'})},'u1'),/signature/);await assert.rejects(offline.verifyOfflineSession(session,'other'),/another account/);await assert.rejects(offline.verifyOfflineSession(session,'u1',now+3600001),/expired/);
 await offline.clearOfflineSession('u1');await assert.rejects(offline.resumeOfflineSession('u1'),/First login/);
});
test('backup restoration retains pending data, rejects foreign scopes, deduplicates operation replay and records differing versions as conflicts',()=>{
 const scope='u1:tenant:conn',id=crypto.randomUUID(),opId=crypto.randomUUID();const record={key:id,scope,recordId:id,rowNumber:2,revision:'r1',pending:true,customer:{name:'Restored'}};const op={key:opId,scope,recordId:id,operationId:opId,action:'updateCustomer',baseRevision:'r1',customer:record.customer,rowNumber:2,createdAt:Date.now(),state:'pending'};const archive=backup.makeBackup(scope,{records:[record],operations:[op]});
 assert.throws(()=>backup.parseBackup(JSON.stringify(archive),'u2:tenant:conn'),/belonging/);
 const parsed=backup.parseBackup(JSON.stringify(archive),scope);const empty={records:[],operations:[]};assert.equal(backup.mergeBackup(empty,parsed).operations,1);assert.equal(backup.mergeBackup(empty,parsed).operations,0);
 const current={records:[{...record,customer:{name:'Existing edit'}}],operations:[]};assert.equal(backup.mergeBackup(current,parsed).conflicts,1);assert.equal(current.records[0].customer.name,'Existing edit');assert.equal(current.operations[0].customer.name,'Restored');assert.equal(current.operations[0].conflictSource,'backup');assert.equal(current.operations[0].remoteCustomer.revision,'r1');assert.equal(current.operations[0].remoteCustomer.rowNumber,2);
 assert.throws(()=>backup.parseBackup(JSON.stringify({...archive,operations:[{...op,key:'bad'}]}),scope),/invalid/);
});

test('Master offline grant keeps user-scoped API settings and rejects a client tenant',async()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const now=Date.now();const claims={uid:'u1',tenantId:'master:u1',connectionId:'master-conn',role:'master_owner',status:'approved',subscriptionStatus:'active',apiUrl:'https://script.google.com/macros/s/master/exec',issuedAt:now,expiresAt:now+3600000};
 session=await createOfflineSession(JSON.stringify({private_key:privateKey.export({type:'pkcs8',format:'pem'})}),claims);await offline.enrollOfflineSession();storage.clear();await offline.resumeOfflineSession('u1');assert.equal(storage.get('bankSetuTenantId'),undefined);assert.equal(storage.get('bankSetuMasterLocalEnabled'),'true');assert.equal(storage.get('bankSetuConnectionMode'),'master-local');
 const bad=await createOfflineSession(JSON.stringify({private_key:privateKey.export({type:'pkcs8',format:'pem'})}),{...claims,tenantId:'client-tenant'});await assert.rejects(offline.verifyOfflineSession(bad,'u1'),/scope/);
});
