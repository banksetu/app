import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { generateKeyPairSync, randomUUID, webcrypto } from "node:crypto";
import worker from "../cloudflare/worker.js";

// External Firebase/Google services are doubled. These are regression checks,
// not evidence of real accounts, browser sessions or OAuth consent succeeding.
function loadTs(path) {
  const output=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};new Function("exports",output)(exports);return exports;
}
const {restoreWorkspaceBankSettings}=loadTs("../src/workspaceBankSettings.ts");
const {bankDocumentMode,templateMatchesBank,bankKey}=loadTs("../src/bankDocumentPolicy.ts");
test("fresh sessions restore cloud bank fields and logo without a browser cache",()=>{
  const saved={bankInfo:{bankName:"Client A",passbookBank:"Union Bank of India",branchName:"Branch A",cspCode:"123",operatorName:"Operator",address:"Address"},bankLogo:"data:image/png;base64,AAAA"};
  const sessionOne=restoreWorkspaceBankSettings(saved);
  const sessionTwo=restoreWorkspaceBankSettings(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(sessionTwo,sessionOne);
  assert.equal(restoreWorkspaceBankSettings({...saved,passbookBank:""}).bankInfo.passbookBank,"");
  assert.equal(restoreWorkspaceBankSettings({}).bankLogo,"");
  assert.equal(restoreWorkspaceBankSettings({}).bankInfo.passbookBank,"");
});
test("all document types use bank-specific policy, never another bank's sample",()=>{
  for(const type of ["passbook","quickPassbook","accountOpening"]){
    assert.equal(bankDocumentMode(""),"select",type);
    for(const bank of ["Assam Gramin Bank","Assam Gramin Vikas Bank","AGVB"])assert.equal(bankDocumentMode(bank),"builtin",type);
    assert.equal(bankDocumentMode("Union Bank of India"),"builtin",type);
    assert.equal(templateMatchesBank({bankKey:bankKey("Union Bank of India")},"Union Bank of India"),true);
    assert.equal(templateMatchesBank({bankKey:bankKey("State Bank of India")},"Union Bank of India"),false);
    assert.equal(templateMatchesBank({},"Union Bank of India"),false);
  }
});
const encode=value=>typeof value==="string"?{stringValue:value}:typeof value==="number"?{integerValue:String(value)}:typeof value==="boolean"?{booleanValue:value}:value===null?{nullValue:null}:{mapValue:{fields:encodeFields(value)}};
const encodeFields=obj=>Object.fromEntries(Object.entries(obj).map(([key,value])=>[key,encode(value)]));
test("authenticated saves persist only the actor's tenant and preserve all three templates",async()=>{
  const documents=new Map();
  for(const [uid,role,tenantId] of [["adminA","client_admin","A"],["userA","client_user","A"],["adminB","client_admin","B"]]){
    documents.set("users/"+uid,{fields:encodeFields({role,tenantId,status:"approved",subscriptionStatus:"active"})});
  }
  const formats=Object.fromEntries(["passbook","quickPassbook","accountOpening"].map(type=>[type,{fileId:"A-"+type,bankKey:"union bank of india"}]));
  for(const id of ["A","B"]){
    documents.set("tenants/"+id,{fields:encodeFields({status:"active",ownerUid:"admin"+id})});
    documents.set("tenantSettings/"+id,{fields:encodeFields({spreadsheetId:"sheet"+id,photoFolderId:"drive"+id,bankFormats:id==="A"?formats:{}})});
  }
  const originalFetch=globalThis.fetch;
  globalThis.crypto??=webcrypto;
  const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
  const env={ALLOWED_ORIGINS:"https://banksetu-app.web.app",FIREBASE_PROJECT_ID:"regression-only",FIREBASE_WEB_API_KEY:"fake",FIREBASE_SERVICE_ACCOUNT:JSON.stringify({client_email:"fixture@example.invalid",private_key:privateKey})};
  globalThis.fetch=async(url,options={})=>{
    url=String(url);
    if(url.includes("accounts:lookup")){
      const uid=JSON.parse(options.body).idToken;
      return Response.json(documents.has("users/"+uid)?{users:[{localId:uid,email:uid+"@example.invalid"}]}:{error:{message:"invalid token"}},{status:documents.has("users/"+uid)?200:400});
    }
    if(url==="https://oauth2.googleapis.com/token")return Response.json({access_token:"fixture-only",expires_in:3600});
    const parsed=new URL(url),path=decodeURIComponent(parsed.pathname.split("/documents/")[1]||"");
    if(options.method==="PATCH"){
      const fields=JSON.parse(options.body).fields,existing=documents.get(path)||{fields:{}};
      for(const key of parsed.searchParams.getAll("updateMask.fieldPaths"))existing.fields[key]=fields[key];
      documents.set(path,existing);return Response.json(existing);
    }
    return Response.json(documents.get(path)||{error:{message:"missing"}},{status:documents.has(path)?200:404});
  };
  const save=async(uid,body)=>worker.fetch(new Request("https://worker.example/save-workspace-bank-settings",{method:"POST",headers:{origin:"https://banksetu-app.web.app",authorization:"Bearer "+uid,"content-type":"application/json"},body:JSON.stringify(body)}),env);
  try{
    const bankInfo={bankName:"Client A",passbookBank:"Union Bank of India",branchName:"Branch A",cspCode:"",operatorName:"A",address:"A"};
    const bBefore=JSON.stringify(documents.get("tenantSettings/B"));
    assert.equal((await save("adminA",{bankInfo,bankLogo:"data:image/png;base64,AAAA",tenantId:"B",spreadsheetId:"master",bankFormats:{}})).status,200);
    const saved=documents.get("tenantSettings/A").fields;
    assert.equal(saved.passbookBank.stringValue,"Union Bank of India");
    assert.equal(saved.bankLogo.stringValue,"data:image/png;base64,AAAA");
    assert.equal(saved.spreadsheetId.stringValue,"sheetA");
    assert.deepEqual(saved.bankFormats,encode(formats));
    assert.equal(JSON.stringify(documents.get("tenantSettings/B")),bBefore);
    assert.equal((await save("userA",{bankInfo})).status,403);
    assert.equal((await save("unknown",{bankInfo})).status,401);
    documents.get("tenants/A").fields.status={stringValue:"blocked"};
    assert.equal((await save("adminA",{bankInfo})).status,403);
  }finally{globalThis.fetch=originalFetch;}
});

function sheet(){
  const rows=[Array(24).fill("")];
  return {rows,getLastRow:()=>rows.length,setFrozenRows(){},appendRow(row){rows.push([...row]);},getRange(r,c,n=1,m=1){
    const values=()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i]?.[c-1+j]??""));
    return {getValues:values,getDisplayValues:()=>values().map(row=>row.map(String)),setValue(value){rows[r-1][c-1]=value;},setValues(data){for(let i=0;i<n;i++){rows[r-1+i]??=[];for(let j=0;j<m;j++)rows[r-1+i][c-1+j]=data[i][j];}}};
  }};
}
function appsHarness(){
  const stores=new Map(),settings={},profiles={},tenants={},files={};
  for(const id of ["A","B"]){
    const sheets={Sheet1:sheet()};
    stores.set("sheet"+id,{getSheetByName:name=>sheets[name],insertSheet(name){return sheets[name]=sheet();}});
    tenants[id]={status:"active",ownerUid:"admin"+id};
    settings[id]={workspaceOwnerUid:"admin"+id,spreadsheetId:"sheet"+id,photoFolderId:"drive"+id,bankFormats:{}};
    for(const [uid,role] of [["admin"+id,"client_admin"],["user"+id,"client_user"]])profiles[uid]={role,tenantId:id,status:"approved",subscriptionStatus:"active"};
    for(const type of ["passbook","quickPassbook","accountOpening"]){
      const fileId=id+"-"+type;settings[id].bankFormats[type]={fileId,mimeType:"application/pdf"};
      files[fileId]={getParents(){let available=true;return {hasNext:()=>available,next(){available=false;return {getId:()=>"drive"+id};}};},getSize:()=>10,getBlob:()=>({getBytes:()=>[1,2],getContentType:()=>"application/pdf"}),getName:()=>fileId+".pdf"};
    }
  }
  const context=vm.createContext({
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>""})},
    SpreadsheetApp:{openById:id=>{assert(stores.has(id),"Unexpected spreadsheet: "+id);return stores.get(id);}},
    DriveApp:{getFolderById:id=>({getFilesByName:()=>({hasNext:()=>false})}),getFileById:id=>files[id]},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{getUuid:randomUUID,base64Encode:bytes=>Buffer.from(bytes).toString("base64")},console
  });
  vm.runInContext(fs.readFileSync(process.env.APPS_SCRIPT_TEST_SOURCE||new URL("../apps-script/Code.gs",import.meta.url),"utf8"),context);
  // Double only external identity/Firestore reads; keep authorization, routing,
  // sheet access, customer operations, audit writes and Drive parent checks real.
  context.verifyFirebaseIdToken=uid=>({localId:uid,email:uid+"@example.invalid"});
  context.getFirestoreUserProfile=uid=>profiles[uid]||{};
  context.getFirestoreTenant=id=>tenants[id];
  context.getFirestoreTenantSettings=id=>settings[id];
  context.jsonResponse=value=>JSON.parse(JSON.stringify(value));
  const request=(idToken,action,body={})=>context.doPost({postData:{contents:JSON.stringify({idToken,action,...body})}});
  return {request,settings,profiles,tenants};
}
test("customer entry, search, dashboard and passbook status stay in each verified client sheet",()=>{
  const {request}=appsHarness();
  const common={enrolId:"SAME-ID",accountNo:"SAME-ACCOUNT",uidaiNo:"123456789012",contact:"9999999999"};
  assert.equal(request("adminA","saveCustomer",{customer:{...common,name:"Client A Customer"}}).success,true);
  assert.equal(request("adminB","saveCustomer",{customer:{...common,name:"Client B Customer"}}).success,true);
  assert.equal(request("adminA","saveCustomer",{customer:{...common,name:"Duplicate"}}).success,false);
  assert.equal(request("userA","searchCustomer",{query:"SAME-ACCOUNT",tenantId:"B"}).customer.name,"Client A Customer");
  assert.equal(request("userB","searchCustomer",{query:"SAME-ACCOUNT",tenantId:"A"}).customer.name,"Client B Customer");
  assert.equal(request("adminB","searchCustomer",{query:"Client A Customer"}).success,false);
  assert.equal(request("userA","getDashboardStats").stats.totalCustomers,1);
  assert.equal(request("adminA","markPassbookDelivered",{rowNumber:2}).success,true);
  assert.equal(request("userA","searchCustomer",{query:"SAME-ID"}).customer.passbookStatus,"Delivered");
  assert.notEqual(request("userB","searchCustomer",{query:"SAME-ID"}).customer.passbookStatus,"Delivered");
});
test("Client Users can open their own three samples; foreign Drive files are refused",()=>{
  const {request,settings}=appsHarness();
  for(const type of ["passbook","quickPassbook","accountOpening"]){
    assert.equal(request("userA","getBankFormatPreview",{formatType:type}).fileName,"A-"+type+".pdf");
    settings.A.bankFormats[type].fileId="B-"+type;
    const result=request("userA","getBankFormatPreview",{formatType:type});
    assert.equal(result.success,false);
    assert.match(result.message,/outside the current client workspace/);
  }
});
test("unconnected, unassigned, blocked or mismatched-owner clients never fall back to Master data",()=>{
  const {request,settings,profiles,tenants}=appsHarness();
  settings.A.spreadsheetId="";
  assert.equal(request("adminA","getDashboardStats").success,false);
  settings.A.spreadsheetId="sheetA";settings.A.workspaceOwnerUid="wrong-owner";
  assert.equal(request("adminA","getDashboardStats").success,false);
  settings.A.workspaceOwnerUid="adminA";tenants.A.status="blocked";
  assert.equal(request("adminA","getDashboardStats").success,false);
  profiles.orphan={role:"client_user",status:"approved",subscriptionStatus:"active"};
  assert.equal(request("orphan","getDashboardStats").success,false);
  assert.equal(request("","getDashboardStats").code,"AUTH_REQUIRED");
});
