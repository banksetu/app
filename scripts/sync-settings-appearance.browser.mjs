import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';

process.chdir(resolve(import.meta.dirname,'..'));
fs.mkdirSync('test-evidence',{recursive:true});
const row={recordId:'synthetic-record',name:'Synthetic Customer',accountNo:'0001234',enrolId:'SAMPLE001',createdAt:'2026-10-20T08:00:00Z'};
const status={records:1,pending:0,conflicts:0,downloading:false,cacheLimited:false,syncing:false,paused:false,lastCompletedAt:1,error:'',mediaPending:0,photoIndexComplete:true};
const dataMock=`const row=${JSON.stringify(row)};export const localModeEnabled=()=>true;
 export const getLocalStatus=async()=>({...${JSON.stringify(status)},error:window.testSyncError||''});
 export const getLocalSnapshot=async()=>({records:[{recordId:row.recordId,customer:row}],operations:[]});
 export const getLocalExportCustomers=async()=>[row];export const getDataIdToken=async()=> 'synthetic';
 export const getConflicts=async()=>[];export const getConnectionHealth=()=>({state:'healthy',history:[]});
 export const syncNow=async()=>{};export const pauseSync=()=>{};export const resumeSync=()=>{};
 export const resolveConflict=async()=>{};export const getPhotoSyncDiagnostics=async()=>[];
 export const clearTemporaryLocalData=async()=>0;export const resetLocalDatabase=async()=>0;
 export const exportLocalBackup=async()=>{};export const restoreLocalBackup=async()=>{};export const diagnoseSyncBridge=async()=>({});
 export const localDataFetch=async(_url,options)=>({ok:true,json:async()=>JSON.parse(options.body).action==='getAuditLog'?{success:true,activities:[{id:'event',dateTime:'2026-10-20T08:00:00Z',activity:'Customer Updated',customerName:row.name,accountNo:row.accountNo,details:'Synthetic details',user:'Synthetic User'}]}:{success:true,totalRows:0,customers:[]}});`;
const mocks={
 './core/localData':dataMock,
 './tenantApi':`export const getTenantApiUrl=()=>'/synthetic';`,
 './firebase':`export const auth={currentUser:{uid:'synthetic-admin',email:'synthetic@example.test',emailVerified:true}};export const db={};`,
 'firebase/auth':`export const getAuth=()=>({currentUser:{uid:'synthetic-admin'}});`,
 'firebase/firestore':`export const doc=(_db,path,id)=>({path,id});export const collection=(_db,path)=>({path});export const where=()=>({});export const query=(ref)=>ref;
 export const getDoc=async ref=>({exists:()=>true,data:()=>ref.path==='tenants'?{status:'active'}:{role:new URLSearchParams(location.search).get('role')||'master_owner',tenantId:'synthetic-tenant'}});
 export const getDocs=async ref=>({docs:ref.path==='tenants'?[{id:'synthetic-tenant',data:()=>({status:'active'})}]:[
 {id:'client',data:()=>({role:'client_admin',tenantId:'synthetic-tenant',bankName:'Synthetic Bank',name:'Synthetic Admin',email:'client@example.test',status:'approved',subscriptionStatus:'active'})},
 {id:'user',data:()=>({role:'client_user',tenantId:'synthetic-tenant',name:'Synthetic User',email:'user@example.test',status:'approved',subscriptionStatus:'active'})}]});`,
 './workerApi':`export const callBankSetuWorker=async()=>({});`,
 './MasterSystemStatus':`export default function Status(){return null;}`,
 './exportXlsx':`export const buildCustomerXlsx=async()=>new Blob([]);export const saveCustomerXlsx=async()=>{};`,
 './platform/android/runtime':`export const isAndroid=()=>true;export const androidStorageInfo=async()=>({totalBytes:1000000000,availableBytes:500000000,appDataBytes:11000000,appDataComplete:true});`,
};
fs.writeFileSync('test-evidence/theme.html','<div id="root"></div><script type="module" src="/test-evidence/theme.tsx"></script>');
fs.writeFileSync('test-evidence/theme.tsx',`import React from'react';import{createRoot}from'react-dom/client';import LocalSyncStatus from'../src/LocalSyncStatus';import Reports from'../src/Reports';import Settings from'../src/Settings';import MasterClients from'../src/MasterClients';import'../src/App.css';const q=new URLSearchParams(location.search);sessionStorage.setItem('bankSetuTenantId','synthetic-tenant');sessionStorage.setItem('bankSetuConnectionId','synthetic-connection');sessionStorage.setItem('bankSetuWorkspaceReady','true');sessionStorage.setItem('bankSetuAccountRole',q.get('role')||'master_owner');createRoot(document.getElementById('root')).render(<main className="banksetu-app-shell" data-appearance="light"><div className="banksetu-main-workspace"><LocalSyncStatus/><Reports/><Settings userRole="admin"/><MasterClients enabled/></div></main>);`);
const server=await createServer({configFile:false,root:process.cwd(),plugins:[{
 name:'synthetic-settings-appearance',enforce:'pre',resolveId(source,importer){
  if(importer?.includes('/src/')&&mocks[source])return '\0appearance:'+source;
 },load(id){if(id.startsWith('\0appearance:'))return mocks[id.slice(12)];}
},react()],server:{host:'127.0.0.1',port:5198,strictPort:true}});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
 const bg=(page,selector)=>page.locator(selector).first().evaluate(el=>getComputedStyle(el).backgroundColor);
 const darkSurface='rgb(23, 35, 56)',raised='rgb(35, 50, 73)';
 for(const width of [390,1280])for(const role of ['master_owner','client_admin']){
  const page=await browser.newPage({viewport:{width,height:900},...(width===390?{isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/133.0.0.0 Mobile Safari/537.36'}:{})});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:5198/test-evidence/theme.html?role=${role}`);
  await page.locator('.admin-user-card').first().waitFor();await page.locator('.reports-desktop tbody tr').first().waitFor({state:'attached'});
  assert.equal(await bg(page,'.sync-center'),'rgb(247, 249, 255)');
  assert.equal(await bg(page,'.reports-page th'),'rgb(247, 245, 252)');
  await page.locator('.banksetu-app-shell').evaluate(el=>el.dataset.appearance='dark');
  assert.equal(await bg(page,'.sync-center'),'rgb(17, 28, 48)');
  for(const selector of ['.sync-card','.sync-storage-details','.sync-health','.reports-panel','.reports-mobile article','.admin-user-card','.master-client-intro'])assert.equal(await bg(page,selector),darkSurface,selector);
  assert.equal(await bg(page,'.reports-page th'),raised);
  assert.equal(await bg(page,'.admin-user-stats>div'),raised);
  if(role==='master_owner')for(const selector of ['.admin-owner-summary','.admin-client-workspace','.admin-client-children'])assert.equal(await bg(page,selector),darkSurface,selector);
  await page.locator('.excel-action').click();
  assert.equal(await bg(page,'.excel-export-panel'),darkSurface);
  assert.equal(await bg(page,'.excel-export-options'),raised);
  assert.equal(await bg(page,'.excel-export-choice:has(input:checked)'),'rgb(30, 69, 62)');
  await page.getByText('Search Customers',{exact:true}).click();
  await page.locator('.excel-export-results').waitFor();
  await page.getByPlaceholder('Name, account, customer ID or mobile').fill('Synthetic');
  assert.equal(await page.locator('.excel-export-results label').count(),1);
  await page.getByText('Date Range',{exact:true}).click();assert.equal(await page.locator('.excel-export-panel input[type=date]').count(),2);
  await page.getByText('Custom Range',{exact:true}).click();await page.getByPlaceholder('First Customer ID').waitFor();
  // A portal mounted outside the shell must inherit the same appearance.
  await page.locator('.excel-export-dialog').evaluate(el=>{window.testExcelMarker=document.createComment('dialog origin');el.before(window.testExcelMarker);document.body.append(el);});
  assert.equal(await bg(page,'.excel-export-panel'),darkSurface);
  await page.locator('.banksetu-app-shell').evaluate(el=>el.dataset.appearance='light');
  assert.equal(await bg(page,'.excel-export-panel'),'rgb(255, 255, 255)');
  await page.locator('.banksetu-app-shell').evaluate(el=>el.dataset.appearance='dark');
  await page.locator('.excel-export-dialog').evaluate(el=>window.testExcelMarker.replaceWith(el));
  await page.getByRole('button',{name:'Close',exact:true}).first().click();
  await page.evaluate(()=>{window.testSyncError='Synthetic sync failure';window.dispatchEvent(new Event('banksetu-sync-change'));});
  await page.locator('.sync-error-card').waitFor();
  assert.equal(await page.locator('.sync-summary em').innerText(),'Sync needs attention');
  assert.equal(await bg(page,'.sync-error-card'),'rgb(74, 38, 54)');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal page overflow');
  // Screen-only additions must not apply to a print document.
  await page.emulateMedia({media:'print'});assert.notEqual(await bg(page,'.sync-center'),'rgb(17, 28, 48)');
  assert.deepEqual(errors,[]);await page.close();
  console.log(`PASS: ${width}px ${role}: real Sync/Excel/Reports/Settings components, light/dark toggle, portal, error contrast, no overflow, print scope`);
 }
}finally{
 await browser?.close();await server.close();
 for(const name of ['test-evidence/theme.html','test-evidence/theme.tsx'])fs.rmSync(name,{force:true});
}
