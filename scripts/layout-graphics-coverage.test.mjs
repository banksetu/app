import test from "node:test";
import assert from "node:assert/strict";
import {OPS} from "pdfjs-dist/legacy/build/pdf.mjs";
import {analyzePdfGraphicsCoverage} from "../src/layoutGraphicsCoverage.ts";
test("step 3: identify unsupported image, gradient, opacity, clipping and curved path work",()=>{
 const report=analyzePdfGraphicsCoverage({
  fnArray:[OPS.paintImageXObject,OPS.shadingFill,OPS.setGState,OPS.clip,OPS.constructPath],
  argsArray:[[],[],[],[],[[OPS.moveTo,OPS.curveTo],[10,10,20,20,30,30,40,40]]]
 });
 assert.equal(report.rasterImages,1);
 assert.equal(report.gradients,1);
 assert.equal(report.transparency,1);
 assert.equal(report.clipping,1);
 assert.equal(report.complexPaths,1);
 assert.equal(report.warnings.length,5);
});
test("step 3: simple digitally editable line and rectangle paths give no false artwork alert",()=>{
 const report=analyzePdfGraphicsCoverage({
  fnArray:[OPS.constructPath,OPS.stroke,OPS.constructPath,OPS.fill],
  argsArray:[[[OPS.moveTo,OPS.lineTo],[1,1,2,2]],[],[[OPS.rectangle],[3,4,5,6]],[]]
 });
 assert.deepEqual(report.warnings,[]);
});
test("step 3: scanning bound warns when source artwork analysis is incomplete",()=>{
 const report=analyzePdfGraphicsCoverage({fnArray:[OPS.stroke,OPS.stroke,OPS.stroke],argsArray:[[],[],[]]},2);
 assert.ok(report.warnings.some(w=>/capped/.test(w)));
});
