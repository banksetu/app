import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled=ts.transpileModule(fs.readFileSync('src/platform/updatePolling.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {startUpdatePolling}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
function harness(){
 const target=new EventTarget(),doc=new EventTarget();
 doc.visibilityState='visible';let startup,periodic;
 target.setTimeout=fn=>(startup=fn,1);target.setInterval=fn=>(periodic=fn,2);
 target.clearTimeout=()=>{startup=null;};target.clearInterval=()=>{periodic=null;};
 return {target,doc,start:()=>startup?.(),tick:()=>periodic?.()};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('startup offline recovers on reconnect; resume and periodic checks discover later releases',async()=>{
 const h=harness();let online=false,calls=0;
 const stop=startUpdatePolling(async()=>{calls++;},h.target,h.doc,()=>online);
 h.start();await flush();assert.equal(calls,0);
 online=true;h.target.dispatchEvent(new Event('online'));await flush();assert.equal(calls,1);
 h.doc.visibilityState='hidden';h.tick();await flush();assert.equal(calls,1);
 h.doc.visibilityState='visible';h.doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(calls,2);
 h.tick();await flush();assert.equal(calls,3);
 stop();h.target.dispatchEvent(new Event('focus'));h.tick();await flush();assert.equal(calls,3);
});
test('failed check retries and overlapping wake events do not duplicate a request',async()=>{
 const h=harness();let calls=0,release;
 const stop=startUpdatePolling(async()=>{calls++;if(calls===1)throw Error('offline');await new Promise(resolve=>{release=resolve;});},h.target,h.doc,()=>true);
 h.start();await flush();h.target.dispatchEvent(new Event('online'));await flush();
 h.target.dispatchEvent(new Event('focus'));h.tick();await flush();assert.equal(calls,2);
 release();await flush();stop();
});
