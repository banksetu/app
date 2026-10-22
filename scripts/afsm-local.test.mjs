import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {indexedDB} from 'fake-indexeddb';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64');
globalThis.indexedDB=indexedDB;const {indexedDbRepository:repository}=await import(compile(fs.readFileSync('src/platform/web/indexedDbRepository.ts','utf8')));
const session=new Map([['bankSetuAccountRole','client_user']]);globalThis.sessionStorage={getItem:key=>session.get(key)||null};globalThis.window=new EventTarget();globalThis.__afsmRepo=repository;globalThis.__afsmAuth={currentUser:{uid:'synthetic-user'}};globalThis.__scope='user:tenant-a:connection';globalThis.__allowed=true;
const source=fs.readFileSync('src/core/afsm.ts','utf8').replace("import { callBankSetuWorker } from '../workerApi';","const callBankSetuWorker=()=>{};").replace("import { auth } from '../firebase';","const auth=globalThis.__afsmAuth;").replace("import { requireLicensedWrite } from './licenseAccess';","const requireLicensedWrite=async()=>{if(!globalThis.__allowed)throw Error('License blocked');};").replace("import { customerRepository } from './customerRepository';","const customerRepository=globalThis.__afsmRepo;").replace("import { identity, localModeEnabled, localDataFetch, getDataIdToken, resumeSync } from './localData';","const identity=()=>globalThis.__scope;const localModeEnabled=()=>true;const resumeSync=()=>{};const localDataFetch=()=>{};const getDataIdToken=()=>{};").replace("import { getCustomerSearchApiUrl } from '../tenantApi';","const getCustomerSearchApiUrl=()=>'';").replace('export { afsmBusinessDate, afsmDisplay } from "./afsmPolicy";','');
const {markCustomersAfsmSent}=await import(compile(source));
const scope=globalThis.__scope,ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
await repository.transact(scope,state=>{state.records=ids.map((id,i)=>({key:id,scope,recordId:id,rowNumber:i+2,revision:'r1',customer:{name:`Synthetic ${i}`,accountNo:String(i),accountOpeningDate:'09/10/2026'},pending:false}));state.operations.push({operationId:'unrelated',recordId:ids[2],state:'pending'});});
test('offline atomic batch changes exact IDs, deduplicates, persists queue after restart and preserves original date',async()=>{
 const operationId=crypto.randomUUID();assert.equal(await markCustomersAfsmSent(scope,[ids[0],ids[1],ids[0]],operationId),2);
 const state=await repository.read(scope);assert.equal(state.records[2].customer.afsmStatus,undefined);assert.equal(state.operations.length,3);assert.equal(state.records.length,3);
 const date=state.records[0].customer.afsmSentAt;
 assert.equal(await markCustomersAfsmSent(scope,[ids[0],ids[1]],operationId),0);assert.equal(await markCustomersAfsmSent(scope,[ids[0]],crypto.randomUUID()),0);
 assert.equal((await repository.read(scope)).records[0].customer.afsmSentAt,date);
 const {indexedDbRepository:reopened}=await import(compile(fs.readFileSync('src/platform/web/indexedDbRepository.ts','utf8')+'\n// reopened'));
 assert.equal((await reopened.read(scope)).operations.length,3);
});
test('explicit resend queues a new event; missing IDs roll back complete batch and preserve queue',async()=>{
 assert.equal(await markCustomersAfsmSent(scope,[ids[0]],crypto.randomUUID(),true),1);
 const before=await repository.read(scope);await assert.rejects(markCustomersAfsmSent(scope,[ids[1],crypto.randomUUID()],crypto.randomUUID()),/no longer/);assert.deepEqual(await repository.read(scope),before);
});
test('account switch, license denial and role denial reject updates with no data leak',async()=>{
 globalThis.__scope='user:tenant-b:connection';await assert.rejects(markCustomersAfsmSent(scope,[ids[0]],crypto.randomUUID()),/Workspace changed/);assert.equal((await repository.read(globalThis.__scope)).records.length,0);globalThis.__scope=scope;
 globalThis.__allowed=false;await assert.rejects(markCustomersAfsmSent(scope,[ids[0]],crypto.randomUUID()),/License/);globalThis.__allowed=true;
 session.set('bankSetuAccountRole','unknown');await assert.rejects(markCustomersAfsmSent(scope,[ids[0]],crypto.randomUUID()),/permission/);session.set('bankSetuAccountRole','client_user');
});
