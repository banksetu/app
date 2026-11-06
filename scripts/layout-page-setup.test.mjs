import test from "node:test";
import assert from "node:assert/strict";
import {PAPER_PRESETS,geometryErrors,pageMeasurements,pageSetupFor,presetGeometry} from "../src/layoutPageSetup.ts";
import {sanitizePageSetup} from "../cloudflare/layoutPageGeometry.js";
import {validatePersistedLayoutDraft} from "../src/layoutDraftValidation.ts";
import {makeGenericLayoutUpload} from "../src/layoutGenericUpload.ts";
import {readFileSync} from "node:fs";
const preset=presetGeometry("passbook-190");
const draft=()=>({version:1,bankName:"Central Bank of India",mode:"passbook",
  pageCount:1,...preset,elements:[]});
test("full-open book size, horizontal fold, data after fold and content margins",()=>{
 assert.ok(preset);
 assert.equal(PAPER_PRESETS.length>=5,true);
 assert.deepEqual(geometryErrors(preset),[]);
 const info=pageMeasurements(preset);
 assert.equal(info.firstHalfMm,87.5);
 assert.equal(info.secondHalfMm,87.5);
 assert.equal(info.printStartFromFoldMm,12.5);
 assert.equal(info.contentWidthMm,174);
 assert.equal(info.contentHeightMm,159);
 assert.equal(sanitizePageSetup(preset).foldAxis,"horizontal");
});
test("vertical spine, flat page and legacy approved layouts remain compatible",()=>{
 const vertical={widthMm:206,heightMm:175,foldMm:103,printStartMm:117,
   pageSetup:{foldAxis:"vertical",marginTopMm:6,marginBottomMm:6,marginLeftMm:7,marginRightMm:7}};
 assert.deepEqual(geometryErrors(vertical),[]);
 assert.equal(pageMeasurements(vertical).secondHalfMm,103);
 assert.equal(sanitizePageSetup(vertical).foldAxis,"vertical");
 const flat=presetGeometry("a4-portrait");
 assert.deepEqual(geometryErrors(flat),[]);
 assert.equal(pageMeasurements(flat).foldAxis,"none");
 const legacy={widthMm:190,heightMm:175,foldMm:88,printStartMm:100};
 assert.deepEqual(geometryErrors(legacy),[]);
 assert.equal(pageSetupFor(legacy).foldAxis,"horizontal");
 assert.equal(sanitizePageSetup(legacy),undefined);
});
test("out-of-paper measurements, invalid margins and unsafe metadata are refused",()=>{
 const bad=[
  {...preset,foldMm:180},
  {...preset,printStartMm:85},
  {...preset,widthMm:40},
  {...preset,pageSetup:{...preset.pageSetup,marginLeftMm:100,marginRightMm:100}},
  {...preset,pageSetup:{...preset.pageSetup,foldAxis:"none"}},
  {...preset,pageSetup:{...preset.pageSetup,evilToken:"secret"}},
 ];
 for(const page of bad){
   assert.ok(geometryErrors(page).length||page.pageSetup.evilToken,JSON.stringify(page));
   assert.throws(()=>sanitizePageSetup(page));
 }
 assert.equal(validatePersistedLayoutDraft({...draft(),pageSetup:{...preset.pageSetup,marginTopMm:400}},
   "passbook","Central Bank of India"),false);
});
test("measurements stay in draft and generic outgoing bank template",()=>{
 const current=draft();
 assert.equal(validatePersistedLayoutDraft(current,"passbook","Central Bank of India"),true);
 const exported=makeGenericLayoutUpload(current);
 assert.equal(exported.pageSetup.foldAxis,"horizontal");
 assert.deepEqual(exported.pageSetup,preset.pageSetup);
});
test("Layout tab provides actual physical page controls and live book-fold guide",()=>{
 const ui=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
 const setup=readFileSync(new URL("../src/PassbookPageSetup.tsx",import.meta.url),"utf8");
 for(const key of ["Full open width","Full open height","Fold exactly in half","Gap after fold",
  "Left","Right","Top","Bottom","Live Size Guide","Fold direction"])
  assert.ok(setup.includes(key),key);
 for(const key of ["pageSetupFor(draft)","PassbookPageSetup","ls-paper-safe-area",
  "ls-book-vertical-fold","setPhysicalChecked(false)"])
  assert.ok(ui.includes(key),key);
 assert.match(ui,/wordTab==="layout"/);
});
