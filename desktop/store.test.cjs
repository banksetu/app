const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createStore}=require('./store.cjs');
const fixture=()=>fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-sqlite-'));
const empty={records:[],operations:[]};
function legacy(directory,state){
  const db=new DatabaseSync(path.join(directory,'customers.sqlite'));
  db.exec('CREATE TABLE workspaces(scope TEXT PRIMARY KEY,payload BLOB NOT NULL); PRAGMA user_version=1');
  db.prepare('INSERT INTO workspaces VALUES(?,?)').run('tenant:owner',Buffer.from('cipher:'+JSON.stringify(state)));
  db.close();
}
const cipher={decrypt:value=>{assert(value.toString().startsWith('cipher:'));return value.toString().slice(7)}};
test('fresh SQLite stores readable versioned records and queued work atomically across restart',()=>{
  const directory=fixture();
  let store=createStore(directory);
  const state={records:[{id:'customer',scope:'tenant:owner'}],operations:[{id:'pending-delete',scope:'tenant:owner'}]};
  store.commit('tenant:owner',empty,state);
  assert.throws(()=>store.commit('tenant:owner',empty,empty),/changed/);
  assert.deepEqual(store.read('other-tenant'),empty);
  store.backup();store.close();
  const db=new DatabaseSync(path.join(directory,'customers.sqlite'));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
  assert.equal(db.prepare('SELECT typeof(payload) AS type FROM workspaces').get().type,'text');
  assert.deepEqual(JSON.parse(db.prepare('SELECT payload FROM workspaces').get().payload),{format:2,state});db.close();
  store=createStore(directory);assert.deepEqual(store.read('tenant:owner'),state);store.close();
  fs.rmSync(directory,{recursive:true,force:true});
});
test('decryptable legacy payload is migrated only after verified encrypted backup',()=>{
  const directory=fixture(),state={records:[{name:'old'}],operations:[{id:'pending'}]};legacy(directory,state);
  const store=createStore(directory,cipher);
  assert.deepEqual(store.read('tenant:owner'),state);
  const backup=fs.readdirSync(directory).find(name=>name.startsWith('customers-before-plaintext-migration-'));
  assert(backup);
  const old=new DatabaseSync(path.join(directory,backup));
  assert.equal(old.prepare('SELECT typeof(payload) AS type FROM workspaces').get().type,'blob');old.close();
  store.close();
  const reopened=createStore(directory);assert.deepEqual(reopened.read('tenant:owner'),state);reopened.close();
  fs.rmSync(directory,{recursive:true,force:true});
});
test('wrong key and backup failure preserve original ciphertext and pending work',()=>{
  for(const failure of ['key','backup']){
    const directory=fixture(),state={records:[{id:'saved'}],operations:[{id:'pending'}]};legacy(directory,state);
    const inspect=()=>{const db=new DatabaseSync(path.join(directory,'customers.sqlite'));const value=Buffer.from(db.prepare('SELECT payload FROM workspaces').get().payload);db.close();return value;};
    const original=inspect();
    assert.throws(()=>createStore(directory,failure==='key'?{decrypt(){throw Error('DPAPI wrong user')}}:{...cipher,backup(){throw Error('No space')}}),error=>error.code==='LOCAL_DECRYPTION_FAILED');
    assert.deepEqual(inspect(),original);
    const store=createStore(directory,cipher);assert.deepEqual(store.read('tenant:owner'),state);store.close();
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
test('Windows update and reinstall keep pinned database; backup is verified and unique',()=>{
  const {resolveDataDirectory}=require('./data-directory.cjs');
  const root=fixture(),shared=path.join(root,'old-shared'),userData=path.join(root,'original-user');fs.mkdirSync(shared);
  const args={userData,platform:'win32',executable:path.join(root,'install','app.exe'),env:{BANKSETU_DATA_DIR:shared,ProgramData:path.join(root,'program-data')}};
  const store=createStore(shared);store.commit('tenant:owner',empty,{records:[{id:'one'}],operations:[{id:'pending'}]});
  assert.equal(resolveDataDirectory(args),shared);
  const first=store.backup();const second=store.backup();assert.notEqual(first,second);store.close();
  assert.equal(resolveDataDirectory({...args,executable:path.join(root,'reinstall','app.exe'),env:{}}),shared);
  const reopened=createStore(shared);assert.equal(reopened.read('tenant:owner').operations[0].id,'pending');reopened.close();
  assert.equal(resolveDataDirectory({...args,userData:path.join(root,'another-user'),env:{ProgramData:path.join(root,'empty')}}),path.join(root,'another-user','database'));
  fs.rmSync(root,{recursive:true,force:true});
});
test('update backups retain the first good copy and bound rolling snapshots',()=>{
 const directory=fixture(),store=createStore(directory);
 store.commit('tenant:owner',empty,{records:[{id:'original'}],operations:[{id:'pending'}]});
 for(let i=0;i<9;i++)store.backup();store.close();
 const files=fs.readdirSync(directory);
 assert.equal(files.filter(name=>/^customers-before-update-[\w-]+\.sqlite$/.test(name)).length,5);
 const first=new DatabaseSync(path.join(directory,'customers-before-update.sqlite'));
 assert.equal(JSON.parse(first.prepare('SELECT payload FROM workspaces').get().payload).state.operations[0].id,'pending');first.close();
 fs.rmSync(directory,{recursive:true,force:true});
});
test('licensed workspace marker is atomic, survives restart and cannot be downgraded by an ordinary commit',()=>{
 const directory=fixture(),scope='user:tenant:connection';
 let store=createStore(directory);
 store.commit(scope,empty,{records:[{id:'one'}],operations:[]},true);
 assert.equal(store.isLicensed(scope),true);store.close();
 store=createStore(directory);
 assert.equal(store.isLicensed(scope),true);
 store.commit(scope,store.read(scope),{records:[{id:'one'}],operations:[]});
 assert.equal(store.isLicensed(scope),true);store.close();
 fs.rmSync(directory,{recursive:true,force:true});
});
test('first Windows install creates a writable App Data database and pins it only after creation',()=>{
  const {resolveDataDirectory,inspectDataDirectory,pinFirstInstall}=require('./data-directory.cjs');
  const root=fixture(),userData=path.join(root,'AppData'),args={userData,platform:'win32',executable:path.join(root,'app.exe'),env:{ProgramData:path.join(root,'system')}};
  assert.equal(inspectDataDirectory(args).kind,'first-install');
  const directory=resolveDataDirectory(args);
  assert.equal(fs.existsSync(path.join(userData,'banksetu-database-location.json')),false);
  const store=createStore(directory);store.close();pinFirstInstall(args,directory);
  assert.equal(resolveDataDirectory(args),directory);
  fs.rmSync(root,{recursive:true,force:true});
});
test('missing pinned database finds a verified backup, copies it, and retains the original pin and pending queue',()=>{
  const {resolveDataDirectory,inspectDataDirectory,initializeRecovery}=require('./data-directory.cjs');
  const root=fixture(),userData=path.join(root,'AppData'),old=path.join(root,'old'),args={userData,platform:'win32',executable:path.join(root,'app.exe'),env:{BANKSETU_DATA_DIR:old,ProgramData:path.join(root,'system')}};
  const original=createStore(old);original.commit('u:tenant:connection',empty,{records:[{recordId:'old'}],operations:[{operationId:'offline-only'}]});
  original.backup();original.close();resolveDataDirectory(args);
  const pin=fs.readFileSync(path.join(userData,'banksetu-database-location.json'),'utf8');
  fs.unlinkSync(path.join(old,'customers.sqlite'));
  const found=inspectDataDirectory(args);assert.equal(found.kind,'missing');assert(found.backups.length>0);
  const recovery=initializeRecovery(args,found.backups[0]);
  const copy=createStore(recovery.directory);assert.equal(copy.read('u:tenant:connection').operations[0].operationId,'offline-only');copy.close();recovery.activate();
  assert.equal(resolveDataDirectory(args),recovery.directory);
  assert.equal(fs.readFileSync(path.join(userData,'banksetu-database-location.json'),'utf8'),pin);
  // A returned original must not replace the explicitly selected recovery database.
  const returned=createStore(old);returned.close();
  assert.equal(resolveDataDirectory(args),recovery.directory);
  fs.rmSync(root,{recursive:true,force:true});
});
test('cloud recovery requires a missing old database and keeps a resumable marker across offline restart',()=>{
  const {resolveDataDirectory,inspectDataDirectory,initializeRecovery,recoveryFile}=require('./data-directory.cjs');
  const root=fixture(),userData=path.join(root,'AppData'),old=path.join(root,'old'),args={userData,platform:'win32',executable:path.join(root,'app.exe'),env:{BANKSETU_DATA_DIR:old,ProgramData:path.join(root,'system')}};
  const original=createStore(old);original.close();resolveDataDirectory(args);fs.unlinkSync(path.join(old,'customers.sqlite'));
  const result=initializeRecovery(args);
  const store=createStore(result.directory);
  const scope='u:tenant-a:connection-a';
  store.commit(scope,empty,{records:[{recordId:'part',revision:'r1'}],operations:[],pull:{cursor:250,seen:['part'],startedAt:Date.now()}});
  store.close();result.activate();
  assert.equal(resolveDataDirectory(args),result.directory);
  const restarted=createStore(result.directory);assert.equal(restarted.read(scope).pull.cursor,250);assert.deepEqual(restarted.read('u:tenant-b:connection-b'),empty);restarted.close();
  assert.equal(JSON.parse(fs.readFileSync(recoveryFile(result.directory),'utf8')).scopes[scope],undefined);
  assert.equal(inspectDataDirectory(args).kind,'recovery');
  fs.rmSync(root,{recursive:true,force:true});
});
test('a missing recovery database can be recovered again without erasing the original pin or earlier pointer',()=>{
  const {resolveDataDirectory,inspectDataDirectory,initializeRecovery}=require('./data-directory.cjs');
  const root=fixture(),userData=path.join(root,'AppData'),old=path.join(root,'old');
  const args={userData,platform:'win32',executable:path.join(root,'app.exe'),env:{BANKSETU_DATA_DIR:old,ProgramData:path.join(root,'system')}};
  const original=createStore(old);original.close();resolveDataDirectory(args);
  const originalPin=fs.readFileSync(path.join(userData,'banksetu-database-location.json'),'utf8');
  fs.unlinkSync(path.join(old,'customers.sqlite'));
  const first=initializeRecovery(args);const firstStore=createStore(first.directory);firstStore.close();first.activate();
  const previous=fs.readFileSync(path.join(userData,'banksetu-active-database.json'),'utf8');
  fs.unlinkSync(path.join(first.directory,'customers.sqlite'));
  assert.equal(inspectDataDirectory(args).kind,'missing');
  const next=initializeRecovery(args);const nextStore=createStore(next.directory);nextStore.close();next.activate();
  assert.equal(resolveDataDirectory(args),next.directory);
  assert.equal(fs.readFileSync(path.join(userData,'banksetu-database-location.json'),'utf8'),originalPin);
  const history=fs.readdirSync(userData).filter(name=>/^banksetu-active-database-[\w-]+\.json$/.test(name));
  assert.equal(history.length,1);
  assert.equal(fs.readFileSync(path.join(userData,history[0]),'utf8'),previous);
  assert(fs.existsSync(first.directory));
  fs.rmSync(root,{recursive:true,force:true});
});
test('Search Again keeps recovery available until the old database is reconnected',()=>{
  const {resolveDataDirectory,rescanDataDirectory}=require('./data-directory.cjs');
  const root=fixture(),userData=path.join(root,'AppData'),old=path.join(root,'old');
  const args={userData,platform:'win32',executable:path.join(root,'app.exe'),env:{BANKSETU_DATA_DIR:old,ProgramData:path.join(root,'system')}};
  const original=createStore(old);original.close();resolveDataDirectory(args);
  fs.unlinkSync(path.join(old,'customers.sqlite'));
  assert.equal(rescanDataDirectory(args),null);
  assert.equal(rescanDataDirectory(args),null);
  const returned=createStore(old);returned.close();
  assert.equal(rescanDataDirectory(args),old);
  fs.rmSync(root,{recursive:true,force:true});
});
test('a reinstall with a surviving Windows profile and no pin cannot silently create empty storage',()=>{
  const {resolveDataDirectory}=require('./data-directory.cjs');
  const root=fixture(),userData=path.join(root,'AppData');fs.mkdirSync(path.join(userData,'IndexedDB'),{recursive:true});
  const args={userData,platform:'win32',executable:path.join(root,'app.exe'),env:{ProgramData:path.join(root,'system')}};
  assert.throws(()=>resolveDataDirectory(args),error=>error.code==='MISSING_DATABASE');
  assert.equal(fs.existsSync(path.join(userData,'database','customers.sqlite')),false);
  fs.rmSync(root,{recursive:true,force:true});
});
