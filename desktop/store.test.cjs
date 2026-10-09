const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const {createStore}=require('./store.cjs');
test('SQLite transactions survive restart, reject stale commits, isolate scopes and preserve encrypted update backup',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-'));const key=crypto.randomBytes(32);
 const cipher={encrypt(value){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(value),c.final(),c.getAuthTag()]);},decrypt(value){const c=crypto.createDecipheriv('aes-256-gcm',key,value.subarray(0,12));c.setAuthTag(value.subarray(-16));return Buffer.concat([c.update(value.subarray(12,-16)),c.final()]).toString();}};
 let store=createStore(directory,cipher);const empty={records:[],operations:[]};const saved={records:[{name:'private-customer'}],operations:[{id:'pending'}]};store.commit('a',empty,saved);assert.throws(()=>store.commit('a',empty,empty),/changed/);assert.deepEqual(store.read('b'),empty);store.backup();store.close();
 store=createStore(directory,cipher);assert.deepEqual(store.read('a'),saved);store.close();assert(!fs.readFileSync(path.join(directory,'customers.sqlite')).includes(Buffer.from('private-customer')));assert(fs.existsSync(path.join(directory,'customers-before-update.sqlite')));fs.rmSync(directory,{recursive:true,force:true});
});
test('wrong DPAPI key fails closed, preserves ciphertext and pending queue and creates an encrypted recovery snapshot',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-locked-'));
 const cipher={encrypt:value=>Buffer.from('cipher:'+value),decrypt:value=>{assert(value.toString().startsWith('cipher:'));return value.toString().slice(7)}};
 const saved={records:[{name:'retained'}],operations:[{id:'pending-delete',action:'deleteCustomer'}]};
 let store=createStore(directory,cipher);store.commit('owner',{records:[],operations:[]},saved);store.backup();store.close();
 const original=fs.readFileSync(path.join(directory,'customers.sqlite'));
 let recovery;
 assert.throws(()=>createStore(directory,{...cipher,decrypt(){throw Error('DPAPI wrong user')}}),error=>{
   assert.equal(error.code,'LOCAL_DECRYPTION_FAILED');assert.match(error.message,/No records or pending operations were reset/);recovery=error.recoveryPath;return true;
 });
 assert(recovery);assert.deepEqual(fs.readFileSync(path.join(directory,'customers.sqlite')),original);
 store=createStore(directory,cipher);assert.deepEqual(store.read('owner'),saved);store.close();
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(recovery);assert.deepEqual(JSON.parse(cipher.decrypt(Buffer.from(db.prepare('SELECT payload FROM workspaces').get().payload))),saved);db.close();
 assert(fs.existsSync(path.join(directory,'customers-before-update.sqlite')));fs.rmSync(directory,{recursive:true,force:true});
});
test('Windows restart, update and reinstall keep the pinned database; fresh users use their own directory',()=>{
 const {resolveDataDirectory}=require('./data-directory.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-location-'));
 const shared=path.join(root,'old-shared'),userData=path.join(root,'original-user');fs.mkdirSync(shared);fs.writeFileSync(path.join(shared,'customers.sqlite'),'existing fixture');
 const args={userData,platform:'win32',executable:path.join(root,'install','app.exe'),env:{BANKSETU_DATA_DIR:shared,ProgramData:path.join(root,'program-data')}};
 assert.equal(resolveDataDirectory(args),shared);
 assert.equal(resolveDataDirectory({...args,executable:path.join(root,'reinstall','app.exe'),env:{}}),shared);
 const fresh=resolveDataDirectory({...args,userData:path.join(root,'other-user'),env:{ProgramData:path.join(root,'empty')}});
 assert.equal(fresh,path.join(root,'other-user','database'));
 fs.renameSync(path.join(shared,'customers.sqlite'),path.join(shared,'preserved.sqlite'));
 assert.throws(()=>resolveDataDirectory(args),/no empty replacement/);
 assert(fs.existsSync(path.join(shared,'preserved.sqlite')));fs.rmSync(root,{recursive:true,force:true});
});

test('encrypted update backups are unique and never replace an earlier backup',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-backups-'));
 const cipher={encrypt:value=>Buffer.from(value),decrypt:value=>value.toString()};
 const store=createStore(directory,cipher),empty={records:[],operations:[]};
 store.commit('scope',empty,{records:[{id:'original'}],operations:[]});store.backup();
 const first=fs.readFileSync(path.join(directory,'customers-before-update.sqlite'));
 store.commit('scope',store.read('scope'),{records:[{id:'updated'}],operations:[{id:'retained'}]});store.backup();store.close();
 assert.deepEqual(fs.readFileSync(path.join(directory,'customers-before-update.sqlite')),first);
 assert.equal(fs.readdirSync(directory).filter(name=>/^customers-before-update-/.test(name)).length,2);
 fs.rmSync(directory,{recursive:true,force:true});
});
test('Windows update backup retains the encrypted key profile and blocks an incomplete backup',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-profile-')),profile=path.join(directory,'Local State');
 const fixture=JSON.stringify({os_crypt:{encrypted_key:'encrypted-fixture-key'}});fs.writeFileSync(profile,fixture);
 const store=createStore(directory,{encrypt:value=>Buffer.from(value),decrypt:value=>value.toString(),profilePath:profile});
 store.commit('scope',{records:[],operations:[]},{records:[{id:'retained'}],operations:[{id:'pending'}]});store.backup();
 const copy=fs.readdirSync(directory).find(name=>name.endsWith('.local-state'));assert.equal(fs.readFileSync(path.join(directory,copy),'utf8'),fixture);
 fs.renameSync(profile,profile+'.retained');assert.throws(()=>store.backup(),/encryption profile is unavailable/);
 assert.equal(store.read('scope').operations[0].id,'pending');store.close();fs.rmSync(directory,{recursive:true,force:true});
});

test('update snapshot retains encrypted key context and a failed key backup prevents update completion',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-keybackup-'));
 const cipher={encrypt:value=>Buffer.from(value),decrypt:value=>value.toString(),backup:target=>fs.writeFileSync(target+'.Local-State','DPAPI-protected-key',{flag:'wx'})};
 let store=createStore(directory,cipher);store.backup();store.backup();store.close();
 assert.equal(fs.readdirSync(directory).filter(name=>name.endsWith('.Local-State')).length,2);
 store=createStore(directory,{...cipher,backup:()=>{throw Error('Key context unavailable')}});assert.throws(()=>store.backup(),/Key context unavailable/);store.close();
 assert.equal(fs.readdirSync(directory).filter(name=>name.endsWith('.Local-State')).length,2);fs.rmSync(directory,{recursive:true,force:true});
});
