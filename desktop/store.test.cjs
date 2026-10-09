const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const {createStore}=require('./store.cjs');
test('SQLite transactions survive restart, reject stale commits, isolate scopes and preserve encrypted update backup',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-'));const key=crypto.randomBytes(32);
 const cipher={encrypt(value){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(value),c.final(),c.getAuthTag()]);},decrypt(value){const c=crypto.createDecipheriv('aes-256-gcm',key,value.subarray(0,12));c.setAuthTag(value.subarray(-16));return Buffer.concat([c.update(value.subarray(12,-16)),c.final()]).toString();}};
 let store=createStore(directory,cipher);const empty={records:[],operations:[]};const saved={records:[{name:'private-customer'}],operations:[{id:'pending'}]};store.commit('a',empty,saved);assert.throws(()=>store.commit('a',empty,empty),/changed/);assert.deepEqual(store.read('b'),empty);store.backup();store.close();
 store=createStore(directory,cipher);assert.deepEqual(store.read('a'),saved);store.close();assert(!fs.readFileSync(path.join(directory,'customers.sqlite')).includes(Buffer.from('private-customer')));assert(fs.existsSync(path.join(directory,'customers-before-update.sqlite')));fs.rmSync(directory,{recursive:true,force:true});
});

test('unreadable ciphertext is never an empty workspace or overwritten, and original keys recover pending data',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-locked-'));
 const cipher={encrypt:value=>Buffer.from('encrypted:'+value),decrypt:value=>{if(!value.toString().startsWith('encrypted:'))throw Error('bad payload');return value.toString().slice(10);}};
 const empty={records:[],operations:[]},saved={records:[{recordId:'kept',deleted:true}],operations:[{operationId:'delete-pending'}]};
 let store=createStore(directory,cipher);store.commit('tenant',empty,saved);store.backup();store.close();
 const before=fs.readFileSync(path.join(directory,'customers.sqlite'));
 store=createStore(directory,{encrypt(){throw Error('must not encrypt')},decrypt(){throw Error('DPAPI wrong Windows user')}});
 assert.throws(()=>store.read('tenant'),error=>error.code==='LOCAL_DECRYPTION_FAILED'&&/original Windows account/.test(error.message));
 assert.throws(()=>store.commit('tenant',empty,empty),/database is locked/);
 store.backup();store.close();
 assert.deepEqual(fs.readFileSync(path.join(directory,'customers.sqlite')),before);
 assert.equal(fs.readdirSync(directory).filter(name=>/^customers-before-update-/.test(name)).length,2);
 store=createStore(directory,cipher);assert.deepEqual(store.read('tenant'),saved);store.close();fs.rmSync(directory,{recursive:true,force:true});
});

test('Windows database selection stays pinned across reinstall on another drive and fails closed on denied access',()=>{
 const vm=require('node:vm');const source=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8');
 const start=source.indexOf('const resolveDataDirectory =');const end=source.indexOf('const trusted =',start);
 const files=new Map(),directories=new Set();const paths=path.win32;
 const fakeFs={existsSync:file=>files.has(file),mkdirSync:dir=>directories.add(dir),readFileSync:file=>files.get(file),writeFileSync:(file,data)=>files.set(file,data)};
 const context=vm.createContext({fs:fakeFs,path:paths,process:{platform:'win32',execPath:'C:\\Apps\\Bank Setu.exe',env:{}},app:{getPath:()=> 'C:\\Users\\Original\\AppData\\Bank Setu'},copyMissingFiles:()=>{throw Error('unexpected migration')}});
 vm.runInContext(source.slice(start,end)+';globalThis.resolveDirectory=resolveDataDirectory;',context);
 assert.equal(context.resolveDirectory(),'C:\\Bank Setu Data');
 files.set('C:\\Bank Setu Data\\customers.sqlite','encrypted');context.process.execPath='D:\\Apps\\Bank Setu.exe';
 assert.equal(context.resolveDirectory(),'C:\\Bank Setu Data');
 fakeFs.mkdirSync=()=>{throw Error('Access denied')};assert.throws(()=>context.resolveDirectory(),/Access denied/);
});
