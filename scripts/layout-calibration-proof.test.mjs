import test from "node:test";
import assert from "node:assert/strict";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {exportLayoutCalibrationProof,validateCalibrationPaper} from "../src/layoutCalibrationProof.ts";

test("Step 8: physical ruler exports arbitrary real passbook dimensions, not scanner A4",async()=>{
 for(const [widthMm,heightMm,foldMm,printStartMm] of [
   [206,175,88,118],[190,173,86,101],[270,100,50,65],[120,220,110,135]
 ]){
   const blob=exportLayoutCalibrationProof({widthMm,heightMm,foldMm,printStartMm});
   const loading=getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true});
   const pdf=await loading.promise;
   try{
     assert.equal(pdf.numPages,1);
     const page=await pdf.getPage(1),view=page.getViewport({scale:1});
     const measured=[view.width*25.4/72,view.height*25.4/72].sort((a,b)=>a-b);
     const expected=[widthMm,heightMm].sort((a,b)=>a-b);
     assert.ok(Math.abs(measured[0]-expected[0])<.25);
     assert.ok(Math.abs(measured[1]-expected[1])<.25);
     const content=await page.getTextContent();
     const labels=content.items.map(i=>i.str||"").join(" ");
     assert.match(labels,/CALIBRATION ONLY/);
     assert.doesNotMatch(labels,/customer name|account number|123456789012/i);
   }finally{await loading.destroy();}
 }
});
test("Step 8: invalid/suspicious physical sizes never export a false test ruler",()=>{
 for(const paper of [
   {widthMm:210,heightMm:297,foldMm:-1,printStartMm:0},
   {widthMm:190,heightMm:173,foldMm:190,printStartMm:100},
   {widthMm:190,heightMm:173,foldMm:90,printStartMm:Infinity},
   {widthMm:NaN,heightMm:173,foldMm:90,printStartMm:110}
 ])assert.throws(()=>validateCalibrationPaper(paper));
});
