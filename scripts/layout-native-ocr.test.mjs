import test from "node:test";
import assert from "node:assert/strict";
import {mapOpticalTextToMillimeters,detectOfflineOpticalText} from "../src/layoutOnDeviceOCR.ts";

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
