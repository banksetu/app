import test from "node:test";
import assert from "node:assert/strict";
import {splitPreprintedAndDynamic} from "../src/layoutLayerRepair.ts";
const sample=()=>({
 id:"raw",kind:"text",origin:"static",label:"Account No",fieldKey:"",
 value:"999999999999",defaultValue:"Private old OCR guess",preprinted:false,
 dotMatrix:true,quick:true,z:4,needsReview:true
});
test("step 4: dynamic layer is field-bound without inherited customer data",()=>{
 const source=sample();
 const {original,overprint}=splitPreprintedAndDynamic(source,"new","Account Number","accountNo","customer");
 assert.equal(original.preprinted,true);
 assert.equal(original.dotMatrix,false);
 assert.equal(original.needsReview,true);
 assert.equal(overprint.kind,"field");
 assert.equal(overprint.fieldKey,"accountNo");
 assert.equal(overprint.origin,"customer");
 assert.equal(overprint.value,"");
 assert.equal(overprint.defaultValue,"");
 assert.equal(overprint.quick,true);
 assert.equal(overprint.dotMatrix,true);
 assert.equal(overprint.needsReview,false);
 assert.equal(source.preprinted,false);
});
test("step 4: Hindi generic field descriptions supported",()=>{
 const result=splitPreprintedAndDynamic(sample(),"new","खाता संख्या","accountNo","customer");
 assert.equal(result.overprint.label,"खाता संख्या");
});
test("step 4: unresolved mappings or account-number-like labels cannot create shared layers",()=>{
 for(const [label,key] of [
  ["Actual 123456789012","accountNo"],["Account Number",""],
  ["Account Number","key with spaces"],["","accountNo"],
 ]){
   assert.throws(()=>splitPreprintedAndDynamic(sample(),"new",label,key,"customer"));
 }
 assert.throws(()=>splitPreprintedAndDynamic(sample(),"raw","Account Number","accountNo","customer"));
});
