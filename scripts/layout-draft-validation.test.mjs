import test from "node:test";
import assert from "node:assert/strict";
import {validatePersistedLayoutDraft} from "../src/layoutDraftValidation.ts";
const sample=()=>({
 version:1,mode:"passbook",bankName:"Reference Bank",widthMm:190,heightMm:175,
 foldMm:87,printStartMm:100,pageCount:1,elements:[
 {id:"t-1",kind:"text",label:"Useful Hints",x:10,y:10,width:60,height:8,page:1},
 {id:"f-1",kind:"field",label:"Account",x:10,y:115,width:60,height:6,page:1}
 ]});
test("good older saved draft remains readable without requiring new metadata",()=>{
 assert.equal(validatePersistedLayoutDraft(sample(),"passbook","Reference Bank"),true);
});
test("cross-bank drafts, malformed geometry and duplicate IDs are refused",()=>{
 for(const variant of [
  {widthMm:NaN},{heightMm:Infinity},{foldMm:NaN},{printStartMm:-1},
  {pageCount:0},{pageCount:2.5},{foldMm:176},{widthMm:501},
  {elements:[{...sample().elements[0],x:NaN}]},
  {elements:[sample().elements[0],{...sample().elements[0]}]},
  {elements:[{...sample().elements[0],height:-5}]},
  {elements:[{...sample().elements[0],page:2}]}
 ]){
  const bad={...sample(),...variant};
  assert.equal(validatePersistedLayoutDraft(bad,"passbook","Reference Bank"),false,JSON.stringify(variant));
 }
 assert.equal(validatePersistedLayoutDraft(sample(),"passbook","Other Bank"),false);
});
