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
  if(path==='react')return {...React,useState:value=>{index++;return React.useState(index===1?page:index===22?true:value);}};
  if(path==='react/jsx-runtime')return jsx;
  if(path==='react-dom')return {createPortal:()=>null};
  if(path==='./core/useSyncStatus')return {useSyncStatus:()=>({records:1,pending:1,online:true})};
  if(path==='./SupportCenter')return {__esModule:true,default:component('SupportCenter'),useSupportUnread:()=>0};
  if(path==='./core/licensePolicy')return {canOpenLicensePage:(name,readOnly)=>!readOnly||['dashboard','customers','all-customer-data','settings','sync-backup','license-management','support'].includes(name)};
  if(path==='./core/localData')return {localModeEnabled:()=>false};
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
  for(const label of ['Dashboard','All Customer Data','Customers','Settings','Sync &amp; Backup','License Management'])assert(html.includes(label),label);
  assert(html.includes('suspended'));
 }
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
