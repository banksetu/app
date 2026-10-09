// Real Windows safeStorage fixtures only; never opens production userData.
const {app,safeStorage}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {createStore}=require('./store.cjs');
const saved={records:[{recordId:'fixture',customer:{name:'DPAPI fixture'},deleted:true}],operations:[{operationId:'fixture-delete',state:'pending'}]};
const timer=setTimeout(()=>app.exit(1),30000);
app.whenReady().then(async()=>{
 if(process.argv[2]==='write'||process.argv[2]==='read'){
  assert(safeStorage.isEncryptionAvailable());
  const store=createStore(process.argv[3],{encrypt:value=>safeStorage.encryptString(value),decrypt:value=>safeStorage.decryptString(value)});
  if(process.argv[2]==='write'){store.commit('fixture',{records:[],operations:[]},saved);store.backup();}
  else assert.deepEqual(store.read('fixture'),saved);
  store.close();return;
 }
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-dpapi-'));
 try{
  for(const mode of ['write','read','read'])await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[__filename,mode,directory],{stdio:'inherit'});
   child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('DPAPI fixture process failed: '+code)));
  });
  console.log('Windows safeStorage encrypted fixture survives independent app restarts with pending deletion intact.');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}).then(()=>{clearTimeout(timer);app.exit(0)}).catch(error=>{console.error(error);clearTimeout(timer);app.exit(1)});
