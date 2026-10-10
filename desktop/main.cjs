const {app,BrowserWindow,protocol,net,ipcMain,shell,safeStorage,clipboard,dialog} = require('electron');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const {createStore} = require('./store.cjs');
const ORIGIN='banksetu://app';
protocol.registerSchemesAsPrivileged([{scheme:'banksetu',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const primaryInstance=app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let window,store,downloaded=false;
const resolveDataDirectory = () => require('./data-directory.cjs').resolveDataDirectory({
  userData:app.getPath('userData'),platform:process.platform,executable:process.execPath,env:process.env
});
const trusted = event => {
  if(!window||window.isDestroyed())throw new Error("Application window is closed.");
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(ORIGIN+'/')) throw new Error('Untrusted application frame.');
};
const scopeCheck = scope => {if (typeof scope !== 'string' || !/^[A-Za-z0-9_:-]{10,250}$/.test(scope)) throw new Error('Invalid workspace scope.');};
if(primaryInstance)app.whenReady().then(async()=>{
  const dataDirectory = resolveDataDirectory();
  store=createStore(dataDirectory,{decrypt:value=>safeStorage.decryptString(value),...(process.platform==='win32'?{profilePath:path.join(app.getPath('userData'),'Local State')}:{})});
  const root=path.resolve(__dirname,'../dist');
  protocol.handle('banksetu',require('./app-protocol.cjs').createAppProtocol(root));
  window=new BrowserWindow({width:1280,height:850,minWidth:360,minHeight:600,title:'Bank Setu',icon:path.join(root,'icon-512.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  const printPreview=require('./print-preview.cjs').installPrintPreview({app,BrowserWindow,ipcMain,dialog:require('electron').dialog,parentWindow:window});
  printPreview.attach(window);
  // Customer print previews use document.write() into an about:blank window.
  // Allow only that local preview; it has no preload or database IPC privileges.
  window.webContents.setWindowOpenHandler(({url})=>{
    if (url === 'about:blank' || url === '') return {
      action:'allow',
      overrideBrowserWindowOptions:{
        show:false,width:1000,height:800,title:'Bank Setu Print Preview',
        webPreferences:{preload:path.join(__dirname,'print-source.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
      }
    };
    if (/^https:\/\/(?:docs\.google\.com|drive\.google\.com|script\.google\.com|github\.com)\//.test(url)) void shell.openExternal(url);
    if (/^https:\/\/banksetu-app\.web\.app\/license-request\/?(?:\?plan=(?:annual|lifetime|undecided))?$/.test(url)) void shell.openExternal(url);
    return {action:'deny'};
  });
  window.webContents.on('did-create-window',child=>{
    printPreview.attach(child);
    child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    child.webContents.on('will-navigate',(event,url)=>{if(url!=='about:blank')event.preventDefault();});
  });
  window.webContents.on('will-navigate',(event,url)=>{if (!url.startsWith(ORIGIN+'/')) event.preventDefault();});
  const cameraAllowed=(contents,permission,requestingUrl)=>
    permission==='media' && contents===window.webContents &&
    (requestingUrl===ORIGIN || requestingUrl.startsWith(ORIGIN+'/'));
  window.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>
    callback(cameraAllowed(contents,permission,details.requestingUrl||contents.getURL())));
  window.webContents.session.setPermissionCheckHandler((contents,permission,requestingOrigin)=>
    cameraAllowed(contents,permission,requestingOrigin||contents.getURL()));
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
  ipcMain.handle('clipboard:write-text',(event,value)=>{trusted(event);if(typeof value!=='string'||value.length>10000)throw new Error('Invalid clipboard text.');clipboard.writeText(value);});
  require('./share-preview.cjs').installPreviewShare({ipcMain,trusted,dialog,window,fs,shell});
  const {autoUpdater}=require('electron-updater');
  autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowDowngrade=false;
  autoUpdater.on('error',()=>{});autoUpdater.on('download-progress',progress=>{!window?.isDestroyed()&&window?.webContents.send('update:progress',{percent:Number(progress?.percent||0),transferred:Number(progress?.transferred||0),total:Number(progress?.total||0),bytesPerSecond:Number(progress?.bytesPerSecond||0)});});autoUpdater.on('update-downloaded',()=>{downloaded=true;!window?.isDestroyed()&&window?.webContents.send('update:ready',{ready:true});});
  const hasUpdateFeed=()=>app.isPackaged && fs.existsSync(path.join(process.resourcesPath,'app-update.yml'));
  const testUpdater=require('./testUpdater.cjs').createTestUpdater({fetch:net.fetch,current:app.getVersion(),manifestUrl:'https://banksetu-app.web.app/version.json',directory:path.join(app.getPath('userData'),'updates'),backup:()=>store.backup(),launch:async file=>{const error=await shell.openPath(file);if(error)throw new Error(error);app.quit();}});
  const assertUpdateFeed=()=>{
    if (!app.isPackaged || !hasUpdateFeed()) throw new Error('Windows update feed is not packaged. Install the production EXE release.');
  };
  ipcMain.handle('update:version',event=>{trusted(event);return app.getVersion();});
  ipcMain.handle('update:check',async event=>{
    trusted(event);if(!app.isPackaged)return testUpdater.check();assertUpdateFeed();downloaded=false;
    const result=await autoUpdater.checkForUpdates();const latestVersion=result?.updateInfo.version || app.getVersion();
    let changelog,releaseDate;
    try {
      const response=await net.fetch('https://banksetu-app.web.app/version.json',{signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(response.ok){const manifest=await response.json();if(manifest.windowsVersion===latestVersion && manifest.changelog?.windows?.version===latestVersion){changelog=manifest.changelog.windows;releaseDate=manifest.changelog.windows.releaseDate;}}
    }catch{/* Older or temporarily unavailable metadata must not block updates. */}
    const notes=typeof result?.updateInfo.releaseNotes==='string'?result.updateInfo.releaseNotes:'';
    return {latestVersion,notes,changelog,releaseDate};
  });
  ipcMain.handle('update:install',async event=>{trusted(event);if(!app.isPackaged)return testUpdater.install();assertUpdateFeed();store.backup();if(!downloaded)await autoUpdater.downloadUpdate();if(!downloaded)throw new Error('Update download was not verified.');store.backup();autoUpdater.quitAndInstall(false,true);});
  await window.loadURL(ORIGIN+'/index.html');
}).catch(error=>{require('electron').dialog.showErrorBox('Bank Setu startup failed',error.message);app.quit();});
app.on('second-instance',()=>{if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.focus();}});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>store?.close());
