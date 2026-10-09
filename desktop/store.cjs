const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
function createStore(directory, cipher) {
  fs.mkdirSync(directory, {recursive:true});
  const db = new DatabaseSync(path.join(directory,'customers.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS workspaces (scope TEXT PRIMARY KEY, payload BLOB NOT NULL);');
  if(db.prepare('PRAGMA user_version').get().user_version===0)db.exec('PRAGMA user_version=1');
  const decode = value => {
    if (value === undefined) return {records:[],operations:[]};
    try {
      const state = JSON.parse(cipher.decrypt(Buffer.from(value)));
      if (!state || !Array.isArray(state.records) || !Array.isArray(state.operations)) throw new Error('Invalid encrypted workspace.');
      return state;
    } catch (cause) {
      const error = new Error('Local database is locked: encrypted data could not be read. The database and pending queue were retained at '+directory+'. Open Bank Setu with the original Windows account on the original computer (without switching user / Run as another user). If its Windows encryption keys are unavailable, this ciphertext cannot be recovered; use a verified backup. Do not delete or reset local storage.', {cause});
      error.code = 'LOCAL_DECRYPTION_FAILED';
      throw error;
    }
  };
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
    fs.copyFileSync(path.join(directory,'customers.sqlite'),target,fs.constants.COPYFILE_EXCL);
    const legacy=path.join(directory,'customers-before-update.sqlite');
    if(!fs.existsSync(legacy))fs.copyFileSync(target,legacy,fs.constants.COPYFILE_EXCL);
  },close(){db.close();}};
}
module.exports={createStore};
