const {test}=require('node:test');const assert=require('node:assert/strict');
const {selectAsset,newer,findLatestReleaseAsset,findLatestWindowsAsset,createTestUpdater}=require('./testUpdater.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const bytes=Buffer.alloc(1000000,3);
const release={tag_name:'v1.0.5',assets:[{state:'uploaded',name:'Bank Setu Setup 1.0.5.exe',size:bytes.length,digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),browser_download_url:'https://github.com/banksetu/app/releases/download/v1.0.5/BankSetu.exe'}]};
test('test updater refuses foreign sources, missing checksums, downgrades and prereleases',()=>{
 assert.equal(newer('1.0.5','1.0.4'),true);assert.equal(newer('1.0.4','1.0.5'),false);
 assert.equal(selectAsset({...release,prerelease:true},'1.0.4'),null);
 assert.throws(()=>selectAsset({...release,assets:[{...release.assets[0],browser_download_url:'https://github.com/other/app/releases/download/v1.0.5/a.exe'}]},'1.0.4'));
 assert.throws(()=>selectAsset({...release,assets:[{...release.assets[0],digest:null}]},'1.0.4'));
 assert.equal(selectAsset({tag_name:'v1.0.6',assets:[{state:'uploaded',name:'BankSetu-Android-1000006.apk'}]},'1.0.4'),null);
});
test('test updater chooses the newest stable Windows asset across releases',()=>{
 const older={...release,tag_name:'v1.0.5'};
 const newerRelease={...release,tag_name:'v1.0.7',assets:[{...release.assets[0],name:'BankSetu-Setup-1.0.7-x64.exe',browser_download_url:'https://github.com/banksetu/app/releases/download/v1.0.7/BankSetu-Setup-1.0.7-x64.exe'}]};
 assert.equal(findLatestWindowsAsset([{tag_name:'v1.0.6',assets:[{state:'uploaded',name:'BankSetu-Android-1000006.apk'}]},older,newerRelease],'1.0.4').version,'1.0.7');
});
test('macOS updater accepts only the versioned ARM64 DMG and ignores Windows and universal files',()=>{
 const mac={...release,assets:[{...release.assets[0],name:'BankSetu-1.0.5-arm64.dmg',browser_download_url:'https://github.com/banksetu/app/releases/download/v1.0.5/BankSetu-1.0.5-arm64.dmg'}]};
 assert.equal(selectAsset(mac,'1.0.4','mac').version,'1.0.5');
 assert.equal(selectAsset(release,'1.0.4','mac'),null);
 assert.equal(selectAsset({...mac,assets:[{...mac.assets[0],name:'BankSetu-1.0.5-universal.dmg'}]},'1.0.4','mac'),null);
 assert.equal(selectAsset({...mac,assets:[{...mac.assets[0],name:'BankSetu-11.0.5-arm64.dmg'}]},'1.0.4','mac'),null);
 assert.equal(findLatestReleaseAsset([release,mac],'1.0.4','mac').url,mac.assets[0].browser_download_url);
});
test('test updater verifies downloaded bytes and backs up before launching; corrupted download never launches',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'banksetu-update-'));let corrupt=false;const events=[];
 const updater=createTestUpdater({current:'1.0.4',directory,fetch:async url=>url.includes('api.github.com')?Response.json(release):new Response(corrupt?Buffer.alloc(bytes.length,9):bytes),backup:()=>events.push('backup'),launch:async()=>events.push('launch')});
 try{await updater.install();assert.deepEqual(events,['backup','launch']);corrupt=true;await assert.rejects(updater.install(),/checksum/);assert.equal(events.length,2);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('macOS updater follows macVersion and downloads the verified DMG',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'banksetu-mac-update-'));const events=[];
 const mac={...release,assets:[{...release.assets[0],name:'BankSetu-1.0.5-arm64.dmg',browser_download_url:'https://github.com/banksetu/app/releases/download/v1.0.5/BankSetu-1.0.5-arm64.dmg'}]};
 const updater=createTestUpdater({current:'1.0.4',directory,platform:'mac',manifestUrl:'https://banksetu-app.web.app/version.json',fetch:async url=>url.includes('version.json')?Response.json({macVersion:'1.0.5'}):url.includes('api.github.com')?Response.json([mac]):new Response(bytes),backup:()=>events.push('backup'),launch:async file=>events.push(path.extname(file))});
 try{assert.equal((await updater.check()).latestVersion,'1.0.5');await updater.install();assert.deepEqual(events,['backup','.dmg']);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
