import test from 'node:test';import assert from 'node:assert/strict';
import {enforceClientLicenses} from './enforce-client-licenses.mjs';
test('old client flags are upgraded with a conditional field-only patch; master/customer data stays intact',async()=>{
 const documents=[['a','client_admin','tenant-a',undefined],['b','client_user','tenant-a',false],['master','master_owner','',undefined],['c','client_admin','tenant-c',true]].map(([uid,role,tenantId,flag])=>({name:`projects/synthetic/databases/(default)/documents/users/${uid}`,updateTime:'2026-10-11T00:00:00Z',fields:{role:{stringValue:role},tenantId:{stringValue:tenantId},...(flag===undefined?{}:{licenseRequired:{booleanValue:flag}})}}));
 const patches=[];
 const result=await enforceClientLicenses({projectId:'synthetic',token:'synthetic',fetchImpl:async(url,options)=>{
  if(url.includes('/users?'))return new Response(JSON.stringify({documents}));
  if(options?.method==='PATCH'){patches.push([url,JSON.parse(options.body)]);return new Response('{}');}
  return new Response('{}',{status:404});
 }});
 assert.deepEqual(result,{checked:3,updated:2,bridges:0,legacyBridges:0});assert.equal(patches.length,2);
 for(const [url,body] of patches){assert(url.includes('updateMask.fieldPaths=licenseRequired'));assert(url.includes('currentDocument.updateTime='));assert.deepEqual(body,{fields:{licenseRequired:{booleanValue:true}}});}
});
test('an unverified deployed bridge blocks the release gate',async()=>{
 await assert.rejects(enforceClientLicenses({projectId:'synthetic',token:'test',fetchImpl:async(url)=>{
  if(url.includes('/users?'))return new Response(JSON.stringify({documents:[{fields:{role:{stringValue:'client_admin'},tenantId:{stringValue:'t'},licenseRequired:{booleanValue:true}}}]}));
  if(url.includes('tenantSettings'))return new Response(JSON.stringify({fields:{bridgeUrl:{stringValue:'https://script.google.com/macros/s/synthetic/exec'}}}));
  return new Response(JSON.stringify({tenantId:'t',tenantIsolationVersion:'v3'}));
 }}),/lacks verified license enforcement/);
});
