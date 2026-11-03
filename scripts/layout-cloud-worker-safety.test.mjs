import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.js";
import {setupPushFixture} from "../cloudflare/push-fixture.js";
import {inflateLayoutTemplate} from "../cloudflare/layoutCloudSync.js";
const bank="Central Bank of India";
const part=(changes={})=>({
 id:"field-1",kind:"field",page:1,origin:"customer",label:"Account No",
 fieldKey:"accountNo",value:"1234567890123",defaultValue:"",
 x:10,y:110,width:85,height:9,z:1,rotation:0,size:12,
 letterSpacing:.5,fontCompression:85,opacity:1,borderWidth:1,align:"left",
 bold:true,italic:false,underline:false,font:"Arial",color:"#222222",
 background:"transparent",borderColor:"#000000",quick:true,dotMatrix:true,preprinted:false,...changes
});
const layout=(label="Account No")=>({
 version:1,mode:"passbook",bankName:bank,widthMm:190,heightMm:173,
 foldMm:86,printStartMm:101,pageCount:1,elements:[part({label})]
});
function fixture(){
 const f=setupPushFixture();
 const lifetime={plan:"lifetime",status:"active",activatedAt:new Date(Date.now()-86400000).toISOString(),revision:1};
 for(const [tenant,users] of [
   ["tenant-a",[["admin-a","client_admin"],["user-a","client_user"]]],
   ["tenant-b",[["admin-b","client_admin"],["user-b","client_user"]]]
 ]){
   f.put("tenants/"+tenant,{status:"active"});
   f.put("tenantLicenses/"+tenant,{...lifetime,tenantId:tenant});
   f.put("tenantSettings/"+tenant,{passbookBank:bank});
   for(const [uid,role] of users)f.put("users/"+uid,{
     role,tenantId:tenant,status:"approved",subscriptionStatus:"active"});
 }
 return f;
}
async function call(f,route,uid,body){
 const result=await worker.fetch(new Request("https://worker.example"+route,{
  method:"POST",headers:{origin:"https://banksetu-app.web.app",
    authorization:"Bearer "+uid,"content-type":"application/json"},
  body:JSON.stringify(body)
 }),{...f.env,FIREBASE_WEB_API_KEY:"synthetic"});
 return {status:result.status,data:await result.json()};
}
test("Steps 1-3: tenant-scoped compact cloud backup safely recovers 3 slots in other login",async()=>{
 const f=fixture();try{
  let manifest=0;
  for(let i=1;i<=3;i++){
    const result=await call(f,"/layout-sync-publish","admin-a",{
      bankName:bank,mode:"passbook",slotId:"layout-"+i,template:layout("Account No"),
      expectedManifestRevision:manifest,expectedSlotRevision:0
    });
    assert.equal(result.status,200,JSON.stringify(result));
    assert.equal(result.data.revision,1);
    manifest=result.data.manifestRevision;
  }
  const remote=await call(f,"/layout-sync-index","user-a",{bankName:bank,mode:"passbook",known:{}});
  assert.equal(remote.status,200,JSON.stringify(remote));
  assert.equal(remote.data.slots.length,3);
  assert.equal(remote.data.changed.length,3);
  const verified=await call(f,"/layout-sync-index","user-a",{
    bankName:bank,mode:"passbook",known:Object.fromEntries(remote.data.slots.map(x=>[x.slotId,x.hash]))
  });
  assert.equal(verified.data.changed.length,0,"only missing changed templates should download");
  const downloaded=await call(f,"/layout-sync-download","user-a",{
    bankName:bank,mode:"passbook",slotId:"layout-2"
  });
  assert.equal(downloaded.status,200,JSON.stringify(downloaded));
  const generic=await inflateLayoutTemplate(downloaded.data);
  assert.equal(generic.elements[0].value,"");
  assert.equal(generic.elements[0].defaultValue,"");
  assert.equal(generic.elements[0].fontCompression,85);
  assert.ok(downloaded.data.size<5000);
  assert.equal(JSON.stringify([...f.store.entries()].filter(([key])=>key.includes("tenantLayoutBackups")))
   .includes("1234567890123"),false,"private account number must not be on Firebase");
  const other=await call(f,"/layout-sync-index","user-b",{
    bankName:bank,mode:"passbook",known:{}
  });
  assert.equal(other.status,200);
  assert.equal(other.data.slots.length,0);
  const denied=await call(f,"/layout-sync-download","user-b",{
    bankName:bank,mode:"passbook",slotId:"layout-2",tenantId:"tenant-a"
  });
  assert.equal(denied.status,404);
 }finally{f.restore();}
});
test("Steps 1-3: only Client Admin can publish, bank matches tenant, and stale writes do not overwrite",async()=>{
 const f=fixture();try{
  const readOnly=await call(f,"/layout-sync-publish","user-a",{
    bankName:bank,mode:"passbook",slotId:"layout-1",
    template:layout(),expectedManifestRevision:0,expectedSlotRevision:0
  });
  assert.equal(readOnly.status,403);
  const wrong=await call(f,"/layout-sync-publish","admin-a",{
    bankName:"Union Bank of India",mode:"passbook",slotId:"layout-1",
    template:layout(),expectedManifestRevision:0,expectedSlotRevision:0
  });
  assert.equal(wrong.status,403);
  const created=await call(f,"/layout-sync-publish","admin-a",{
    bankName:bank,mode:"passbook",slotId:"layout-1",
    template:layout(),expectedManifestRevision:0,expectedSlotRevision:0
  });
  assert.equal(created.status,200,JSON.stringify(created));
  const stale=await call(f,"/layout-sync-publish","admin-a",{
    bankName:bank,mode:"passbook",slotId:"layout-2",
    template:layout(),expectedManifestRevision:0,expectedSlotRevision:0
  });
  assert.equal(stale.status,409);
  const index=await call(f,"/layout-sync-index","admin-a",{bankName:bank,mode:"passbook"});
  assert.equal(index.data.slots.length,1,"stale attempted save must not create a second slot");
  const bad=await call(f,"/layout-sync-publish","admin-a",{
    bankName:bank,mode:"passbook",slotId:"layout-2",
    template:layout("Account No 1234567890123"),expectedManifestRevision:1,expectedSlotRevision:0
  });
  assert.equal(bad.status,400);
  assert.equal((await call(f,"/layout-sync-index","admin-a",{bankName:bank,mode:"passbook"})).data.slots.length,1);
 }finally{f.restore();}
});
test("Step 1: all layout sync endpoints reject unauthenticated and inactive accounts",async()=>{
 const f=fixture();try{
  for(const route of ["/layout-sync-index","/layout-sync-download","/layout-sync-publish"]){
   const req=new Request("https://worker.example"+route,{
    method:"POST",headers:{origin:"https://banksetu-app.web.app","content-type":"application/json"},
    body:JSON.stringify({bankName:bank,mode:"passbook",slotId:"layout-1"})
   });
   const result=await worker.fetch(req,{...f.env,FIREBASE_WEB_API_KEY:"synthetic"});
   assert.equal(result.status,401);
  }
  f.put("tenants/tenant-a",{status:"offboarded"});
  assert.equal((await call(f,"/layout-sync-index","user-a",{bankName:bank,mode:"passbook"})).status,403);
 }finally{f.restore();}
});
