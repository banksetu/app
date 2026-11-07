import test from "node:test";
import assert from "node:assert/strict";
import {measureLayoutDifference} from "../src/layoutVisualDiff.ts";

test("identical source and editable layer get zero pixel difference",()=>{
  const sample=new Uint8ClampedArray([40,50,60,255,255,255,255,255]);
  const result=measureLayoutDifference(sample,sample.slice());
  assert.equal(result.meanDifferencePercent,0);
  assert.equal(result.strongMismatchPercent,0);
});
test("black vs white has maximum mismatch",()=>{
  const a=new Uint8ClampedArray([0,0,0,255]);
  const b=new Uint8ClampedArray([255,255,255,255]);
  const result=measureLayoutDifference(a,b);
  assert.equal(result.meanDifferencePercent,100);
  assert.equal(result.strongMismatchPercent,100);
});
test("wrong canvas sizes are not given misleading scores",()=>{
  assert.throws(()=>measureLayoutDifference(new Uint8ClampedArray(4),new Uint8ClampedArray(8)));
});
