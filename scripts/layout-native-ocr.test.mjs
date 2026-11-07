import test from "node:test";
import assert from "node:assert/strict";
import {mapOpticalTextToMillimeters,detectOfflineOpticalText,rotateOpticalTextBoxesToOriginal} from "../src/layoutOnDeviceOCR.ts";

test("local OCR box geometry uses actual page scale and excludes empty data",()=>{
  const regions=mapOpticalTextToMillimeters([
    {rawValue:"Account   No",boundingBox:{x:25,y:50,width:100,height:10}},
    {rawValue:"   ",boundingBox:{x:0,y:0,width:10,height:10}},
    {rawValue:"IFSC",boundingBox:{x:-2,y:12,width:30,height:15}}
  ],200,300,210,297);
  assert.equal(regions.length,2);
  assert.deepEqual(regions[0],{label:"Account No",x:26.3,y:49.5,width:105,height:9.9});
  assert.equal(regions[1].x,0);
});
test("invalid measurement frame skips optical coordinate imports",()=>{
  assert.deepEqual(mapOpticalTextToMillimeters([{rawValue:"X",boundingBox:{x:0,y:0,width:1,height:1}}],0,300,210,297),[]);
});
test("platform without native OCR reports manual fallback",async()=>{
  const result=await detectOfflineOpticalText({} ,210,297);
  assert.equal(result.supported,false);
  assert.equal(result.items.length,0);
});

test("OCR suggestions stay within the scanned page and discard fully off-canvas boxes",()=>{
  const regions=mapOpticalTextToMillimeters([
    {rawValue:"Clipped left",boundingBox:{x:-10,y:10,width:30,height:20}},
    {rawValue:"Clipped right",boundingBox:{x:190,y:290,width:30,height:20}},
    {rawValue:"Outside",boundingBox:{x:250,y:10,width:20,height:10}},
  ],200,300,210,297);
  assert.equal(regions.length,2);
  assert.deepEqual(regions[0],{label:"Clipped left",x:0,y:9.9,width:21,height:19.8});
  assert.deepEqual(regions[1],{label:"Clipped right",x:199.5,y:287.1,width:10.5,height:9.9});
  for (const region of regions) {
    assert.ok(region.x>=0 && region.y>=0);
    assert.ok(region.x+region.width<=210.01);
    assert.ok(region.y+region.height<=297.01);
  }
});

test("native OCR rotation maps all quarter-turn bounding boxes to source scan",()=>{
  const original={rawValue:"IFSC CODE",boundingBox:{x:30,y:20,width:40,height:10}};
  const width=200,height=100;
  const cw={rawValue:"IFSC CODE",boundingBox:{x:70,y:30,width:10,height:40}};
  const half={rawValue:"IFSC CODE",boundingBox:{x:130,y:70,width:40,height:10}};
  const ccw={rawValue:"IFSC CODE",boundingBox:{x:20,y:130,width:10,height:40}};
  for(const [turn,item] of [[1,cw],[2,half],[3,ccw]]){
    assert.deepEqual(rotateOpticalTextBoxesToOriginal([item],width,height,turn)[0].boundingBox,original.boundingBox);
  }
});
test("bad OCR coordinate transforms remain non-destructive and reject invalid frames",()=>{
  const item={rawValue:"Branch",boundingBox:{x:1,y:2,width:3,height:4}};
  assert.deepEqual(rotateOpticalTextBoxesToOriginal([item],0,100,2),[]);
  assert.deepEqual(rotateOpticalTextBoxesToOriginal([item],100,100,0)[0],item);
});
