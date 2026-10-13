import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const compiled=ts.transpileModule(fs.readFileSync('src/ClientGoogleSetup.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const details={bankName:'Test CSP',passbookBank:'Test Bank',branchName:'Test Branch',operatorName:'Synthetic Client',mobile:'0123456789',cspCode:'',address:''};
function render(overrides={}){
 let index=0;const exports={};const states={1:{tenantId:'tenant-test',workspaceStatus:'active',hasWorkspace:false,dataApiReady:false},2:false,7:details,...overrides};
 const auth={currentUser:{uid:'client-test',email:'client@example.invalid',displayName:'Synthetic Client'}};
 vm.runInNewContext(compiled,{exports,window:{},require:path=>{
  if(path==='react')return {...React,useState:value=>React.useState(++index in states?states[index]:value)};
  if(path==='react/jsx-runtime')return jsx;
  if(path==='./firebase')return {auth};
  if(path==='./OptionBConnection')return {__esModule:true,default:props=>React.createElement('div',{'data-tenant':props.tenantId,'data-ready':!props.disabled,'data-completion':typeof props.onConnected==='function'})};
  return {};
 }});
 return renderToStaticMarkup(React.createElement(exports.default,{enabled:true}));
}
test('new tenant sees four-step registration with authenticated read-only email and details preview',()=>{
 const html=render();
 for(const label of ['Step 1 of 4','Your Details','Bank Info','Google Setup','Complete','Full Name','Email Address','Mobile Number','Next — Preview'])assert(html.includes(label),label);
 assert(html.includes('readOnly=""'));assert(html.includes('client@example.invalid'));assert(!html.includes('data-tenant'));
});
test('Google setup is scoped to selected tenant and has a verified completion callback',()=>{
 const html=render({8:true,12:2});
 assert(html.includes('data-tenant="tenant-test"'));assert(html.includes('data-ready="true"'));assert(html.includes('data-completion="true"'));assert(html.includes('Step 3 of 4'));
});
test('existing resource connection does not hide missing bank registration',()=>{
 const html=render({1:{tenantId:'tenant-test',workspaceStatus:'active',hasWorkspace:true,dataApiReady:true},8:false,12:1});
 assert(html.includes('Bank / CSP name'));assert(html.includes('Save Bank Info &amp; Continue'));
});
test('fully registered tenant skips onboarding; successful current-session setup shows completion',()=>{
 const config={tenantId:'tenant-test',workspaceStatus:'active',hasWorkspace:true,dataApiReady:true};
 assert.equal(render({1:config,8:true}),'');
 const html=render({1:config,8:true,12:3,14:true});assert(html.includes('Registration Complete'));assert(html.includes('Open My Workspace'));
});
