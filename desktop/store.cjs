const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
function createStore(directory, cipher) {
  fs.mkdirSync(directory, {recursive:true});
  const db = new DatabaseSync(path.join(directory,'customers.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS workspaces (scope TEXT PRIMARY KEY, payload BLOB NOT NULL);');
  if(db.prepare('PRAGMA user_version').get().user_version===0)db.exec('PRAGMA user_version=1');
  let recoveryPath;
  const decode = value => {
    if (value === undefined) return {records:[],operations:[]};
    try {
      const state=JSON.parse(cipher.decrypt(Buffer.from(value)));
      if (!Array.isArray(state.records)||!Array.isArray(state.operations)) throw Error('Invalid encrypted workspace.');
      return state;
    } catch (cause) {
      // SQLite makes a consistent encrypted snapshot, including committed WAL
      // pages. Never overwrite the original or the before-update backup.
      if (!recoveryPath) {
        const target=path.join(directory,`customers-locked-${require('node:crypto').randomUUID()}.sqlite`);
        try {db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'");recoveryPath=target;} catch {}
      }
      const error=new Error(`Encrypted local database is locked at ${path.join(directory,'customers.sqlite')}. No records or pending operations were reset. Open Bank Setu using the original Windows account, computer and Bank Setu encryption profile (Local State). Missing original profile keys or another Windows user/computer can make this ciphertext unrecoverable.${recoveryPath?' Encrypted recovery copy: '+recoveryPath: ' The original encrypted database is retained; recovery copy could not be created.'}`,{cause});
      error.code='LOCAL_DECRYPTION_FAILED';error.recoveryPath=recoveryPath;throw error;
    }
  };
  // Fail closed for the whole store: an unreadable old scope must never appear
  // to be a fresh installation merely because another user has a new scope.
  try {for(const row of db.prepare('SELECT payload FROM workspaces').all())decode(row.payload);}
  catch(error){db.close();throw error;}
  const read = scope => decode(db.prepare('SELECT payload FROM workspaces WHERE scope=?').get(scope)?.payload);
  const commit = (scope,before,after) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (JSON.stringify(read(scope)) !== JSON.stringify(before)) throw new Error('Local data changed in another window. Retry this operation.');
      db.prepare('INSERT INTO workspaces(scope,payload) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload').run(scope,cipher.encrypt(JSON.stringify(after)));
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
  };
  return {read,commit,backup() {
    const checkpoint=db.prepare('PRAGMA wal_checkpoint(FULL)').get();
    if(checkpoint.busy)throw new Error('Database backup is busy. Retry the update; local data was retained.');
    const target=path.join(directory,'customers-before-update-'+require('node:crypto').randomUUID()+'.sqlite');
    if(cipher.profilePath&&!fs.existsSync(cipher.profilePath))throw Error('Windows encryption profile is unavailable for backup. Restart with the original Bank Setu profile before updating; local data is retained.');
    fs.copyFileSync(path.join(directory,'customers.sqlite'),target,fs.constants.COPYFILE_EXCL);
    if(cipher.profilePath)fs.copyFileSync(cipher.profilePath,target+'.local-state',fs.constants.COPYFILE_EXCL);
    cipher.backup?.(target);
    const legacy=path.join(directory,'customers-before-update.sqlite');
    if(!fs.existsSync(legacy))fs.copyFileSync(target,legacy,fs.constants.COPYFILE_EXCL);
  },close(){db.close();}};
}
module.exports={createStore};
