import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import ts from'typescript';
const text=ts.transpileModule(readFileSync('src/core/supportDeletes.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const source=text.replace(/import \{ auth \} from ['"]\.\.\/firebase['"];?/,"const auth=globalThis.__supportDeleteTest.auth;").replace(/import \{ callBankSetuWorker \} from ['"]\.\.\/workerApi['"];?/,"const callBankSetuWorker=(...args)=>globalThis.__supportDeleteTest.send(...args);");

test('durable deletion queue preserves offline/failed work, isolates accounts, deduplicates and drains additions during a request',async()=>{
 const originals=Object.fromEntries(['window','localStorage','navigator','__supportDeleteTest'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const values=new Map(),calls=[];let failing=false,release;
 try{
  Object.defineProperty(globalThis,'window',{value:new EventTarget(),configurable:true});Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},configurable:true});
  globalThis.__supportDeleteTest={auth:{currentUser:{uid:'sender'}},send:async(route,body)=>{calls.push({route,...body});if(failing)throw Error('temporary failure');if(release)await new Promise(resolve=>{release.resolve=resolve;});}};
  const queue=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const first={clientUid:'client',messageId:'photo-1'},second={clientUid:'client',messageId:'audio-1'};
  queue.queueSupportDelete('sender','tenant',first);queue.queueSupportDelete('sender','tenant',first);assert.equal(queue.pendingSupportDeletes('sender','tenant').length,1);assert.equal(queue.pendingSupportDeletes('sender','other').length,0);
  await queue.flushSupportDeletes('sender','tenant');assert.equal(calls.length,0);assert.equal(queue.pendingSupportDeletes('sender','tenant').length,1);
  navigator.onLine=true;failing=true;await assert.rejects(queue.flushSupportDeletes('sender','tenant'),/temporary failure/);assert.equal(queue.pendingSupportDeletes('sender','tenant').length,1);
  failing=false;release={};const flight=queue.flushSupportDeletes('sender','tenant');assert.equal(queue.flushSupportDeletes('sender','tenant'),flight);queue.queueSupportDelete('sender','tenant',second);
  const unblock=release.resolve;release=undefined;unblock();await flight;assert.deepEqual(queue.pendingSupportDeletes('sender','tenant'),[]);assert.equal(calls.at(-1).messageId,'audio-1');
  queue.queueSupportDelete('sender','tenant',first);globalThis.__supportDeleteTest.auth.currentUser.uid='other';await queue.flushSupportDeletes('sender','tenant');assert.equal(queue.pendingSupportDeletes('sender','tenant').length,1);assert.throws(()=>queue.queueSupportDelete('sender','tenant',second),/session changed/);
  globalThis.__supportDeleteTest.auth.currentUser.uid='sender';const restart=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// restarted app').toString('base64'));await restart.flushSupportDeletes('sender','tenant');assert.equal(restart.pendingSupportDeletes('sender','tenant').length,0);
 }finally{for(const[k,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k];}}
});
