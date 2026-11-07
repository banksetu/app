import test from "node:test";
import assert from "node:assert/strict";
import {findEditableLabels,replaceEditableLabels} from "../src/layoutWordFindReplace.ts";
const part=(kind,origin,label,page=1,locked=false)=>({kind,origin,label,page,locked});
test("Word find excludes all customer/bank/preprinted text",()=>{
 const parts=[part("text","static","Bank Address"),part("field","customer","Bank Address"),
 part("text","preprinted","Bank Address"),part("text","static","bank address",2)];
 assert.deepEqual(findEditableLabels(parts,"BANK",1),[0]);
 assert.deepEqual(findEditableLabels(parts,"bank"),[0,3]);
 const result=replaceEditableLabels(parts,"bank","Branch",1);
 assert.equal(result.changed,1);assert.equal(result.parts[0].label,"Branch Address");
 assert.equal(result.parts[1],parts[1]);assert.equal(result.parts[2],parts[2]);
 assert.equal(result.parts[3],parts[3]);assert.equal(parts[0].label,"Bank Address");
});
test("Find/Replace handles multiple static matches and locked input safely",()=>{
 const parts=[part("text","static","BANK bank BANK"),part("text","static","bank",2)];
 const result=replaceEditableLabels(parts,"bank","Branch");
 assert.equal(result.changed,4);assert.equal(result.parts[0].label,"Branch Branch Branch");
 assert.throws(()=>replaceEditableLabels([part("text","static","bank",1,true)],"bank","BRANCH"),/Unlock/);
 assert.throws(()=>replaceEditableLabels(parts,"",""),/invalid/);
});
