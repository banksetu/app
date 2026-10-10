const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const FORMAT = 2;
const empty = () => ({records:[], operations:[]});
function validate(state) {
  if (!state || !Array.isArray(state.records) || !Array.isArray(state.operations)) throw Error('Invalid local workspace; original data was retained.');
  return state;
}
function createStore(directory, legacyCipher = {}) {
  fs.mkdirSync(directory, {recursive:true});
  const file=path.join(directory,'customers.sqlite');
  const db=new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS workspaces (scope TEXT PRIMARY KEY, payload BLOB NOT NULL); CREATE TABLE IF NOT EXISTS licensed_workspaces (scope TEXT PRIMARY KEY);');
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>FORMAT){db.close();throw Error('This database uses a newer storage format. Update Bank Setu; no data was changed.');}
  const integrity=db.prepare('PRAGMA quick_check').get();
  if(Object.values(integrity)[0]!=='ok'){db.close();throw Error('Local SQLite integrity check failed. Original database and pending work were retained.');}

  function snapshot(prefix, includeProfile=false) {
    const target=path.join(directory,`${prefix}-${randomUUID()}.sqlite`);
    if(includeProfile && legacyCipher.profilePath && !fs.existsSync(legacyCipher.profilePath))throw Error('Original Windows encryption profile is unavailable. Encrypted database was retained.');
    try {
      db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'");
      const check=new DatabaseSync(target);
      try {if(Object.values(check.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw Error('Backup integrity check failed.');}finally{check.close();}
      if(includeProfile && legacyCipher.profilePath)fs.copyFileSync(legacyCipher.profilePath,target+'.local-state',fs.constants.COPYFILE_EXCL);
      legacyCipher.backup?.(target);
      return target;
    } catch(error){throw new Error(`Verified backup could not be completed. Local database was retained: ${error.message}`,{cause:error});}
  }
  function decode(value) {
    if(value===undefined)return empty();
    if(typeof value==='string'){
      const data=JSON.parse(value);
      if(data.format!==FORMAT)throw Error('Unsupported local workspace format; original data was retained.');
      return validate(data.state);
    }
    if(!legacyCipher.decrypt)throw Error('An encrypted local database needs the original Windows profile; ciphertext was retained.');
    return validate(JSON.parse(legacyCipher.decrypt(Buffer.from(value))));
  }
  try {
    const rows=db.prepare('SELECT payload FROM workspaces').all();
    // Validate every scope before touching any legacy row. A wrong DPAPI key
    // cannot turn one scope into an empty workspace for another tenant.
    for(const row of rows)decode(row.payload);
    if(rows.some(row=>typeof row.payload!=='string')){
      snapshot('customers-before-plaintext-migration',true);
      db.exec('BEGIN IMMEDIATE');
      try {
        const update=db.prepare('UPDATE workspaces SET payload=? WHERE scope=?');
        for(const row of db.prepare('SELECT scope,payload FROM workspaces').all())if(typeof row.payload!=='string')
          update.run(JSON.stringify({format:FORMAT,state:decode(row.payload)}),row.scope);
        db.exec(`PRAGMA user_version=${FORMAT}`);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    } else if(version<FORMAT)db.exec(`PRAGMA user_version=${FORMAT}`);
  }catch(cause){
    let recoveryPath;
    try {recoveryPath=snapshot('customers-locked',true);}catch{}
    db.close();
    const error=new Error(`Local database could not be read at ${file}. Records and pending operations were retained. For encrypted data, use the original Windows account and Bank Setu profile.${recoveryPath?' Recovery copy: '+recoveryPath:''}`,{cause});
    error.code='LOCAL_DECRYPTION_FAILED';error.recoveryPath=recoveryPath;throw error;
  }
  const read=scope=>decode(db.prepare('SELECT payload FROM workspaces WHERE scope=?').get(scope)?.payload);
  const isLicensed=scope=>!!db.prepare('SELECT 1 FROM licensed_workspaces WHERE scope=?').get(scope);
  const commit=(scope,before,after,markLicensed=false)=>{
    validate(after);
    db.exec('BEGIN IMMEDIATE');
    try {
      if(JSON.stringify(read(scope))!==JSON.stringify(before))throw Error('Local data changed in another window. Retry this operation.');
      db.prepare('INSERT INTO workspaces(scope,payload) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload').run(scope,JSON.stringify({format:FORMAT,state:after}));
      if(markLicensed)db.prepare('INSERT OR IGNORE INTO licensed_workspaces(scope) VALUES(?)').run(scope);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  return {read,commit,isLicensed,backup(){
    const target=snapshot('customers-before-update');
    const legacy=path.join(directory,'customers-before-update.sqlite');
    if(!fs.existsSync(legacy))fs.copyFileSync(target,legacy,fs.constants.COPYFILE_EXCL);
    // Keep the stable first verified backup and the five most recent snapshots.
    const copies=fs.readdirSync(directory).filter(name=>/^customers-before-update-[\w-]+\.sqlite$/.test(name))
      .map(name=>({name,mtime:fs.statSync(path.join(directory,name)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime);
    for(const old of copies.slice(5))fs.unlinkSync(path.join(directory,old.name));
    return target;
  },close(){db.close();}};
}
module.exports={createStore};
