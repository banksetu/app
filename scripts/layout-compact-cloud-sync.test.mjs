import test from "node:test";
import assert from "node:assert/strict";
import {
  layoutManifestId,layoutCloudPaths,safeCloudManifest,changedLayoutSlots,
  nextCloudManifest,compactLayoutTemplate,inflateLayoutTemplate
} from "../cloudflare/layoutCloudSync.js";
const blank=(tenantId="tenant-a",bankKey="central-bank-of-india",mode="passbook")=>({
 tenantId,bankKey,mode,revision:0,slots:[]
});
const mock=()=>({
 version:1,bankName:"Central Bank of India",bankKey:"central-bank-of-india",
 mode:"passbook",widthMm:190,heightMm:173,foldMm:86,printStartMm:101,
 elements:Array.from({length:20},(_,i)=>({id:"part-"+i,kind:"field",
  origin:"customer",label:"Account No",fieldKey:"accountNo",
  x:16,y:100+i,width:80,height:6,fontCompression:100,letterSpacing:.5,
  value:"",defaultValue:"",dotMatrix:true,preprinted:false,quick:true}))
});
test("Step 3: cloud backup compressed, checksum verified, much smaller than layout JSON",async()=>{
 const template=mock();
 const record=await compactLayoutTemplate(template);
 assert.equal(record.encoding,"gzip-base64");
 assert.ok(record.size<JSON.stringify(template).length/2);
 assert.equal(record.hash.length,64);
 assert.deepEqual(await inflateLayoutTemplate(record),template);
 const wrong={...record,hash:"a".repeat(64)};
 await assert.rejects(()=>inflateLayoutTemplate(wrong),/checksum/);
});
test("Step 3: client A and B cannot collide through encoded tenant+bank+mode identifiers",()=>{
 const a=layoutManifestId("tenant-a","central-bank-of-india","passbook");
 const b=layoutManifestId("tenant-b","central-bank-of-india","passbook");
 const c=layoutManifestId("tenant-a","union-bank","passbook");
 const d=layoutManifestId("tenant-a","central-bank-of-india","accountOpening");
 assert.equal(new Set([a,b,c,d]).size,4);
 assert.notEqual(layoutCloudPaths("tenant-a","central-bank-of-india","passbook","layout-1").slot,
   layoutCloudPaths("tenant-b","central-bank-of-india","passbook","layout-1").slot);
 assert.throws(()=>layoutCloudPaths("tenant/a","central-bank-of-india","passbook","layout-1"));
 assert.throws(()=>layoutCloudPaths("tenant-a","central-bank-of-india","passbook","../../tenant-b"));
});
test("Step 3: manifest checksum deltas select only changed templates, not full bank PDFs",()=>{
 const now="2026-11-03T00:00:00.000Z";
 const original=blank();
 let doc=original;
 for(let i=1;i<=3;i++){
   doc=nextCloudManifest(doc,{slotId:"layout-"+i,hash:String(i).repeat(64),size:500},now,i-1);
 }
 assert.equal(doc.slots.length,3);
 assert.equal(doc.revision,3);
 const normalized=safeCloudManifest(doc,"tenant-a","central-bank-of-india","passbook");
 assert.deepEqual(changedLayoutSlots(normalized,{"layout-1":"1".repeat(64),"layout-2":"2".repeat(64)})
   .map(s=>s.slotId),["layout-3"]);
 assert.deepEqual(changedLayoutSlots(normalized,{"layout-1":"1".repeat(64),"layout-2":"2".repeat(64),"layout-3":"3".repeat(64)}),[]);
 assert.throws(()=>safeCloudManifest(doc,"tenant-b","central-bank-of-india","passbook"),/another workspace/);
 assert.throws(()=>nextCloudManifest(doc,{slotId:"layout-2",hash:"4".repeat(64),size:90},now,2),/changed/);
 const next=nextCloudManifest(doc,{slotId:"layout-2",hash:"4".repeat(64),size:90},now,3);
 assert.equal(next.slots.find(s=>s.slotId==="layout-2").revision,2);
 assert.equal(next.slots.find(s=>s.slotId==="layout-1").revision,1);
});
test("Step 3: malformed/cross-tenant cloud fields are never silently repaired",()=>{
 const bad=blank();
 bad.slots=[{slotId:"layout-1",revision:1,hash:"a".repeat(64),size:10},
  {slotId:"layout-1",revision:1,hash:"b".repeat(64),size:10}];
 assert.throws(()=>safeCloudManifest(bad,"tenant-a","central-bank-of-india","passbook"),/duplicate/);
 assert.throws(()=>safeCloudManifest({...blank(),revision:NaN},"tenant-a","central-bank-of-india","passbook"));
});
