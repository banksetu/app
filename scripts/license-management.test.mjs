import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';

const compiled=ts.transpileModule(fs.readFileSync('src/LicenseManagement.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const now=Date.now();
const pricing={annualPaise:149900,lifetimePaise:499900,annualAvailable:true,lifetimeAvailable:true,upgradeCreditEnabled:true,maxCreditPaise:149900,graceDays:0,paymentInstructions:'Verify payment with Master Admin.'};
const license={tenantId:'test-tenant',plan:'annual',status:'active',activatedAt:new Date(now-86400000).toISOString(),expiresAt:new Date(now+3*86400000).toISOString(),paidPaise:149900,revision:1};
function render(master,overrides={}){
  let index=0;
  const exports={};
  const states={1:pricing,2:now,...overrides};
  vm.runInNewContext(compiled,{exports,require:path=>{
    if(path==='react')return {...React,useState:value=>React.useState(++index in states?states[index]:value)};
    if(path==='react/jsx-runtime')return jsx;
    return {};
  }});
  return renderToStaticMarkup(React.createElement(exports.default,{master}));
}
test('client license displays validity, remaining days and authoritative configured upgrade credit',()=>{
  const html=render(false,{6:{license,view:{state:'active',daysRemaining:3},pricing}});
  assert(html.includes('License starts'));assert(html.includes('Valid until'));assert(html.includes('3 days remaining'));
  assert(html.includes('Renew License'));assert(html.includes('Upgrade to Lifetime'));
  assert(html.includes('3,500.00'));assert(!html.includes('MASTER CONTROL'));
});
test('Master Manage exposes renewal and lifetime upgrade for an existing Annual tenant',()=>{
  for(const plan of ['annual','lifetime']){
    const html=render(true,{14:[license],15:[{tenantId:'test-tenant',name:'Synthetic Client',email:'test@example.invalid',bankName:'Test Bank'}],18:'test-tenant',19:plan,29:'tenants'});
    assert(html.includes(plan==='annual'?'Confirm Payment &amp; Renew Annual':'Confirm Payment &amp; Upgrade to Lifetime'));
    assert(html.includes('Synthetic Client'));
    assert(!html.includes('Create Client</button>'));
  }
});
test('suspended license change is visibly disabled until Master reactivation',()=>{
  const html=render(true,{14:[{...license,status:'suspended'}],15:[{tenantId:'test-tenant',name:'Synthetic Client'}],18:'test-tenant',29:'tenants'});
  assert(/<button[^>]*disabled=""[^>]*>Confirm Payment &amp; Renew Annual<\/button>/.test(html));
  assert(html.includes('reactivate'));
});

test('reference dashboard count cards expose accessible category actions',()=>{
 const html=render(true);
 for(const label of ['Total Clients','Active Licenses','Pending Clients','Expiring Soon','Suspended','Demo Accounts'])assert(html.includes(`aria-label="View ${label}"`));
});

test('new tenant Manage popup includes three plans, a five-day Demo expiry and a real enabled assignment action',()=>{
 const start='2026-10-20';
 const html=render(true,{14:[],15:[{tenantId:'test-tenant',name:'Synthetic Client'}],18:'test-tenant',19:'demo',20:start,29:'tenants'});
 for(const label of ['Choose License Plan','Annual — 1 Year / Custom Duration','Lifetime — No Expiry','Demo — 5 Days Full Access','End Date (Auto Calculated)','2026-10-25','Confirm &amp; Activate Five-Day Demo'])assert(html.includes(label),label);
 assert(/<button type="button">Confirm &amp; Activate Five-Day Demo<\/button>/.test(html));
});
