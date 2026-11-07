import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const compile=source=>"data:text/javascript;base64,"+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString("base64");
const states=new Map();
globalThis.__ssaRepository={
  async read(scope){return structuredClone(states.get(scope)||{records:[],operations:[]});},
  async transact(scope,change){const next=structuredClone(states.get(scope)||{records:[],operations:[]});change(next);states.set(scope,next);}
};
globalThis.__ssaScope="user-a:tenant-a:connection-a";
globalThis.__ssaAuth={currentUser:{uid:"user-a",getIdToken:async()=>"token"}};
globalThis.__ssaLicense=async()=>{};
globalThis.__ssaFetch=async()=>{throw new Error("Network must not be used by offline queue tests.");};
globalThis.window=new EventTarget();
const storage=new Map([["bankSetuConnectionMode","option-b"]]);
globalThis.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
Object.defineProperty(globalThis,"navigator",{value:{onLine:false},configurable:true});

let source=fs.readFileSync("src/core/ssaCampaign.ts","utf8")
  .replace('import { auth } from "../firebase";','const auth=globalThis.__ssaAuth;')
  .replace('import { requireLicensedWrite } from "./licenseAccess";','const requireLicensedWrite=globalThis.__ssaLicense;')
  .replace('import { customerRepository } from "./customerRepository";','const customerRepository=globalThis.__ssaRepository;')
  .replace('import { identity, localDataFetch } from "./localData";','const identity=()=>globalThis.__ssaScope;const localDataFetch=globalThis.__ssaFetch;');
const ssa=await import(compile(source));
const customerRecordId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draft=(entryDate="2026-11-07",overrides={})=>({entryDate,customerRecordId,customerId:"CUST-1",accountNo:"000123",name:"Synthetic Customer",apy:true,pmjjby:false,pmsby:false,...overrides});

test("offline SSA create/update persists in the existing tenant queue",async()=>{
  states.clear();storage.set("bankSetuConnectionMode","option-b");
  const created=await ssa.queueSsaCampaignEntry(draft(),"create");
  let state=await globalThis.__ssaRepository.read(globalThis.__ssaScope);
  assert.equal(state.ssaEntries.length,1);assert.equal(state.ssaOperations.length,1);
  assert.equal(state.ssaOperations[0].mode,"create");assert.equal(created.pending,true);
  const updated=await ssa.queueSsaCampaignEntry(draft("2026-11-08",{apy:false,pmjjby:true}),"update",created.entryId);
  state=await globalThis.__ssaRepository.read(globalThis.__ssaScope);
  assert.equal(state.ssaEntries.length,1);assert.equal(state.ssaOperations.length,2);
  assert.equal(state.ssaOperations[1].mode,"update");assert.equal(updated.pmjjby,true);
  const visible=await ssa.localSsaCampaignEntries();assert.equal(visible[0].pending,true);
});

test("SSA prevents same-account monthly duplicates but permits another month",async()=>{
  states.clear();storage.set("bankSetuConnectionMode","option-b");
  await ssa.queueSsaCampaignEntry(draft(),"create");
  await assert.rejects(ssa.queueSsaCampaignEntry(draft("2026-11-30"),"create"),/already has an SSA entry/);
  await ssa.queueSsaCampaignEntry(draft("2026-12-01"),"create");
  assert.equal((await ssa.localSsaCampaignEntries()).length,2);
});

test("demo and tenant switching keep SSA queues isolated",async()=>{
  states.clear();storage.set("bankSetuConnectionMode","demo");
  const demo=await ssa.queueSsaCampaignEntry(draft(),"create");
  assert.equal(demo.pending,false);assert.equal((await globalThis.__ssaRepository.read(globalThis.__ssaScope)).ssaOperations.length,0);
  globalThis.__ssaScope="user-a:tenant-b:connection-b";storage.set("bankSetuConnectionMode","option-b");
  assert.equal((await ssa.localSsaCampaignEntries()).length,0);
  await ssa.queueSsaCampaignEntry(draft(),"create");
  assert.equal((await ssa.localSsaCampaignEntries()).length,1);
  globalThis.__ssaScope="user-a:tenant-a:connection-a";
  assert.equal((await ssa.localSsaCampaignEntries()).length,1);
});
