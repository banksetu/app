import test from "node:test";
import assert from "node:assert/strict";
import {reconcileImportedText,textForOverlapReview} from "../src/layoutImportReview.ts";
const part=(id,label,x,y,needsReview=false,other={})=>({
  id,label,x,y,width:40,height:7,kind:"text",page:1,needsReview,...other
});
test("embedded PDF text suppresses the exact OCR duplicate, not different overprinted data",()=>{
 const imported=[part("ocr","Account No",15,20,true),
  part("digital","Account No",15.5,20.1,false),
  part("number","123456789",15.5,20.1,true),
  part("other-page","Account No",15,20,true,{page:2}),
  part("far","Account No",90,20,true)];
 const result=reconcileImportedText(imported);
 assert.equal(result.duplicateOcrCount,1);
 assert.deepEqual(result.elements.map(x=>x.id),["digital","number","other-page","far"]);
 assert.equal(imported.length,5);
});
test("matching text without physical overlap is not deduplicated",()=>{
 const result=reconcileImportedText([
  part("ocr","Name",20,20,true),part("digital","Name",20,40,false)
 ]);
 assert.equal(result.duplicateOcrCount,0);
 assert.equal(result.elements.length,2);
});
test("graphics and blanks never enter text overlap review",()=>{
 const data=[part("one","A",10,10),
  part("graphic","PDF vector",10,10,false,{kind:"rectangle"}),
  part("empty"," ",10,10),
  part("invalid","hi",NaN,0)];
 assert.deepEqual(textForOverlapReview(data).map(x=>x.id),["one"]);
});
