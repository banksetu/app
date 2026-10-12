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
test('an invited tenant with no connected Google workspace does not validate the shared master URL as its bridge',async()=>{
 let bridgeRequests=0;
 const result=await enforceClientLicenses({projectId:'synthetic',token:'test',fetchImpl:async(url)=>{
  if(url.includes('/users?'))return new Response(JSON.stringify({documents:[{fields:{role:{stringValue:'client_admin'},tenantId:{stringValue:'invited'},licenseRequired:{booleanValue:true}}}]}));
  if(url.includes('tenantSettings'))return new Response(JSON.stringify({fields:{apiUrl:{stringValue:'https://script.google.com/macros/s/master/exec'},spreadsheetId:{stringValue:''},photoFolderId:{stringValue:''}}}));
  bridgeRequests++;throw Error('Shared master URL should not be called');
 }});
 assert.deepEqual(result,{checked:1,updated:0,bridges:0,legacyBridges:0});assert.equal(bridgeRequests,0);
});
test('a partly configured tenant still fails closed if its bridge is missing or unbound',async()=>{
 const users={documents:[{fields:{role:{stringValue:'client_admin'},tenantId:{stringValue:'connected'},licenseRequired:{booleanValue:true}}}]};
 await assert.rejects(enforceClientLicenses({projectId:'synthetic',token:'test',fetchImpl:async(url)=>{
  if(url.includes('/users?'))return new Response(JSON.stringify(users));
  if(url.includes('tenantSettings'))return new Response(JSON.stringify({fields:{connectionMode:{stringValue:'option-b'},spreadsheetId:{stringValue:'sheet'}}}));
  throw Error('No bridge should be contacted');
 }}),/missing its Apps Script bridge URL/);
});
