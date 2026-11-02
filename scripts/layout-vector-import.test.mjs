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

test("diagonal PDF strokes keep their true angle rather than disappearing",()=>{
 const result=collectEditableVectorShapes({
  fnArray:[OPS.constructPath,OPS.stroke],
  argsArray:[[[OPS.moveTo,OPS.lineTo],[10,10,30,30]],[]],
 },viewport,100,100);
 assert.equal(result.length,1);
 assert.equal(result[0].kind,"line");
 assert.ok(Math.abs(result[0].rotation+45)<.2);
 assert.ok(Math.abs(result[0].width-28.3)<.2);
 assert.equal(result[0].x,10);
 assert.equal(result[0].y,90);
});
test("cubic Bezier strokes become a bounded set of individually editable segments",()=>{
 const result=collectEditableVectorShapes({
  fnArray:[OPS.constructPath,OPS.stroke],
  argsArray:[[[OPS.moveTo,OPS.curveTo],[10,10,30,70,70,70,90,10]],[]],
 },viewport,100,100);
 assert.equal(result.length,8);
 assert.ok(result.every(p=>p.kind==="line"&&Number.isFinite(p.rotation)));
 assert.ok(result.some(p=>Math.abs(p.rotation)>1));
});
test("rotated rectangles are reconstructed as strokes, not incorrect filled boxes",()=>{
 const radians=Math.PI/6;
 const result=collectEditableVectorShapes({
  fnArray:[OPS.transform,OPS.constructPath,OPS.stroke],
  argsArray:[[Math.cos(radians),Math.sin(radians),-Math.sin(radians),Math.cos(radians),30,30],[[OPS.rectangle],[0,0,20,15]],[]],
 },viewport,100,100);
 assert.equal(result.length,4);
 assert.ok(result.every(p=>p.kind==="line"));
});

test("filled-only cubic vector shapes are not invented as visible lines",()=>{
 const result=collectEditableVectorShapes({
   fnArray:[OPS.setFillRGBColor,OPS.constructPath,OPS.fill],
   argsArray:[[1,0,0],[[OPS.moveTo,OPS.curveTo],[10,10,25,70,60,70,80,10]],[]],
 },viewport,100,100);
 assert.equal(result.length,0,"curve fill should remain source-reference art, not made-up strokes");
});
test("filled rectangles still preserve original fill color",()=>{
 const result=collectEditableVectorShapes({
   fnArray:[OPS.setFillRGBColor,OPS.constructPath,OPS.fill],
   argsArray:[[0,1,0],[[OPS.rectangle],[10,10,40,30]],[]],
 },viewport,100,100);
 assert.equal(result.length,1);
 assert.equal(result[0].background,"#00ff00");
});
