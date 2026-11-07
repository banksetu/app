import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validatePrivateLayoutDraft,privateLayoutDraftPath,privateDraftRevision} from "../cloudflare/layoutPrivateDraft.js";
const page=()=>({version:1,mode:"passbook",bankName:"Central Bank of India",widthMm:190,heightMm:173,foldMm:86.5,printStartMm:101,pageCount:1,
  sourceArtworkStatus:"needsReview",elements:[{id:"ocr-1",kind:"text",origin:"static",label:"बैंक: संशोधन; Account No.",
    fieldKey:"",value:"",defaultValue:"",x:12,y:104,width:150,height:10,z:1,page:1,rotation:0,font:"Arial",size:11,
    bold:false,italic:false,underline:false,align:"left",color:"#000000",background:"transparent",
    borderColor:"#000000",borderWidth:1,letterSpacing:0,opacity:1,quick:true,dotMatrix:false,preprinted:false,needsReview:true}]});
test("unfinished OCR/Word text can be recovered without public catalog approval",()=>{
 const source=page();const result=validatePrivateLayoutDraft(source,source.bankName,source.mode);
 assert.equal(result.elements[0].label,source.elements[0].label);
 assert.equal(result.elements[0].needsReview,true);
 assert.notEqual(result,source);
});
test("private cloud backup cannot target another tenant, inject arbitrary fields, or embed metadata",()=>{
 const p=page();
 assert.notEqual(privateLayoutDraftPath("tenant-a","central-bank-of-india","passbook","layout-1"),
   privateLayoutDraftPath("tenant-b","central-bank-of-india","passbook","layout-1"));
 assert.throws(()=>privateLayoutDraftPath("../root","central-bank-of-india","passbook","layout-1"));
 assert.throws(()=>privateLayoutDraftPath("tenant-a","central-bank-of-india","passbook","layout-0"));
 assert.throws(()=>validatePrivateLayoutDraft({...p,customerRecords:[{name:"private"}]},p.bankName,p.mode));
 assert.throws(()=>validatePrivateLayoutDraft({...p,bankName:"Other Bank"},p.bankName,p.mode));
 assert.throws(()=>validatePrivateLayoutDraft({...p,elements:[{...p.elements[0],accessToken:"secret"}]},p.bankName,p.mode));
 assert.throws(()=>validatePrivateLayoutDraft({...p,elements:[{...p.elements[0],x:189}]},p.bankName,p.mode));
 assert.throws(()=>validatePrivateLayoutDraft({...p,elements:[{...p.elements[0],imageData:"javascript:alert(1)"}]},p.bankName,p.mode));
});
test("remote revision and checksum reject other tenant documents",()=>{
 const row={tenantId:"tenant-a",bankKey:"central-bank-of-india",mode:"passbook",slotId:"layout-1",
 revision:3,hash:"a".repeat(64),size:100,encoding:"gzip-base64",payload:"ABCD"};
 assert.equal(privateDraftRevision(row,"tenant-a","central-bank-of-india","passbook","layout-1"),3);
 assert.throws(()=>privateDraftRevision(row,"tenant-b","central-bank-of-india","passbook","layout-1"));
 assert.throws(()=>privateDraftRevision({...row,hash:"bad"},"tenant-a","central-bank-of-india","passbook","layout-1"));
});
test("Worker checks tenant Bank Information, client admin writes and compare-and-swap",()=>{
 const worker=readFileSync(new URL("../cloudflare/worker.js",import.meta.url),"utf8");
 for(const route of ["/layout-private-read","/layout-private-save"])
   assert.ok(worker.split('"'+route+'"').length>=4,route+" must exist in handler and supported route registries");
 assert.match(worker,/Only the Client Admin can update private layout drafts/);
 assert.match(worker,/privateDraftRevision/);
 assert.match(worker,/body\.expectedRevision!==revision/);
 assert.match(worker,/currentDocument:found\?\{updateTime:found\.updateTime\}:\{exists:false\}/);
});
test("live preview uses separate Quick/PR2 slot key and preserves original bank rendering",()=>{
 const component=readFileSync(new URL("../src/CustomBankDocument.tsx",import.meta.url),"utf8");
 assert.match(component,/layoutOutput=formatType==="passbook"\?"dotmatrix":"quick"/);
 assert.match(component,/slot:layoutMode==="accountOpening"\?1:activeSlot/);
 assert.match(component,/BankFormatPrint/);
 assert.match(component,/markPassbookPrinted/);
});
