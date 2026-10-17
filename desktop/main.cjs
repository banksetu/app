const {app,BrowserWindow,protocol,net,ipcMain,shell,safeStorage,clipboard,dialog,Notification,Tray,Menu} = require('electron');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const {createStore} = require('./store.cjs');
const {createLicenseAuthority} = require('./license-guard.cjs');
const ORIGIN='banksetu://app';
protocol.registerSchemesAsPrivileged([{scheme:'banksetu',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const primaryInstance=app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let window,store,background,tray,openMain,quitting=false,downloaded=false;
const directoryOptions = () => ({
  userData:app.getPath('userData'),platform:process.platform,executable:process.execPath,env:process.env
});
const {resolveDataDirectory,rescanDataDirectory,inspectDataDirectory,initializeRecovery,recoveryFile,pinFirstInstall}=require('./data-directory.cjs');
const trusted = event => {
  if(!window||window.isDestroyed())throw new Error("Application window is closed.");
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(ORIGIN+'/')) throw new Error('Untrusted application frame.');
};
const scopeCheck = scope => {if (typeof scope !== 'string' || !/^[A-Za-z0-9_:-]{10,250}$/.test(scope)) throw new Error('Invalid workspace scope.');};
if(primaryInstance)app.whenReady().then(async()=>{
  if(process.platform==='win32')app.setAppUserModelId('in.banksetu.desktop');
  let dataDirectory;
  const options=directoryOptions();
  try{dataDirectory=resolveDataDirectory(options);}
  catch(error){
    if(error.code!=='MISSING_DATABASE')throw error;
    while(!dataDirectory){
      dataDirectory=rescanDataDirectory(options);
      if(dataDirectory)break;
      const found=inspectDataDirectory(options);
      if(found.candidates.length>1)throw Error('Multiple existing local databases were found. Select the original folder with support; no database was changed.');
      const choices=['Search Again',...(found.backups.length?['Restore Verified Local Backup']:[]),'Create New Local Database & Restore from Google Cloud','Quit'];
      const selection=dialog.showMessageBoxSync({type:'warning',title:'Bank Setu local database recovery',message:'The previous Windows local database was not found.',detail:`Original location: ${found.original}\nVerified local backups: ${found.backups.length}\nReconnect a missing drive or recover a verified backup before starting with a new database. Google Sheets/Drive can restore synchronized customers and photos. Offline-only changes and unuploaded pending operations in the missing database may be unrecoverable.`,buttons:choices,defaultId:0,cancelId:choices.length-1,noLink:true});
      if(choices[selection]==='Search Again')continue;
      if(selection<0||choices[selection]==='Quit')return app.quit();
      const backup=choices[selection]==='Restore Verified Local Backup'?found.backups[0]:undefined;
      const confirmed=dialog.showMessageBoxSync({type:'warning',title:'Confirm Bank Setu recovery',message:backup?'Restore a copy of the verified local backup?':'Create New Local Database & Restore from Google Cloud?',detail:'The original database, configured path, encryption profile, pending queue and backups will remain untouched. Cloud recovery requires login and verification of the correct tenant. Changes that never reached Google or a backup may be unrecoverable.',buttons:['Cancel','Confirm Recovery'],defaultId:0,cancelId:0,noLink:true});
      if(confirmed!==1)return app.quit();
      const recovery=initializeRecovery(options,backup);
      dataDirectory=recovery.directory;
      try{
        store=createStore(dataDirectory,{decrypt:value=>safeStorage.decryptString(value),...(process.platform==='win32'?{profilePath:path.join(app.getPath('userData'),'Local State')}:{})});
        recovery.activate();
      }catch(cause){store?.close();throw cause;}
    }
  }
  if(!store)store=createStore(dataDirectory,{decrypt:value=>safeStorage.decryptString(value),...(process.platform==='win32'?{profilePath:path.join(app.getPath('userData'),'Local State')}:{})});
  pinFirstInstall(options,dataDirectory);
  const publicKey=require('../src/generated/licensePublicKey.json');
  const licenseAuthority=createLicenseAuthority(publicKey,store);
  ipcMain.handle('license:session',(event,uid)=>{trusted(event);if(typeof uid!=='string'||uid.length>128)throw Error('Invalid session.');licenseAuthority.session(uid);if(background?.status().uid&&background.status().uid!==uid)background.clear();});
  ipcMain.handle('license:status',(event,signed)=>{trusted(event);licenseAuthority.status(signed);});
  ipcMain.handle('license:receipt',(event,signed)=>{trusted(event);licenseAuthority.acceptReceipt(signed);});
  const validPdf = encoded => {
    if(typeof encoded!=='string'||encoded.length>40_000_000||!/^[A-Za-z0-9+/=]+$/.test(encoded))throw Error('Invalid PDF data.');
    const bytes=Buffer.from(encoded,'base64');
    if(bytes.length<5||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF file.');
    return bytes;
  };
  ipcMain.handle('customer-pdf:save',async(event,encoded)=>{
    trusted(event);licenseAuthority.protectedAction();const bytes=validPdf(encoded);
    const choice=await dialog.showSaveDialog(window,{defaultPath:path.join(app.getPath('documents'),'BankSetu-customers.pdf'),filters:[{name:'PDF document',extensions:['pdf']}]});
    if(choice.canceled||!choice.filePath)return {cancelled:true};
    await fs.promises.writeFile(choice.filePath,bytes,{flag:'w'});return {saved:true};
  });
  ipcMain.handle('customer-pdf:open',async(event,encoded)=>{
    trusted(event);licenseAuthority.protectedAction();const bytes=validPdf(encoded);
    const directory=path.join(app.getPath('userData'),'pdf-previews');await fs.promises.mkdir(directory,{recursive:true,mode:0o700});
    const file=path.join(directory,`BankSetu-customers-${Date.now()}-${require('node:crypto').randomBytes(8).toString('hex')}.pdf`);
    await fs.promises.writeFile(file,bytes,{flag:'wx',mode:0o600});
    try{const result=await shell.openPath(file);if(result)throw Error(result);setTimeout(()=>void fs.promises.unlink(file).catch(()=>{}),300000);return {opened:true};}
    catch(error){await fs.promises.unlink(file).catch(()=>{});throw error;}
  });
  const root=path.resolve(__dirname,'../dist');
  protocol.handle('banksetu',require('./app-protocol.cjs').createAppProtocol(root));
  ipcMain.handle('system-notification:show',(event,value)=>{
    trusted(event);
    if(!value||!['update','sync','network','license'].includes(value.category)||!['dashboard','sync-backup','license-management'].includes(value.page)||typeof value.title!=='string'||typeof value.body!=='string'||value.title.length>100||value.body.length>250)throw Error('Invalid system notification.');
    if(process.platform!=='win32'||!Notification.isSupported())return false;
    const notice=new Notification({title:value.title,body:value.body,silent:false});
    notice.on('click',()=>{if(openMain)void openMain(value.page);});
    notice.show();return true;
  });
  const printPreview=require('./print-preview.cjs').installPrintPreview({app,BrowserWindow,ipcMain,dialog:require('electron').dialog,getParentWindow:()=>window,authorize:()=>licenseAuthority.protectedAction()});
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
  const recoveryMarker=recoveryFile(dataDirectory);
  const recoveryState=()=>fs.existsSync(recoveryMarker)?JSON.parse(fs.readFileSync(recoveryMarker,'utf8')):null;
  ipcMain.handle('local:recovery-status',(event,scope)=>{
    trusted(event);scopeCheck(scope);
    const marker=recoveryState(),state=store.read(scope);
    return {pending:!!marker&&!marker.scopes?.[scope],downloaded:state.records.filter(record=>!record.deleted&&!!record.revision).length,cursor:state.pull?.cursor||0,completed:!!state.pull?.lastCompletedAt,originalFound:!!marker?.original&&fs.existsSync(path.join(marker.original,'customers.sqlite'))};
  });
  ipcMain.handle('local:recovery-complete',(event,scope,expectedCount,revision)=>{
    trusted(event);scopeCheck(scope);
    const marker=recoveryState();
    if(!marker||marker.scopes?.[scope])return false;
    const state=store.read(scope);
    if(!Number.isSafeInteger(expectedCount)||expectedCount<0||!revision||state.pull?.remoteRevision!==revision||!state.pull.lastCompletedAt||state.pull.cursor||state.pull.changePending||
       state.records.filter(record=>!record.deleted&&!!record.revision).length!==expectedCount)
      throw Error('Cloud recovery has not been fully verified; resume the download before normal upload.');
    const next={...marker,scopes:{...marker.scopes,[scope]:{completedAt:Date.now(),revision,records:expectedCount}}};
    const temp=recoveryMarker+'.'+require('node:crypto').randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(next),{flag:'wx',mode:0o600});fs.renameSync(temp,recoveryMarker);
    return true;
  });
  ipcMain.handle('local:read',(event,scope)=>{trusted(event);scopeCheck(scope);return store.read(scope);});
  ipcMain.handle('local:commit',(event,scope,before,after,receipt)=>{
    trusted(event);scopeCheck(scope);
    if (!before || !after || !Array.isArray(after.records) || !Array.isArray(after.operations) || JSON.stringify(after).length>100*1024*1024) throw new Error('Invalid local transaction.');
    if ([...after.records,...after.operations].some(value=>value.scope!==scope)) throw new Error('Cross-workspace transaction rejected.');
    const licensed=licenseAuthority.commit(scope,receipt);
    store.commit(scope,before,after,licensed);
  });
  ipcMain.handle('clipboard:write-text',(event,value)=>{trusted(event);if(typeof value!=='string'||value.length>10000)throw new Error('Invalid clipboard text.');clipboard.writeText(value);});
  require('./share-preview.cjs').installPreviewShare({ipcMain,trusted,dialog,getWindow:()=>window,fs,shell});
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
  openMain=async(page)=>{
    if(window&&!window.isDestroyed()){window.show();window.focus();if(page)window.webContents.send('system-notification:open',page);return;}
  window=new BrowserWindow({width:1280,height:850,minWidth:360,minHeight:600,title:'Bank Setu',icon:path.join(root,'icon-512.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
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
    window.on('closed',()=>{window=null;});
    await window.loadURL(ORIGIN+'/index.html');
    if(page)window.webContents.send('system-notification:open',page);
  };
  const notificationFile=path.join(app.getPath('userData'),'background-notifications.enc');
  const saveSession=value=>{if(value){if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');fs.writeFileSync(notificationFile,safeStorage.encryptString(JSON.stringify(value)),{mode:0o600});}else{try{fs.unlinkSync(notificationFile);}catch{}}};
  background=require('./background-notifications.cjs').createBackgroundNotifications({fetch:net.fetch,currentVersion:app.getVersion(),read:()=>JSON.parse(safeStorage.decryptString(fs.readFileSync(notificationFile))),write:saveSession,notify:value=>{
    if(window&&!window.isDestroyed()&&window.isVisible())return;
    if(!Notification.isSupported())return;
    const notice=new Notification({title:value.title,body:value.body,icon:path.join(root,'icon-512.png')});notice.on('click',()=>void openMain(value.page));notice.show();
  },onRevoked:()=>{if(!window&&!quitting)app.quit();}});
  const ensureTray=()=>{if(process.platform!=='win32'||tray)return;tray=new Tray(path.join(root,'icon-512.png'));tray.setToolTip('Bank Setu · Background notifications');tray.on('double-click',()=>void openMain());tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Bank Setu',click:()=>void openMain()},{label:'Disable background notifications',click:()=>{background.clear();tray.destroy();tray=null;if(!window)app.quit();}},{type:'separator'},{label:'Quit Bank Setu (stop notifications)',click:()=>{quitting=true;app.quit();}}]));};
  ipcMain.handle('background:status',event=>{trusted(event);return background.status();});
  ipcMain.handle('background:bind',(event,value)=>{trusted(event);if(process.platform!=='win32')throw Error('Background notifications are supported on Windows.');background.bind(value);ensureTray();return background.status();});
  ipcMain.handle('background:clear',event=>{trusted(event);background.clear();if(tray){tray.destroy();tray=null;}return background.status();});
  if(background.status().enabled)ensureTray();
  await openMain();

}).catch(error=>{require('electron').dialog.showErrorBox('Bank Setu startup failed',error.message);app.quit();});
app.on('second-instance',()=>{if(openMain)void openMain();});
app.on('window-all-closed',()=>{if(quitting||!background?.status().enabled)app.quit();});
app.on('before-quit',()=>{quitting=true;background?.stop();tray?.destroy();store?.close();});
