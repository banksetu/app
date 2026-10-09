const fs=require('node:fs');
const path=require('node:path');
function resolveDataDirectory({userData,platform,executable,env}) {
  const hasDatabase=directory=>{try{return fs.statSync(path.join(directory,'customers.sqlite')).isFile();}catch(error){if(error.code==='ENOENT')return false;throw error;}};
  const personal=path.join(userData,'database');
  if(platform!=='win32')return personal;
  const pin=path.join(userData,'banksetu-database-location.json');
  if(fs.existsSync(pin)) {
    const saved=JSON.parse(fs.readFileSync(pin,'utf8'));
    if(typeof saved.directory!=='string'||!path.isAbsolute(saved.directory))throw Error('Invalid local database location. Existing storage was not changed.');
    if(!hasDatabase(saved.directory))throw Error(`Existing local database is unavailable at ${saved.directory}. Reconnect its drive; no empty replacement was created.`);
    return saved.directory;
  }
  const preferred=env.BANKSETU_DATA_DIR||path.join(path.parse(executable).root||'C:\\','Bank Setu Data');
  const legacy=path.join(env.ProgramData||'C:\\ProgramData','Bank Setu','Data');
  // Keep existing databases in place. Copying SQLite and WAL files separately
  // can produce an inconsistent migration; DPAPI data also belongs to its user.
  const candidates=[...new Set([preferred,legacy,path.join('C:\\','Bank Setu Data'),personal])].filter(hasDatabase);
  if(candidates.length>1&&!candidates.includes(preferred))throw Error('Multiple existing databases found. Select the original database folder; none was overwritten.');
  const existing=candidates.includes(preferred)?preferred:candidates[0];
  const directory=existing||personal;
  fs.mkdirSync(userData,{recursive:true});
  fs.writeFileSync(pin,JSON.stringify({directory,existing:true}),{flag:'wx'});
  return directory;
}
module.exports={resolveDataDirectory};
