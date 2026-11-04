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

test("Step 8: measurement caption and safety notice stay inside 5 mm printable frame",async()=>{
 for(const paper of [
  {widthMm:50,heightMm:50,foldMm:0,printStartMm:0},
  {widthMm:190,heightMm:173,foldMm:86.5,printStartMm:101},
  {widthMm:206,heightMm:175,foldMm:87.5,printStartMm:118},
  {widthMm:270,heightMm:100,foldMm:50,printStartMm:65},
 ]){
  const blob=exportLayoutCalibrationProof(paper);
  const task=getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true});
  const pdf=await task.promise;
  try{
   const page=await pdf.getPage(1),content=await page.getTextContent();
   const caption=content.items.find(x=>typeof x.str==="string"&&x.str.startsWith("PAPER "));
   const footer=content.items.find(x=>typeof x.str==="string"&&x.str.includes("CALIBRATION"));
   assert.ok(caption&&footer,"no measurement or TEST-only warning must be omitted");
   assert.match(caption.str,new RegExp(String(paper.widthMm)));
   assert.match(caption.str,new RegExp(String(paper.heightMm)));
   assert.ok(caption.str.includes("FOLD")&&caption.str.includes("START"));
   for(const item of [caption,footer]){
    const baselineMm=paper.heightMm-item.transform[5]*25.4/72;
    assert.ok(baselineMm>=5&&baselineMm<=paper.heightMm-5,
     "caption/footer text must be within 5mm page margins, not on unprintable stock edge");
   }
   assert.doesNotMatch(content.items.map(x=>x.str||"").join(" " ),
     /PRIVATE|real customer|account no\.?/i);
  }finally{await task.destroy();}
 }
});
