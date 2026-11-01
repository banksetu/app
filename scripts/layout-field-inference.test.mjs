import test from "node:test";
import assert from "node:assert/strict";
import { suggestPassbookLabel, findOverlappingPassbookText } from "../src/layoutFieldInference.ts";

test("recognizes only unambiguous labels, not customer values", () => {
  const fields = [
    ["Account No.:","accountNo","customer"],
    ["Name and Address of Account Holders","fullAddress","customer"],
    ["IFSC CODE","ifsc","bank"],
    ["Branch Address & Tel No.","branchAddress","bank"],
    ["GSTIN","GSTIN","bank"]
  ];
  for(const [input,fieldKey,source] of fields){
    const found=suggestPassbookLabel(input);
    assert.equal(found?.fieldKey,fieldKey,input);
    assert.equal(found?.source,source,input);
  }
  for(const value of ["John Smith", "Account No. 12345678912", "Account No: A1234", "123456789", "Name: John Smith", "Balance 1200"]) {
    assert.equal(suggestPassbookLabel(value),null,value);
  }
});

test("flags exact page-local overlap, excluding distant fields and other pages", () => {
  const result=findOverlappingPassbookText([
    {id:"a",page:1,label:"Account No",x:15,y:20,width:48,height:4},
    {id:"b",page:1,label:"123456",x:32,y:21,width:42,height:4},
    {id:"c",page:2,label:"another page",x:35,y:21,width:40,height:4},
    {id:"d",page:1,label:"IFSC",x:14,y:37,width:30,height:4},
  ]);
  assert.equal(result.length,1);
  assert.equal(result[0].firstId,"a");
  assert.equal(result[0].secondId,"b");
});

test("overlap detection is bounded for large PDFs", () => {
  const parts=Array.from({length:900},(_,i)=>({id:String(i),label:"x",x:(i%20)*9,y:Math.floor(i/20)*6,width:7,height:3}));
  assert.ok(findOverlappingPassbookText(parts).length<=150);
});

test("tall scanned labels are checked beyond the first eight spatial rows", () => {
  const matches=findOverlappingPassbookText([
    {id:"tall",page:1,label:"preprinted panel",x:10,y:10,width:50,height:90},
    {id:"overprint",page:1,label:"printed customer value",x:20,y:80,width:30,height:4}
  ]);
  assert.equal(matches.length,1);
  assert.equal(matches[0].firstId,"tall");
  assert.equal(matches[0].secondId,"overprint");
});

test("malformed boxes and nonpositive result caps are ignored safely", () => {
  const text=[
    {label:"invalid",x:10,y:10,width:-20,height:10},
    {label:"valid a",x:10,y:10,width:30,height:5},
    {label:"valid b",x:12,y:11,width:25,height:5}
  ];
  assert.equal(findOverlappingPassbookText(text).length,1);
  assert.deepEqual(findOverlappingPassbookText(text,0),[]);
  assert.deepEqual(findOverlappingPassbookText(text,-1),[]);
});
