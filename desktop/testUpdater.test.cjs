const {test}=require('node:test');const assert=require('node:assert/strict');
const {selectAsset,newer,createTestUpdater}=require('./testUpdater.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const bytes=Buffer.alloc(1000000,3);
const release={tag_name:'v1.0.5',assets:[{state:'uploaded',name:'Bank Setu Setup 1.0.5.exe',size:bytes.length,digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),browser_download_url:'https://github.com/banksetu/app/releases/download/v1.0.5/BankSetu.exe'}]};
test('test updater refuses foreign sources, missing checksums, downgrades and prereleases',()=>{
 assert.equal(newer('1.0.5','1.0.4'),true);assert.equal(newer('1.0.4','1.0.5'),false);
 assert.equal(selectAsset({...release,prerelease:true},'1.0.4'),null);
 assert.throws(()=>selectAsset({...release,assets:[{...release.assets[0],browser_download_url:'https://github.com/other/app/releases/download/v1.0.5/a.exe'}]},'1.0.4'));
 assert.throws(()=>selectAsset({...release,assets:[{...release.assets[0],digest:null}]},'1.0.4'));
});
test('test updater verifies downloaded bytes and backs up before launching; corrupted download never launches',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'banksetu-update-'));let corrupt=false;const events=[];
 const updater=createTestUpdater({current:'1.0.4',directory,fetch:async url=>url.includes('api.github.com')?Response.json(release):new Response(corrupt?Buffer.alloc(bytes.length,9):bytes),backup:()=>events.push('backup'),launch:async()=>events.push('launch')});
 try{await updater.install();assert.deepEqual(events,['backup','launch']);corrupt=true;await assert.rejects(updater.install(),/checksum/);assert.equal(events.length,2);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
