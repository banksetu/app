const {app,BrowserWindow,protocol,net,ipcMain,shell,safeStorage} = require('electron');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {createStore} = require('./store.cjs');
const ORIGIN='banksetu://app';
protocol.registerSchemesAsPrivileged([{scheme:'banksetu',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
if (!app.requestSingleInstanceLock()) app.quit();
let window,store,downloaded=false;
const copyMissingFiles = (source, target) => {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) copyMissingFiles(from, to);
    else if (!fs.existsSync(to)) fs.copyFileSync(from, to);
  }
};
const resolveDataDirectory = () => {
  if (process.platform !== 'win32') return path.join(app.getPath('userData'), 'database');
  const legacy = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Bank Setu', 'Data');
  const selectedDrive = path.parse(process.execPath).root || 'C:\\';
  const preferred = process.env.BANKSETU_DATA_DIR || path.join(selectedDrive, 'Bank Setu Data');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    // Keep the legacy folder intact; copy only missing files so migration is recoverable.
    if (path.resolve(preferred).toLowerCase() !== path.resolve(legacy).toLowerCase()
      && fs.existsSync(path.join(legacy, 'customers.sqlite'))
      && !fs.existsSync(path.join(preferred, 'customers.sqlite'))) {
      copyMissingFiles(legacy, preferred);
      fs.writeFileSync(path.join(preferred, 'data-location.json'), JSON.stringify({
        migratedFrom: legacy, selectedDrive, version: 1
      }, null, 2));
    }
    return preferred;
  } catch {
    try { fs.mkdirSync(legacy, { recursive: true }); return legacy; }
    catch { return path.join(app.getPath('userData'), 'database'); }
  }
};
const trusted = event => {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(ORIGIN+'/')) throw new Error('Untrusted application frame.');
};
const scopeCheck = scope => {if (typeof scope !== 'string' || !/^[A-Za-z0-9_:-]{10,250}$/.test(scope)) throw new Error('Invalid workspace scope.');};
app.whenReady().then(async()=>{
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable. Local database is locked.');
  const dataDirectory = resolveDataDirectory();
  store=createStore(dataDirectory,{encrypt:value=>safeStorage.encryptString(value),decrypt:value=>safeStorage.decryptString(value)});
  const root=path.resolve(__dirname,'../dist');
  protocol.handle('banksetu',request=>{
    const url=new URL(request.url);
    if (url.host!=='app') return new Response('Forbidden',{status:403});
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if (!target.startsWith(root+path.sep)) return new Response('Forbidden',{status:403});
    const file=fs.existsSync(target)&&fs.statSync(target).isFile()?target:path.join(root,'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });
  window=new BrowserWindow({width:1280,height:850,minWidth:360,minHeight:600,title:'Bank Setu',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(({url})=>{if (/^https:\/\/(?:docs\.google\.com|drive\.google\.com|script\.google\.com|github\.com)\//.test(url)) void shell.openExternal(url);return {action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if (!url.startsWith(ORIGIN+'/')) event.preventDefault();});
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  const directoryBytes = directory => {
    let total = 0;
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) total += directoryBytes(target);
        else if (entry.isFile()) total += fs.statSync(target).size;
      }
    } catch {}
    return total;
  };
  const localStorageInfo = () => {
    const userData = dataDirectory;
    const databasePath = dataDirectory;
    let freeBytes = null;
    let totalBytes = null;
    try {
      const stat = fs.statfsSync(userData);
      freeBytes = Number(stat.bavail) * Number(stat.bsize);
      totalBytes = Number(stat.blocks) * Number(stat.bsize);
    } catch {}
    if (freeBytes === null && process.platform === 'win32') {
      try {
        const drive = path.parse(userData).root.slice(0, 1);
        const command = "$d=Get-PSDrive -Name '" + drive + "'; [Console]::WriteLine(\"$($d.Free)|$($d.Used+$d.Free)\")";
        const result = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim().split('|');
        freeBytes = Number(result[0]) || null;
        totalBytes = Number(result[1]) || null;
      } catch {}
    }
    return { path: userData, databasePath, usedBytes: directoryBytes(databasePath), freeBytes, totalBytes };
  };
  ipcMain.handle('local:storage',(event)=>{trusted(event);return localStorageInfo();});
  ipcMain.handle('local:read',(event,scope)=>{trusted(event);scopeCheck(scope);return store.read(scope);});
  ipcMain.handle('local:commit',(event,scope,before,after)=>{
    trusted(event);scopeCheck(scope);
    if (!before || !after || !Array.isArray(after.records) || !Array.isArray(after.operations) || JSON.stringify(after).length>100*1024*1024) throw new Error('Invalid local transaction.');
    if ([...after.records,...after.operations].some(value=>value.scope!==scope)) throw new Error('Cross-workspace transaction rejected.');
    store.commit(scope,before,after);
  });
  const {autoUpdater}=require('electron-updater');
  autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowDowngrade=false;
  autoUpdater.on('error',()=>{});autoUpdater.on('download-progress',progress=>{window?.webContents.send('update:progress',{percent:Number(progress?.percent||0),transferred:Number(progress?.transferred||0),total:Number(progress?.total||0),bytesPerSecond:Number(progress?.bytesPerSecond||0)});});autoUpdater.on('update-downloaded',()=>{downloaded=true;window?.webContents.send('update:ready',{ready:true});});
  const hasUpdateFeed=()=>app.isPackaged && fs.existsSync(path.join(process.resourcesPath,'app-update.yml'));
  const testUpdater=require('./testUpdater.cjs').createTestUpdater({fetch:net.fetch,current:app.getVersion(),manifestUrl:'https://banksetu-app.web.app/version.json',directory:path.join(app.getPath('userData'),'updates'),backup:()=>store.backup(),launch:async file=>{const error=await shell.openPath(file);if(error)throw new Error(error);app.quit();}});
  const assertUpdateFeed=()=>{
    if (!app.isPackaged || !hasUpdateFeed()) throw new Error('Windows update feed is not packaged. Install the production EXE release.');
  };
  ipcMain.handle('update:version',event=>{trusted(event);return app.getVersion();});
  ipcMain.handle('update:check',async event=>{trusted(event);if(!app.isPackaged)return testUpdater.check();assertUpdateFeed();downloaded=false;const result=await autoUpdater.checkForUpdates();return {latestVersion:result?.updateInfo.version || app.getVersion(),notes:'Verified Windows update feed.'};});
  ipcMain.handle('update:install',async event=>{trusted(event);if(!app.isPackaged)return testUpdater.install();assertUpdateFeed();store.backup();if(!downloaded)await autoUpdater.downloadUpdate();if(!downloaded)throw new Error('Update download was not verified.');store.backup();autoUpdater.quitAndInstall(false,true);});
  await window.loadURL(ORIGIN+'/index.html');
}).catch(error=>{require('electron').dialog.showErrorBox('Bank Setu startup failed',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>store?.close());
