const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createAppProtocol}=require('./app-protocol.cjs');
test('packaged protocol serves app and assets, rejects missing or escaped paths',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'banksetu-'));
 try{
 await fs.writeFile(path.join(root,'index.html'),'<html>Bank Setu</html>');
 await fs.writeFile(path.join(root,'main.js'),'export const ready=true');
 const handle=createAppProtocol(root);
 for(const pathname of ['/','/index.html']){const r=await handle({url:'banksetu://app'+pathname});assert.equal(r.status,200);assert.match(await r.text(),/Bank Setu/);}
 assert.match((await handle({url:'banksetu://app/main.js'})).headers.get('content-type'),/javascript/);
 assert.equal((await handle({url:'banksetu://app/missing.js'})).status,404);
 assert.equal((await handle({url:'banksetu://evil/index.html'})).status,403);
 assert.equal((await handle({url:'banksetu://app/..%2fsecret'})).status,403);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
