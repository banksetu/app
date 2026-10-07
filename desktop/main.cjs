const {app,BrowserWindow,protocol,net,ipcMain,shell,safeStorage} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {createStore} = require('./store.cjs');
const ORIGIN='banksetu://app';
protocol.registerSchemesAsPrivileged([{scheme:'banksetu',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
if (!app.requestSingleInstanceLock()) app.quit();
let window,store,downloaded=false;
const trusted = event => {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(ORIGIN+'/')) throw new Error('Untrusted application frame.');
};
const scopeCheck = scope => {if (typeof scope !== 'string' || !/^[A-Za-z0-9_:-]{10,250}$/.test(scope)) throw new Error('Invalid workspace scope.');};
app.whenReady().then(async()=>{
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable. Local database is locked.');
  store=createStore(path.join(app.getPath('userData'),'database'),{encrypt:value=>safeStorage.encryptString(value),decrypt:value=>safeStorage.decryptString(value)});
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
  ipcMain.handle('local:read',(event,scope)=>{trusted(event);scopeCheck(scope);return store.read(scope);});
  ipcMain.handle('local:commit',(event,scope,before,after)=>{
    trusted(event);scopeCheck(scope);
    if (!before || !after || !Array.isArray(after.records) || !Array.isArray(after.operations) || JSON.stringify(after).length>100*1024*1024) throw new Error('Invalid local transaction.');
    if ([...after.records,...after.operations].some(value=>value.scope!==scope)) throw new Error('Cross-workspace transaction rejected.');
    store.commit(scope,before,after);
  });
  const {autoUpdater}=require('electron-updater');
  autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowDowngrade=false;
  autoUpdater.on('error',()=>{});autoUpdater.on('update-downloaded',()=>{downloaded=true;});
  const hasSignedRelease=()=>{
    const config=path.join(process.resourcesPath,'app-update.yml');
    return app.isPackaged && fs.existsSync(config) && /^publisherName:/m.test(fs.readFileSync(config,'utf8'));
  };
  const testUpdater=require('./testUpdater.cjs').createTestUpdater({fetch:net.fetch,current:app.getVersion(),directory:path.join(app.getPath('userData'),'updates'),backup:()=>store.backup(),launch:async file=>{const error=await shell.openPath(file);if(error)throw new Error(error);app.quit();}});
  const assertSignedRelease=()=>{
    const config=path.join(process.resourcesPath,'app-update.yml');
    if (!app.isPackaged || !fs.existsSync(config) || !/^publisherName:/m.test(fs.readFileSync(config,'utf8'))) throw new Error('Signed Windows release configuration is required before automatic updates.');
  };
  ipcMain.handle('update:version',event=>{trusted(event);return app.getVersion();});
  ipcMain.handle('update:check',async event=>{trusted(event);if(app.isPackaged&&!hasSignedRelease())return testUpdater.check();assertSignedRelease();const result=await autoUpdater.checkForUpdates();return {latestVersion:result?.updateInfo.version || app.getVersion(),notes:'Verified Windows update feed.'};});
  ipcMain.handle('update:install',async event=>{trusted(event);if(app.isPackaged&&!hasSignedRelease())return testUpdater.install();assertSignedRelease();store.backup();if(!downloaded)await autoUpdater.downloadUpdate();if(!downloaded)throw new Error('Update download was not verified.');store.backup();autoUpdater.quitAndInstall(false,true);});
  await window.loadURL(ORIGIN+'/index.html');
}).catch(error=>{require('electron').dialog.showErrorBox('Bank Setu startup failed',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>store?.close());
