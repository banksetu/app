import test from "node:test";
import assert from "node:assert/strict";
import {makeGenericLayoutUpload} from "../src/layoutGenericUpload.ts";
const input=()=>({
 version:1,bankName:"Central Bank of India",mode:"passbook",
 widthMm:190,heightMm:173,foldMm:86,printStartMm:101,pageCount:1,
 sourceArtworkStatus:"reviewed",
 elements:[{
  id:"text-1",kind:"field",origin:"customer",label:"Account No",
  fieldKey:"accountNo",x:10,y:105,width:75,height:12,page:1,
  value:"1234567890123",defaultValue:"PRIVATE ACCOUNT NUMBER",
  localPhoto:"data:image/png;base64,AAAA",privateNotes:"secret",imageData:undefined,
  fontCompression:85,letterSpacing:1.5,quick:true,dotMatrix:true,preprinted:false
 }]
});
test("Step 3: CLOUD request carries only design, no customer value, photo, secret or upload pixels",()=>{
 const draft=input();
 const safe=makeGenericLayoutUpload(draft);
 const wire=JSON.stringify(safe);
 assert.equal(safe.elements[0].value,"");
 assert.equal(safe.elements[0].defaultValue,"");
 assert.equal(safe.elements[0].fontCompression,85);
 assert.equal(safe.elements[0].letterSpacing,1.5);
 for(const privatePart of ["1234567890123","PRIVATE ACCOUNT NUMBER","localPhoto","privateNotes","data:image","sourceArtworkStatus"]){
   assert.equal(wire.includes(privatePart),false,privatePart);
 }
 assert.equal(draft.elements[0].value,"1234567890123",
   "Client sanitizer must not mutate locally saved editable content.");
});
test("Step 3: never transmit suspicious OCR account values in generic labels",()=>{
 for(const label of ["1234 5678 9012 3","user@bank.example","ABCDE1234F"]){
  const draft=input();draft.elements[0].label=label;
  assert.throws(()=>makeGenericLayoutUpload(draft),/identifier/);
 }
});
test("Step 3: generic account type defaults are allowed but never branch/customer details",()=>{
 const draft=input();
 draft.elements[0].fieldKey="accountType";
 draft.elements[0].defaultValue="Saving";
 assert.equal(makeGenericLayoutUpload(draft).elements[0].defaultValue,"Saving");
 draft.elements[0].defaultValue="BANK XYZ, CLIENT ACCOUNT";
 assert.equal(makeGenericLayoutUpload(draft).elements[0].defaultValue,"");
});
test("Step 3: unsupported/incomplete OCR or scanned graphics cannot publish to cloud",()=>{
 const draft=input();draft.sourceArtworkStatus="needsReview";
 assert.throws(()=>makeGenericLayoutUpload(draft),/unsupported scanned graphics/);
});
