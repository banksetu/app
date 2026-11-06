import test from "node:test";
import assert from "node:assert/strict";
import {extractTesseractLines} from "../src/layoutTesseractBlocks.ts";

test("local Hindi/English OCR line boxes preserve bounded geometry and confidence",()=>{
 const blocks=[{paragraphs:[{lines:[
  {text:"  खाता संख्या  ",confidence:92,bbox:{x0:5,y0:12,x1:105,y1:28}},
  {text:"Account No:",confidence:48,bbox:{x0:10,y0:32,x1:110,y1:45}}
 ]}]}];
 const results=extractTesseractLines(blocks);
 assert.deepEqual(results,[
  {rawValue:"खाता संख्या",confidence:92,boundingBox:{x:5,y:12,width:100,height:16}},
  {rawValue:"Account No:",confidence:48,boundingBox:{x:10,y:32,width:100,height:13}},
 ]);
});
test("malformed or private OCR block objects never crash or bypass output cap",()=>{
 const line={text:"Branch Name",confidence:20,bbox:{x0:1,y0:2,x1:100,y1:30}};
 const bad={text:"broken",confidence:100,bbox:{x0:1,y0:2,x1:Number.NaN,y1:30}};
 const blocks=[{paragraphs:[{lines:[bad,...Array.from({length:300},()=>line)]}]}];
 assert.equal(extractTesseractLines(blocks).length,250);
 assert.equal(extractTesseractLines(blocks,1).length,1);
 assert.deepEqual(extractTesseractLines(blocks,0),[]);
 assert.deepEqual(extractTesseractLines(null),[]);
});
