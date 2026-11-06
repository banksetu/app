import test from "node:test";
import assert from "node:assert/strict";
import {
 LAYOUT_STORAGE_KEY,layoutSlotKey,listLayoutSlots,putLayoutSlot,
 getLayoutStorage,mergeRemoteLayoutSlot,markLayoutSynced
} from "../src/layoutLocalState.ts";
const blank=()=>({records:[],operations:[],documents:{bankFormats:{keep:true}}});
const draft=(bank="Central Bank of India",label="PASSBOOK")=>({
 version:1,mode:"passbook",bankName:bank,widthMm:190,heightMm:173,
 foldMm:86,printStartMm:101,pageCount:1,elements:[
  {id:"field-1",kind:"field",origin:"customer",label,fieldKey:"accountNo",
   x:16,y:112,width:85,height:12,page:1,
   value:"",defaultValue:"",letterSpacing:.5,fontCompression:80}
 ]
});
test("Step 2: use existing records/operations/documents without a competing DB or overwriting customer state",()=>{
 const state=blank(),queue={operationId:"pending-1"},records={recordId:"customer-1"};
 state.operations.push(queue);state.records.push(records);
 const a=putLayoutSlot(state,"tenant-a","Central Bank of India","passbook","layout-1",draft());
 assert.equal(a.localRevision,1);
 assert.equal(state.records[0],records);
 assert.equal(state.operations[0],queue);
 assert.deepEqual(state.documents.bankFormats,{keep:true});
 assert.equal(listLayoutSlots(state,"tenant-a","Central Bank of India","passbook").length,1);
 assert.notEqual(state.documents[LAYOUT_STORAGE_KEY].tenantId,"tenant-b");
 assert.throws(()=>getLayoutStorage(state,"tenant-b"),/does not match/);
});
test("Step 2: separate banks and layout modes never overwrite neighboring template slots",()=>{
 const state=blank();
 putLayoutSlot(state,"tenant-a","Central Bank of India","passbook","layout-1",draft());
 putLayoutSlot(state,"tenant-a","Central Bank of India","passbook","layout-2",draft("Central Bank of India","ALT"));
 putLayoutSlot(state,"tenant-a","Punjab National Bank","passbook","layout-1",draft("Punjab National Bank"));
 assert.deepEqual(listLayoutSlots(state,"tenant-a","Central Bank of India","passbook").map(s=>s.slotId),["layout-1","layout-2"]);
 assert.equal(listLayoutSlots(state,"tenant-a","Punjab National Bank","passbook").length,1);
 assert.equal(listLayoutSlots(state,"tenant-a","Central Bank of India","accountOpening").length,0);
 assert.equal(state.records.length,0);
});
test("Step 2: edited drafts use CAS, copies are independent and invalid saves are rejected",()=>{
 const state=blank();
 const source=draft();
 const first=putLayoutSlot(state,"tenant-a",source.bankName,"passbook","layout-1",source,0);
 source.elements[0].label="MUTATED OUTSIDE";
 assert.equal(first.draft.elements[0].label,"PASSBOOK");
 assert.equal(listLayoutSlots(state,"tenant-a",source.bankName,"passbook")[0].draft.elements[0].label,"PASSBOOK");
 assert.throws(()=>putLayoutSlot(state,"tenant-a",source.bankName,"passbook","layout-1",source,0),/another window/);
 const second=putLayoutSlot(state,"tenant-a",source.bankName,"passbook","layout-1",source,1);
 assert.equal(second.localRevision,2);
 assert.throws(()=>putLayoutSlot(state,"tenant-a",source.bankName,"passbook","layout-2",
   {...source,elements:[{...source.elements[0],imageData:"data:application/pdf;base64,AAA"}]}),/Embedded scan/);
 assert.throws(()=>layoutSlotKey(source.bankName,"passbook","../tenant-b"),/Invalid/);
});
test("Step 3: first-time new device gets all 3 slots; no cloud index fields touch customer records",()=>{
 const downloaded=blank(),bank="Central Bank of India";
 for(let i=1;i<=3;i++){
   const result=mergeRemoteLayoutSlot(downloaded,"tenant-a",bank,"passbook","layout-"+i,{
     draft:draft(bank,"FORMAT-"+i),revision:1,hash:String(i).repeat(64)
   });
   assert.equal(result,"downloaded");
 }
 assert.equal(listLayoutSlots(downloaded,"tenant-a",bank,"passbook").length,3);
 assert.equal(downloaded.records.length,0);
 assert.equal(downloaded.operations.length,0);
 assert.deepEqual(downloaded.documents.bankFormats,{keep:true});
});
test("Step 3: remote conflict preserves local edited draft and keeps incoming for review",()=>{
 const state=blank(),bank="Central Bank of India";
 const local=putLayoutSlot(state,"tenant-a",bank,"passbook","layout-1",draft(bank,"CURRENT"));
 const result=mergeRemoteLayoutSlot(state,"tenant-a",bank,"passbook","layout-1",{
   draft:draft(bank,"REMOTE"),revision:3,hash:"c".repeat(64)
 });
 assert.equal(result,"conflict");
 const saved=listLayoutSlots(state,"tenant-a",bank,"passbook")[0];
 assert.equal(saved.draft.elements[0].label,"CURRENT");
 assert.equal(saved.incoming.draft.elements[0].label,"REMOTE");
 assert.equal(saved.localRevision,local.localRevision);
 assert.equal(saved.dirty,true);
 assert.equal(markLayoutSynced(state,"tenant-a",bank,"passbook","layout-1",999,3,"c".repeat(64)),false);
 assert.equal(listLayoutSlots(state,"tenant-a",bank,"passbook")[0].dirty,true);
});
test("Step 3: successful sync acknowledges only same local revision, preserving edits during upload",()=>{
 const state=blank(),bank="Central Bank of India";
 const local=putLayoutSlot(state,"tenant-a",bank,"passbook","layout-1",draft());
 assert.equal(markLayoutSynced(state,"tenant-a",bank,"passbook","layout-1",
   local.localRevision,1,"a".repeat(64)),true);
 assert.equal(listLayoutSlots(state,"tenant-a",bank,"passbook")[0].dirty,false);
 const updated=putLayoutSlot(state,"tenant-a",bank,"passbook","layout-1",draft(bank,"NEW"),local.localRevision);
 assert.equal(markLayoutSynced(state,"tenant-a",bank,"passbook","layout-1",
   local.localRevision,2,"b".repeat(64)),false);
 assert.equal(listLayoutSlots(state,"tenant-a",bank,"passbook")[0].draft.elements[0].label,"NEW");
 assert.equal(updated.remoteHash,"a".repeat(64));
});

test("Step 3: later local edits never erase an incoming remote conflict candidate",()=>{
 const state=blank(),bank="Central Bank of India";
 let local=putLayoutSlot(state,"tenant-a",bank,"passbook","layout-1",draft(bank,"LOCAL"));
 mergeRemoteLayoutSlot(state,"tenant-a",bank,"passbook","layout-1",{
   draft:draft(bank,"INCOMING"),revision:7,hash:"d".repeat(64)
 });
 local=putLayoutSlot(state,"tenant-a",bank,"passbook","layout-1",draft(bank,"LOCAL NEW"),local.localRevision);
 const held=listLayoutSlots(state,"tenant-a",bank,"passbook")[0];
 assert.equal(held.draft.elements[0].label,"LOCAL NEW");
 assert.equal(held.incoming.draft.elements[0].label,"INCOMING");
 assert.equal(markLayoutSynced(state,"tenant-a",bank,"passbook","layout-1",
   local.localRevision,7,"d".repeat(64)),false);
});
