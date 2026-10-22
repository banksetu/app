// Isolated real Windows DPAPI migration fixture; never opens production userData.
const {app,safeStorage}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {createStore}=require('./store.cjs');
const saved={records:[{recordId:'fixture',customer:{name:'DPAPI fixture'},deleted:true}],operations:[{operationId:'fixture-delete',state:'pending'}]};
// Child fixtures get a dedicated Chromium key profile. A running parent must
// never race them to persist a different OSCrypt key in the same Local State.
if(process.argv[2]==='write'||process.argv[2]==='read'){
 const profile=path.join(process.argv[3],'profile');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
}
const timer=setTimeout(()=>app.exit(1),30000);
app.whenReady().then(async()=>{
 if(process.argv[2]==='write'||process.argv[2]==='read'){
  assert(safeStorage.isEncryptionAvailable());
  if(process.argv[2]==='write'){
   const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(process.argv[3],'customers.sqlite'));
   db.exec('CREATE TABLE workspaces(scope TEXT PRIMARY KEY,payload BLOB NOT NULL); PRAGMA user_version=1');
   db.prepare('INSERT INTO workspaces VALUES(?,?)').run('fixture',safeStorage.encryptString(JSON.stringify(saved)));db.close();
   return;
  }
  const store=createStore(process.argv[3],{decrypt:value=>safeStorage.decryptString(value),profilePath:path.join(app.getPath('userData'),'Local State')});
  assert.deepEqual(store.read('fixture'),saved);store.backup();
  store.close();return;
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-dpapi-'));
 try{
  for(const mode of ['write','read','read'])await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[__filename,mode,directory],{stdio:'inherit'});
   child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('DPAPI fixture process failed: '+code)));
  });
  console.log('Windows DPAPI fixture migrated with a verified backup; plaintext SQLite survives independent restarts with pending deletion intact.');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}).then(()=>{clearTimeout(timer);app.quit()}).catch(error=>{console.error(error);clearTimeout(timer);app.exit(1)});
