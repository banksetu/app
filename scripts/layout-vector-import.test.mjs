import test from "node:test";
import assert from "node:assert/strict";
import {OPS} from "pdfjs-dist/legacy/build/pdf.mjs";
import {collectEditableVectorShapes} from "../src/layoutVectorImport.ts";
const viewport={width:100,height:100,convertToViewportPoint:(x,y)=>[x,100-y]};
test("rebuilds PDF vector rectangles as independent editable geometry",()=>{
 const result=collectEditableVectorShapes({
  fnArray:[OPS.setStrokeRGBColor,OPS.constructPath,OPS.stroke],
  argsArray:[[0,0,1],[[OPS.rectangle],[10,10,50,20]],[]],
 },viewport,100,100);
 assert.equal(result.length,1);
 assert.equal(result[0].kind,"rectangle");
 assert.equal(result[0].x,10);
 assert.equal(result[0].y,70);
 assert.equal(result[0].width,50);
 assert.equal(result[0].height,20);
 assert.equal(result[0].color,"#0000ff");
});
test("reconstructs PDF fill color without pasting scanned page",()=>{
 const result=collectEditableVectorShapes({
  fnArray:[OPS.setFillRGBColor,OPS.constructPath,OPS.fill],
  argsArray:[[1,0,0],[[OPS.rectangle],[20,30,40,20]],[]],
 },viewport,100,100);
 assert.equal(result[0].background,"#ff0000");
});
test("limits vector elements for low-end mobile renderers",()=>{
 const f=[],a=[];
 for(let i=0;i<30;i++){f.push(OPS.constructPath,OPS.stroke);a.push([[OPS.rectangle],[1,1+i,20,5]],[]);}
 const result=collectEditableVectorShapes({fnArray:f,argsArray:a},viewport,100,100,12);
 assert.equal(result.length,12);
});
