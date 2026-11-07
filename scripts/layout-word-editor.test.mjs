import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {startBlankLayout,alignElementToPage} from "../src/layoutBlankDocument.ts";
const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const original=()=>({bankName:"Any Bank",mode:"passbook",version:1,widthMm:207,heightMm:168,
 foldMm:90,printStartMm:104,pageCount:3,sourceArtworkStatus:"needsReview",
 elements:[{id:"old",label:"Account",origin:"static",x:10,y:15,width:50,height:10}]});
test("step 7: new Word-style blank canvas retains any-bank paper size but not customer/imported content",()=>{
 const old=original(),blank=startBlankLayout(old);
 assert.equal(blank.widthMm,207);
 assert.equal(blank.heightMm,168);
 assert.equal(blank.elements.length,0);
 assert.equal(blank.pageCount,1);
 assert.equal(blank.sourceArtworkStatus,"clean");
 assert.equal(blank.foldMm,90,"A blank page must retain the real physical fold.");
 assert.equal(blank.printStartMm,104,"A blank page must retain the approved print-start guide.");
 assert.equal(old.elements.length,1,"Undo's original snapshot must not mutate");
});
test("step 7: page alignment works in physical mm with arbitrary tall and wide formats",()=>{
 for(const paper of [{widthMm:190,heightMm:175},{widthMm:120,heightMm:280},{widthMm:270,heightMm:100}]){
   const obj={x:7,y:7,width:20,height:12,fieldKey:"accountNo"};
   assert.equal(alignElementToPage(obj,paper,"horizontal","center").x,Math.round((paper.widthMm-20)/2*10)/10);
   assert.equal(alignElementToPage(obj,paper,"horizontal","end").x,paper.widthMm-20);
   assert.equal(alignElementToPage(obj,paper,"vertical","start").y,0);
   assert.equal(alignElementToPage(obj,paper,"vertical","end").y,paper.heightMm-12);
   assert.equal(obj.x,7);
   assert.equal(alignElementToPage(obj,paper,"horizontal","center").fieldKey,"accountNo");
 }
 assert.throws(()=>alignElementToPage({x:0,y:0,width:501,height:10},{widthMm:190,heightMm:175},"horizontal","center"));
});
test("step 7: blank creation, rulers, style clipboard and physical alignment are connected to editor",()=>{
 for(const anchor of ["New Blank Layout (Word-style)","startFromBlank","startBlankLayout",
  "ls-ruler-x","ls-ruler-y","Copy Style","Paste Style","Align object to physical page",
  "mm","cm","in","Undo","Redo"]){
   assert.ok(editor.includes(anchor),"Missing Word-style control: "+anchor);
 }
});
