import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const source=ts.transpileModule(fs.readFileSync('src/Dashboard.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const noticeSource=ts.transpileModule(fs.readFileSync('src/LicenseNotice.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render(page,blocked){
 const storage={getItem:()=>null,setItem(){},removeItem(){}};
 let index=0;
 const exports={};
 const component=name=>props=>React.createElement('div',{'data-component':name},name==='LicenseNotice'?props.permission.state:undefined);
 const require=path=>{
  if(path==='react')return {...React,lazy:loader=>{const name=String(loader).match(/require\(["']\.\/(.+?)["']\)/)?.[1]||'DeferredPage';return component(name);},useState:value=>{index++;return React.useState(index===4?page:index===25?true:value);}};
  if(path==='react/jsx-runtime')return jsx;
  if(path==='react-dom')return {createPortal:()=>null};
  if(path==='./core/useSyncStatus')return {useSyncStatus:()=>({records:1,pending:1,online:true})};
  if(path==='./SupportCenter')return {__esModule:true,default:component('SupportCenter'),useSupportUnread:()=>0};
  if(path==='./core/licensePolicy')return {canOpenLicensePage:(name,readOnly)=>!readOnly||['dashboard','customers','all-customer-data','settings','sync-backup','license-management','support'].includes(name)};
  if(path==='./core/localData')return {localModeEnabled:()=>false};
  if(path==='./core/appearance')return {storedAppearance:()=> 'light',appearanceStorageKey:()=> 'test'};
  if(path.endsWith('.png'))return {__esModule:true,default:'logo.png'};
  if(path==='./tenantApi')return {tenantStorageKey:key=>key,getTenantApiUrl:()=>''};
  return {__esModule:true,default:component(path.slice(2)),getAuth:()=>({currentUser:{uid:'user-a'}})};
 };
 vm.runInNewContext(source,{exports,require,localStorage:storage,sessionStorage:storage,window:{},console,queueMicrotask});
 return renderToStaticMarkup(React.createElement(exports.default,{userRole:'admin',accountRole:'client_admin',onLogout(){},licenseReadOnly:blocked,licensePermission:{state:blocked?'suspended':'active',canWrite:!blocked}}));
}
test('read-only dashboard removes protected menus and blocks already selected routes in the same render',()=>{
 for(const page of ['customer-entry','quick-passbook','passbook','search','bank-formats']){
  const html=render(page,true);
  for(const label of ['Customer Entry','Quick Passbook','Passbook Print','Account Opening PDF Sample'])assert(!html.includes(label),label);
  assert(!html.includes('data-component="CustomerEntry"'));assert(!html.includes('data-component="SelectedBankDocument"'));assert(!html.includes('data-component="BankFormats"'));
  for(const label of ['Dashboard','All Customer Data','Customers','Settings','Sync &amp; Backup'])assert(html.includes(label),label);
  assert(html.includes('suspended'));
 }
});
test('license navigation moves from the sidebar to the profile menu without changing its route',()=>{
 const dashboard=fs.readFileSync('src/Dashboard.tsx','utf8');
 assert.doesNotMatch(dashboard,/<NavButton icon="🪪" label="License Management"/);
 assert.match(dashboard,/className="admin-license-menu-item"/);
 assert.match(dashboard,/setAdminMenuOpen\(false\); openPage\("license-management"\);/);
 assert.match(dashboard,/← Back to Dashboard/);
 assert.match(dashboard,/onClick=\{\(\) => openPage\("dashboard"\)\}/);
 const license=dashboard.indexOf('className="admin-license-menu-item"');
 const logout=dashboard.indexOf('↪ Logout',license);
 assert(license>dashboard.indexOf('Advanced Administrator Control')&&logout>license,'License Management must remain immediately above the final Logout action');
});
test('floating support position is temporary and returns to its bottom-right home',()=>{
 const support=fs.readFileSync('src/FloatingSupportButton.tsx','utf8');
 assert.match(support,/const returnDelayMs=5000/);
 assert.match(support,/localStorage\.removeItem\(storageKey\)/);
 assert.doesNotMatch(support,/localStorage\.setItem\(storageKey/);
 assert.match(support,/window\.addEventListener\('resize',snapHome\)/);
 assert.match(support,/window\.visualViewport\?\.addEventListener\('resize',snapHome\)/);
 assert.match(support,/returnHomeLater\(\)/);
 assert.match(support,/window\.innerWidth<700\?2:12\+configuredSafeBottom/);
 assert.match(support,/window\.innerWidth<700\?2:12/);
});
test('valid license retains protected menu access',()=>{
 const html=render('passbook',false);
 assert(html.includes('data-component="SelectedBankDocument"'),'the active paid passbook route must mount when settings are ready');
 for(const label of ['Customer Entry','Quick Passbook','Passbook Print','Account Opening PDF Sample'])assert(html.includes(label),label);
});
test('notice displays the same permission as the route model without an independent server request',()=>{
 const exports={};vm.runInNewContext(noticeSource,{exports,require:path=>path==='react/jsx-runtime'?jsx:{}});
 const html=renderToStaticMarkup(React.createElement(exports.default,{open(){},permission:{state:'suspended',expiresAt:'2026-10-10T00:00:00Z',daysRemaining:0,canWrite:false}}));
 assert(html.includes('License suspended'));assert(html.includes('0 days remaining'));
});
