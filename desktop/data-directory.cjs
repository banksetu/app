const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const locationFile=userData=>path.join(userData,'banksetu-database-location.json');
const activeFile=userData=>path.join(userData,'banksetu-active-database.json');
const recoveryFile=directory=>path.join(directory,'cloud-recovery.json');
function readLocation(file) {
  if(!fs.existsSync(file))return null;
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(typeof data.directory!=='string'||!path.isAbsolute(data.directory))throw Error('Invalid local database location. Existing storage was not changed.');
  return data.directory;
}
function hasDatabase(directory) {
  try{return fs.statSync(path.join(directory,'customers.sqlite')).isFile();}
  catch(error){if(error.code==='ENOENT')return false;throw error;}
}
function directories({userData,executable,env}) {
  const preferred=env.BANKSETU_DATA_DIR||path.join(path.parse(executable).root||'C:\\','Bank Setu Data');
  const legacy=path.join(env.ProgramData||'C:\\ProgramData','Bank Setu','Data');
  return [...new Set([preferred,legacy,path.join('C:\\','Bank Setu Data'),path.join(userData,'database')])];
}
function verifiedBackups(places) {
  const result=[];
  for(const directory of places){
    let names=[];try{names=fs.readdirSync(directory);}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}
    for(const name of names){
      if(!/^customers-(?:before-update|before-plaintext-migration)-[\w-]+\.sqlite$/.test(name)&&name!=='customers-before-update.sqlite')continue;
      const file=path.join(directory,name);
      try{
        if(!fs.statSync(file).isFile())continue;
        const db=new DatabaseSync(file,{readOnly:true});
        try{if(Object.values(db.prepare('PRAGMA quick_check').get())[0]==='ok'&&db.prepare("SELECT name FROM sqlite_master WHERE name='workspaces'").get())result.push(file);}
        finally{db.close();}
      }catch{/* An invalid backup stays untouched, but is not offered for recovery. */}
    }
  }
  return result.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
}
function inspectDataDirectory(options) {
  const {userData,platform}=options;
  const personal=path.join(userData,'database');
  if(platform!=='win32')return {directory:personal,kind:'normal'};
  const active=readLocation(activeFile(userData));
  if(active){
    if(hasDatabase(active))return {directory:active,kind:'recovery'};
    const pinned=readLocation(locationFile(userData));
    const places=[...new Set([active,...(pinned?[pinned]:[]),...directories(options)])];
    return {kind:'missing',original:active,candidates:places.filter(hasDatabase),backups:verifiedBackups(places),previousRecovery:true};
  }
  const pinned=readLocation(locationFile(userData));
  if(pinned&&hasDatabase(pinned))return {directory:pinned,kind:'normal'};
  const places=[...new Set([...(pinned?[pinned]:[]),...directories(options)])];
  const candidates=places.filter(hasDatabase),backups=verifiedBackups(places);
  if(pinned){
    if(candidates.length===1)return {directory:candidates[0],kind:'relocated',original:pinned};
    return {kind:'missing',original:pinned,candidates,backups};
  }
  if(candidates.length===1)return {directory:candidates[0],kind:'normal'};
  if(candidates.length>1||backups.length)return {kind:'missing',original:'Previous local storage',candidates,backups};
  // Reinstallers can lose the pin together with the SQLite file. An existing
  // Chromium profile is evidence of earlier use, but the directory itself
  // may already exist on a genuine first launch.
  if(['IndexedDB','Local Storage'].some(name=>fs.existsSync(path.join(userData,name))))
    return {kind:'missing',original:'Previous Windows profile (location unknown)',candidates:[],backups:[]};
  return {directory:personal,kind:'first-install'};
}
function resolveDataDirectory(options) {
  const result=inspectDataDirectory(options);
  if(result.kind==='missing'){
    const error=Error('Previous local database is unavailable. Review the detected locations and backups before creating new storage.');
    error.code='MISSING_DATABASE';error.recovery=result;throw error;
  }
  if(options.platform==='win32'){
    fs.mkdirSync(options.userData,{recursive:true});
    if(result.kind==='relocated')fs.writeFileSync(activeFile(options.userData),JSON.stringify({directory:result.directory,original:result.original}),{flag:'wx'});
    else if(!fs.existsSync(locationFile(options.userData))&&result.kind==='normal')
      fs.writeFileSync(locationFile(options.userData),JSON.stringify({directory:result.directory,existing:result.kind!=='first-install'}),{flag:'wx'});
  }
  return result.directory;
}
function rescanDataDirectory(options){
  if(inspectDataDirectory(options).kind==='missing')return null;
  return resolveDataDirectory(options);
}
function pinFirstInstall(options,directory){
  if(options.platform!=='win32'||fs.existsSync(locationFile(options.userData)))return;
  if(directory!==path.join(options.userData,'database')||!hasDatabase(directory))throw Error('First installation database was not created; location was not pinned.');
  fs.writeFileSync(locationFile(options.userData),JSON.stringify({directory,existing:true}),{flag:'wx',mode:0o600});
}
function initializeRecovery(options,backup) {
  const inspection=inspectDataDirectory(options);
  if(inspection.kind!=='missing')throw Error('A usable database was found; recovery creation was cancelled.');
  if(backup&&!inspection.backups.includes(backup))throw Error('Backup is not a verified recovery candidate.');
  const directory=path.join(options.userData,`recovered-database-${randomUUID()}`);
  fs.mkdirSync(directory,{recursive:false,mode:0o700});
  if(backup)fs.copyFileSync(backup,path.join(directory,'customers.sqlite'),fs.constants.COPYFILE_EXCL);
  else fs.writeFileSync(recoveryFile(directory),JSON.stringify({version:1,startedAt:Date.now(),original:inspection.original,scopes:{}}),{flag:'wx',mode:0o600});
  // The original pin and backup are never overwritten.
  return {directory,activate:()=>{
    const file=activeFile(options.userData);
    const content=JSON.stringify({directory,original:inspection.original,backup:backup||null});
    if(!fs.existsSync(file)){fs.writeFileSync(file,content,{flag:'wx',mode:0o600});return;}
    // A second recovery keeps the previous pointer for investigation. Only
    // replace the active pointer after both the new store and history exist.
    const history=path.join(options.userData,`banksetu-active-database-${randomUUID()}.json`);
    fs.copyFileSync(file,history,fs.constants.COPYFILE_EXCL);
    const temporary=path.join(options.userData,`banksetu-active-database-${randomUUID()}.tmp`);
    try{fs.writeFileSync(temporary,content,{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}
    finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }};
}
module.exports={resolveDataDirectory,rescanDataDirectory,inspectDataDirectory,initializeRecovery,recoveryFile,pinFirstInstall};
