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
  assert.deepEqual(createStore(directory).read('tenant:owner'),state);
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
  assert.equal(createStore(shared).read('tenant:owner').operations[0].id,'pending');
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
