import test from "node:test";
import assert from "node:assert/strict";
import {createPerspectiveMap,rectifyPerspectivePixels} from "../src/layoutPerspectiveGeometry.ts";
import {mapScannedPageToPassbook} from "../src/layoutScanGeometry.ts";
const trapezoid=[
 {x:20,y:30},{x:180,y:20},{x:170,y:160},{x:30,y:170}
];
test("step 1: invert all four corners of a trapezoidal passbook",()=>{
 const map=createPerspectiveMap(trapezoid,200,200);
 for(const [index,expected] of [[0,{x:0,y:0}],[1,{x:1,y:0}],[2,{x:1,y:1}],[3,{x:0,y:1}]]){
   const mapped=map.toNormalized(trapezoid[index].x,trapezoid[index].y);
   assert.ok(Math.abs(mapped.x-expected.x)<.0001);
   assert.ok(Math.abs(mapped.y-expected.y)<.0001);
 }
 for(const [u,v] of [[.5,.5],[.2,.7],[.9,.3]]){
   const source=map.toSource(u,v);
   const restored=map.toNormalized(source.x,source.y);
   assert.ok(Math.abs(restored.x-u)<.0001);
   assert.ok(Math.abs(restored.y-v)<.0001);
 }
});
test("step 1: perspective calibration preserves original fields and other PDF pages",()=>{
 const quad=[{x:10,y:20},{x:190,y:20},{x:190,y:160},{x:10,y:160}];
 const bounds={left:10,right:190,top:20,bottom:160,widthMm:180,heightMm:140,confidence:"low",reason:"manual"};
 const parts=[{page:1,x:30,y:40,width:20,height:10,rotation:0},{page:2,x:30,y:40,width:20,height:10}];
 const mapped=mapScannedPageToPassbook(bounds,200,180,200,180,parts,0,0,quad);
 assert.deepEqual(mapped.elements[0],{page:1,x:20,y:20,width:20,height:10,rotation:0});
 assert.deepEqual(mapped.elements[1],parts[1]);
 assert.equal(parts[0].x,30);
});
test("step 1: planar perspective reference samples its own selected paper, not full A4",()=>{
 const w=60,h=60,data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const k=(y*w+x)*4;
   data[k]=x>=20&&x<40&&y>=20&&y<40?210:255;
   data[k+1]=0;data[k+2]=0;data[k+3]=255;
 }
 const q=[{x:20,y:20},{x:40,y:20},{x:40,y:40},{x:20,y:40}];
 const rectified=rectifyPerspectivePixels(data,w,h,q,20,20);
 assert.equal(rectified.length,20*20*4);
 for(let i=0;i<rectified.length;i+=4){
   assert.equal(rectified[i],210,"crop must sample the marked physical page");
   assert.equal(rectified[i+3],255);
 }
});
test("step 1: reject invalid/crossing/degenerate corners and excessive bitmap work",()=>{
 const crossed=[trapezoid[0],trapezoid[2],trapezoid[1],trapezoid[3]];
 assert.throws(()=>createPerspectiveMap(crossed,200,200));
 assert.throws(()=>createPerspectiveMap(trapezoid,30,30));
 const src=new Uint8ClampedArray(60*60*4);
 assert.throws(()=>rectifyPerspectivePixels(src,60,60,trapezoid,2000,1200));
});

test("step 1: rotated paper preview and dynamic box land on the same pixels",()=>{
 const size=100,quad=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
 const rgba=new Uint8ClampedArray(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const at=(y*size+x)*4;
   rgba[at]=x>=20&&x<30&&y>=20&&y<30?55:255;
   rgba[at+1]=255;rgba[at+2]=255;rgba[at+3]=255;
 }
 const rotated=rectifyPerspectivePixels(rgba,size,size,quad,size,size,90);
 const bounds={left:0,top:0,right:100,bottom:100,widthMm:100,heightMm:100,confidence:"low",reason:"reference"};
 const layer=mapScannedPageToPassbook(bounds,100,100,100,100,[{x:20,y:20,width:10,height:10,page:1}],90,0,quad).elements[0];
 assert.deepEqual([layer.x,layer.y,layer.width,layer.height],[70,20,10,10]);
 const sample=(y*size+75)*4;
 assert.equal(rotated[sample+20*size*4],55);
});
