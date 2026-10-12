import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import worker, { firestoreDocumentName, bankFormatSelectionError, workspaceBankSettingsPath, validateWorkspaceBankPatch, validatePushRegistration, sendTenantPush } from "./worker.js";


test("builds Firestore commit resource names without REST URL prefixes", () => {
  assert.equal(
    firestoreDocumentName({ FIREBASE_PROJECT_ID: "banksetu-69e2f" }, "/tenants/client-123"),
    "projects/banksetu-69e2f/databases/(default)/documents/tenants/client-123",
  );
});

const env = {
  ALLOWED_ORIGINS: "https://banksetu-app.web.app",
};

test("keeps the existing health check available", async () => {
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, protected: true, message: "Bank Setu API is running",licenseEnforcementVersion:2,commit:null });
});

test("allows the configured app origin to preflight the account API", async () => {
  const response = await worker.fetch(new Request("https://worker.example/account-action", {
    method: "OPTIONS",
    headers: { origin: "https://banksetu-app.web.app" },
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://banksetu-app.web.app");
});

test("rejects an unconfigured website origin", async () => {
  const response = await worker.fetch(new Request("https://worker.example/account-action", {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ uid: "target", action: "block" }),
  }), env);
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Origin is not allowed/);
});

test("requires Firebase sign-in before account and tenant setup actions", async () => {
  for (const path of ["/account-action", "/delete-user", "/get-google-setup", "/configure-tenant-data", "/save-bank-format-template", "/save-bank-format-mapping", "/save-workspace-bank-settings", "/push-register", "/push-unregister"]) {
    const response = await worker.fetch(new Request(`https://worker.example${path}`, {
      method: "POST",
      headers: { origin: "https://banksetu-app.web.app", "content-type": "application/json" },
      body: JSON.stringify({ uid: "target", action: "block" }),
    }), env);
    assert.equal(response.status, 401, path);
    assert.match((await response.json()).error, /Sign in is required/, path);
  }
});

test("Android push registration refuses wrong platforms and malformed device tokens", () => {
  const valid = { platform: "android", deviceId: "12345678-1234-1234-1234-123456789abc", token: "A".repeat(100) };
  assert.equal(validatePushRegistration(valid), true);
  assert.equal(validatePushRegistration({...valid, platform:"windows"}), false);
  assert.equal(validatePushRegistration({...valid, token:"short"}), false);
  assert.equal(validatePushRegistration({...valid, deviceId:"../another-user"}), false);
});

test("push device ownership follows the authenticated account and unregister cannot remove another account", async () => {
  const previous = globalThis.fetch;
  const deviceId = "12345678-1234-1234-1234-123456789abc";
  const {privateKey} = generateKeyPairSync('rsa',{modulusLength:2048});
  let stored = null;
  const fields = data => Object.fromEntries(Object.entries(data).map(([key,value]) => [key,{stringValue:value}]));
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('accounts:lookup')) return Response.json({users:[{localId:JSON.parse(options.body).idToken,email:'user@example.test',emailVerified:true}]});
    if (target.includes('oauth2.googleapis.com/token')) return Response.json({access_token:'test',expires_in:3600});
    if (target.includes('/documents/users/')) return Response.json({fields:fields({role:'client_user',tenantId:'tenant-one',status:'approved',subscriptionStatus:'active'})});
    if (target.includes('/documents/tenants/')) return Response.json({fields:fields({status:'active'})});
    if (target.includes('/documents:runQuery')) return Response.json([]);
    if (target.includes(`/documents/pushDevices/${deviceId}`)) {
      if (options.method === 'DELETE') { stored = null; return Response.json({}); }
      if (options.method === 'PATCH') { stored = JSON.parse(options.body).fields; return Response.json({fields:stored}); }
      return stored ? Response.json({fields:stored}) : Response.json({}, {status:404});
    }
    throw Error(`Unexpected backend request: ${target}`);
  };
  const call = (uid,route,body) => worker.fetch(new Request(`https://worker.example${route}`,{method:'POST',headers:{origin:env.ALLOWED_ORIGINS,authorization:`Bearer ${uid}`},body:JSON.stringify(body)}),{...env,FIREBASE_PROJECT_ID:'synthetic',FIREBASE_WEB_API_KEY:'synthetic',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:'test@example.test',private_key:privateKey.export({type:'pkcs8',format:'pem'})})});
  try {
    const body={platform:'android',deviceId,token:'A'.repeat(100)};
    assert.equal((await call('first','/push-register',body)).status,200);
    assert.equal(stored.uid.stringValue,'first');
    assert.equal((await call('second','/push-register',{...body,token:'B'.repeat(100)})).status,200);
    assert.equal(stored.uid.stringValue,'second');
    assert.equal((await call('first','/push-unregister',{deviceId})).status,200);
    assert.equal(stored.uid.stringValue,'second');
    assert.equal((await call('second','/push-unregister',{deviceId})).status,200);
    assert.equal(stored,null);
  } finally { globalThis.fetch = previous; }
});

test("push sender checks each recipient's tenant and account status before FCM delivery", async () => {
  const previous = globalThis.fetch;
  const {privateKey} = generateKeyPairSync('rsa',{modulusLength:2048});
  const sent=[];
  const fields = data => Object.fromEntries(Object.entries(data).map(([key,value])=>[key,{stringValue:value}]));
  globalThis.fetch = async (url,options={}) => {
    const target=String(url);
    if(target.includes('oauth2.googleapis.com/token'))return Response.json({access_token:'test',expires_in:3600});
    if(target.includes('/documents/tenants/tenant-a'))return Response.json({fields:fields({status:'active'})});
    if(target.includes('/documents:runQuery'))return Response.json([
      {document:{fields:fields({uid:'same',tenantId:'tenant-a',token:'A'.repeat(100),expiresAt:new Date(Date.now()+86400000).toISOString()})}},
      {document:{fields:fields({uid:'other',tenantId:'tenant-a',token:'B'.repeat(100),expiresAt:new Date(Date.now()+86400000).toISOString()})}},
    ]);
    if(target.includes('/documents/users/same'))return Response.json({fields:fields({tenantId:'tenant-a',status:'approved',subscriptionStatus:'active'})});
    if(target.includes('/documents/users/other'))return Response.json({fields:fields({tenantId:'tenant-b',status:'approved',subscriptionStatus:'active'})});
    if(target.includes('fcm.googleapis.com')){sent.push(JSON.parse(options.body).message.token);return Response.json({name:'test'});}
    throw Error(`Unexpected backend request: ${target}`);
  };
  try {
    await sendTenantPush({FIREBASE_PROJECT_ID:'synthetic',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:'test@example.test',private_key:privateKey.export({type:'pkcs8',format:'pem'})})},'tenant-a',{id:'event-1',title:'License updated',body:'Open the app.'});
    assert.deepEqual(sent,['A'.repeat(100)]);
  } finally {globalThis.fetch=previous;}
});

test("bank samples require the currently selected bank and never replace built-in Assam formats", () => {
  assert.match(bankFormatSelectionError("", "Union Bank of India"), /Select and save/);
  assert.match(bankFormatSelectionError("Union Bank of India", "State Bank of India"), /Select and save/);
  assert.equal(bankFormatSelectionError(" Union Bank of India ", "union  bank of india"), "");
  for (const bank of ["Assam Gramin Bank", "Assam Gramin Vikas Bank", "AGVB"]) {
    assert.match(bankFormatSelectionError(bank, bank), /built-in/);
  }
});

test("bank settings are written only to the signed-in administrator's workspace", () => {
  assert.equal(workspaceBankSettingsPath({uid:"client",profile:{role:"client_admin",tenantId:"workspace-1"}}),"/tenantSettings/workspace-1");
  assert.equal(workspaceBankSettingsPath({uid:"user",profile:{role:"client_user",tenantId:"workspace-1"}}),"");
  assert.equal(workspaceBankSettingsPath({uid:"master",profile:{role:"master_owner"}}),"/appSettings/master");
  assert.equal(workspaceBankSettingsPath({uid:"unassigned",profile:{role:"client_admin"}}),"");
});
test("bank settings patches preserve unrelated Drive and template configuration", () => {
  const bankInfo={bankName:" Bank ",passbookBank:"Assam Gramin Bank",branchName:"Branch",cspCode:"",operatorName:"Operator",address:"Address"};
  const patch=validateWorkspaceBankPatch({bankInfo,tenantId:"another-workspace",spreadsheetId:"overwrite",bankFormats:{}});
  assert.equal(patch.bankName,"Bank");assert.deepEqual(patch.bankInfo,{...bankInfo,bankName:"Bank"});
  assert(!("spreadsheetId" in patch));assert(!("bankFormats" in patch));assert(!("tenantId" in patch));
  assert.deepEqual(validateWorkspaceBankPatch({bankLogo:"data:image/png;base64,AAAA"}),{bankLogo:"data:image/png;base64,AAAA"});
  assert.throws(()=>validateWorkspaceBankPatch({bankLogo:"https://untrusted.example/logo"}));
  assert.throws(()=>validateWorkspaceBankPatch({bankLogo:"data:image/png;base64,"+"A".repeat(150000)}));
});

test("Option B validates exact Google resource hosts and verified resource ownership", async () => {
  const {parseGoogleResource,validateResourceOwnership}=await import('./googleConnection.js');
  const id='abcdefghijklmnopqrstuvwxyz12345';
  assert.equal(parseGoogleResource(`https://docs.google.com/spreadsheets/d/${id}/edit`,'sheet'),id);
  assert.equal(parseGoogleResource(`https://drive.google.com/drive/u/0/folders/${id}`,'folder'),id);
  assert.throws(()=>parseGoogleResource(`https://docs.google.com.attacker.example/spreadsheets/d/${id}`,'sheet'));
  const owner={owners:[{emailAddress:'owner@example.com'}],capabilities:{canEdit:true}};
  const sheet={...owner,id,mimeType:'application/vnd.google-apps.spreadsheet',parents:['folder']};const folder={...owner,id:'folder',mimeType:'application/vnd.google-apps.folder'};
  validateResourceOwnership(sheet,folder,'owner@example.com');assert.throws(()=>validateResourceOwnership(sheet,folder,'other@example.com'),/belong/);assert.throws(()=>validateResourceOwnership({...sheet,parents:['another']},folder,'owner@example.com'),/inside/);
});

test('licensing mutation endpoints require an approved signed-in actor', async () => {
  for (const path of ['/license-admin-settings','/license-save-settings','/license-admin-list','/license-admin-assign','/license-admin-decision','/license-me','/license-request-change','/create-client-invite']) {
    const response=await worker.fetch(new Request(`https://worker.example${path}`,{method:'POST',headers:{origin:'https://banksetu-app.web.app','content-type':'application/json'},body:'{}'}),env);
    assert.equal(response.status,401,path);
  }
});

test('an unverified URL-only Google bridge route is unavailable', async () => {
  const response = await worker.fetch(new Request('https://worker.example/save-client-bridge-url', {
    method: 'POST', headers: { origin: 'https://banksetu-app.web.app', 'content-type': 'application/json' }, body: '{}'
  }), env);
  assert.equal(response.status, 404);
});

test('public inquiry fails closed without CAPTCHA keys', async () => {
  const {generateKeyPairSync}=await import('node:crypto');
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url => {
    const path=String(url);
    if(path.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({access_token:'test',expires_in:3600}),{status:200});
    if(path.includes('/tenantLicenses/')) return new Response('{}',{status:404});
    if(path.includes('/appSettings/licensing')) return new Response(JSON.stringify({error:{message:'Not found'}}),{status:404});
    throw new Error(`Unexpected remote request: ${path}`);
  };
  try {
    const response=await worker.fetch(new Request('https://worker.example/license-inquiry',{
      method:'POST',headers:{origin:'https://banksetu-app.web.app','content-type':'application/json'},body:'{}'
    }),{...env,FIREBASE_PROJECT_ID:'synthetic-test',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:'test@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})})});
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/temporarily unavailable/);
  } finally { globalThis.fetch=realFetch; }
});

test('client admin cannot change global licensing prices or approve licenses', async () => {
  const {generateKeyPairSync}=await import('node:crypto');
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const realFetch=globalThis.fetch;
  const field=value=>typeof value==='string'?{stringValue:value}:{booleanValue:value};
  globalThis.fetch=async (url)=>{
    const path=String(url);
    if(path.includes('accounts:lookup')) return new Response(JSON.stringify({users:[{localId:'client-uid',email:'client@example.invalid',emailVerified:true}]}));
    if(path.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({access_token:'test',expires_in:3600}));
    if(path.endsWith('/users/client-uid')) return new Response(JSON.stringify({fields:{role:field('client_admin'),tenantId:field('tenant-a'),status:field('approved'),subscriptionStatus:field('active')}}));
    if(path.endsWith('/tenants/tenant-a')) return new Response(JSON.stringify({fields:{status:field('active')}}));
    if(path.includes('/tenantLicenses/')) return new Response('{}',{status:404});
    if(path.includes('/appSettings/licensing')) return new Response(JSON.stringify({error:{message:'Not found'}}),{status:404});
    throw new Error(`Unexpected request: ${path}`);
  };
  try{
    const synthetic={...env,FIREBASE_PROJECT_ID:'synthetic-test',FIREBASE_WEB_API_KEY:'test',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:'test@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})})};
    for(const path of ['/license-save-settings','/license-admin-assign','/license-admin-decision','/license-admin-history']){
      const response=await worker.fetch(new Request(`https://worker.example${path}`,{method:'POST',headers:{origin:'https://banksetu-app.web.app',authorization:'Bearer synthetic','content-type':'application/json'},body:'{}'}),synthetic);
      assert.equal(response.status,403,path);
    }
  }finally{globalThis.fetch=realFetch;}
});
