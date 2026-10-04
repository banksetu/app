const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
function createStore(directory, cipher) {
  fs.mkdirSync(directory, {recursive:true});
  const db = new DatabaseSync(path.join(directory,'customers.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS workspaces (scope TEXT PRIMARY KEY, payload BLOB NOT NULL); PRAGMA user_version=1;');
  const decode = value => value ? JSON.parse(cipher.decrypt(Buffer.from(value))) : {records:[],operations:[]};
  const read = scope => decode(db.prepare('SELECT payload FROM workspaces WHERE scope=?').get(scope)?.payload);
  const commit = (scope,before,after) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (JSON.stringify(read(scope)) !== JSON.stringify(before)) throw new Error('Local data changed in another window. Retry this operation.');
      db.prepare('INSERT INTO workspaces(scope,payload) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload').run(scope,cipher.encrypt(JSON.stringify(after)));
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
  };
  return {read,commit,backup() {db.exec('PRAGMA wal_checkpoint(FULL)');fs.copyFileSync(path.join(directory,'customers.sqlite'),path.join(directory,'customers-before-update.sqlite'));},close(){db.close();}};
}
module.exports={createStore};
