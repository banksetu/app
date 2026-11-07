import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {withFoldDirection,pageMeasurements,geometryErrors,presetGeometry} from "../src/layoutPageSetup.ts";

const source=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const setup=readFileSync(new URL("../src/PassbookPageSetup.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/CustomizeLayoutReferenceLock.css",import.meta.url),"utf8");

test("both physical fold choices preserve measured full-open page and prior gap after fold",()=>{
 const horizontal=presetGeometry("passbook-190");
 assert.ok(horizontal);
 const vertical=withFoldDirection(horizontal,"vertical");
 assert.equal(vertical.widthMm,190);
 assert.equal(vertical.heightMm,175);
 assert.equal(vertical.pageSetup.foldAxis,"vertical");
 assert.equal(vertical.foldMm,95);
 assert.equal(vertical.printStartMm,107.5);
 assert.equal(pageMeasurements(vertical).printStartFromFoldMm,12.5);
 assert.deepEqual(geometryErrors(vertical),[]);
 const again=withFoldDirection(vertical,"horizontal");
 assert.equal(again.foldMm,87.5);
 assert.equal(again.printStartMm,100);
 assert.equal(pageMeasurements(again).printStartFromFoldMm,12.5);
 assert.deepEqual(geometryErrors(again),[]);
 assert.equal(horizontal.pageSetup.foldAxis,"horizontal","no mutation of original draft");
});

test("flat A4 and legacy drafts remain safe; no printer changes",()=>{
 const horizontal=presetGeometry("passbook-190");
 assert.ok(horizontal);
 const flat=withFoldDirection(horizontal,"none");
 assert.equal(flat.foldMm,0);assert.equal(flat.printStartMm,0);
 assert.deepEqual(geometryErrors(flat),[]);
 const fromFlat=withFoldDirection(flat,"vertical");
 assert.equal(fromFlat.foldMm,95);assert.equal(fromFlat.printStartMm,107);
 assert.deepEqual(geometryErrors(fromFlat),[]);
 assert.throws(()=>withFoldDirection(horizontal,"diagonal"),/Unsupported/);
 const legacy={widthMm:206,heightMm:175,foldMm:88,printStartMm:116};
 const vertical=withFoldDirection(legacy,"vertical");
 assert.equal(vertical.foldMm,103);
 assert.equal(vertical.printStartMm,131);
 assert.deepEqual(geometryErrors(vertical),[]);
});

test("fold direction is selectable NEXT TO open-book width & height, and on Layout ribbon",()=>{
 const width=setup.indexOf("Full open width");
 const chooser=setup.indexOf("ls-fold-direction-chooser");
 const secondSection=setup.indexOf("2. Fold Line Position");
 assert.ok(width>=0&&chooser>width&&secondSection>chooser);
 for(const text of ["Horizontal Fold","Vertical Fold","No Fold","aria-pressed={axis===value}",
  "onPageSetup({...cfg,foldAxis:value})","ls-fold-direction-icon-"]){
  assert.ok(setup.includes(text),text);
 }
 assert.ok(source.includes("withFoldDirection(draft,next.foldAxis)"));
 assert.ok(source.includes('aria-label="Quick choose book fold direction"'));
 assert.ok(source.includes('onChange={e=>chooseFoldDirection(e.target.value as FoldAxis)}'));
 assert.match(css,/\.ls-fold-direction-options/);
 assert.match(css,/\.ls-fold-direction-icon-vertical/);
 assert.match(css,/\.ls-fold-direction-icon-horizontal/);
});

test("user-friendly ribbon quick tools execute real handlers, keep Direct PR2 pictures disabled",()=>{
 assert.match(source,/className="ls-ribbon-quick-tools"/);
 for(const label of ["Text Box","Table","Customer Name","Bank Field","Picture","Book Size & Fold","Preview PDF","Save Draft"]){
  assert.ok(source.includes(" "+label+"<")||source.includes("> "+label+"<"),label);
 }
 for(const handler of ['append("text","static"','insertEditableTable(2,3)','append("field","customer"',
  'append("field","bank"','setPageSetupOpen(true)','void proofPdf()','void save()']){
  assert.ok(source.includes(handler),handler);
 }
 assert.match(source,/disabled=\{busy\|\|setup.output==="dotmatrix"\} onChange=\{event=>\{void importGraphic\(event\);\}\}/);
 assert.match(css,/\.ls-ribbon-quick-tools/);
 assert.match(css,/\.ls-word-tab-icon/);
 assert.match(source,/className="ls-ribbon-more-tools"/);
 assert.match(source,/aria-label="Additional easy passbook tools"/);
 for(const text of ["Account Number","IFSC","Nominee","Rectangle","Line","Oval","Photo Box","Object Format","Ruler","Grid"]){
   assert.ok(source.includes(" "+text+"<")||source.includes(">"+text+"<"),"missing extra tool: "+text);
 }
 assert.match(source,/disabled=\{setup\.output==="dotmatrix"\}/);
 assert.match(source,/Fold: \{pageSetupFor\(draft\)\.foldAxis==="horizontal"/);
 assert.match(css,/\.ls-ribbon-more-content/);
});
