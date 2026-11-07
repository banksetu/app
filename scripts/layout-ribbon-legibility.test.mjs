import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {contrastRatio,reviewPassbookLegibility} from "../src/layoutRibbonLegibility.ts";
const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");

test("independent contrast math catches unreadable print colors",()=>{
 assert.ok(Math.abs(contrastRatio("#000000","#ffffff")-21)<.01);
 assert.equal(contrastRatio("#ffffff","#ffffff"),1);
 assert.equal(contrastRatio("transparent","#ffffff"),null);
});
test("advisory review covers small text, OCR, missing mappings without inspecting customer values",()=>{
 const fields=[
  {id:"txt",kind:"text",origin:"static",label:"Name",size:7,color:"#bbbbbb",background:"#ffffff",page:1,height:3,quick:true,dotMatrix:true},
  {id:"dynamic",kind:"field",origin:"customer",label:"Customer",fieldKey:"",size:11,needsReview:true,page:1,quick:true,dotMatrix:true},
  {id:"decor",kind:"text",origin:"static",label:"Quick Decoration",size:8,page:1,quick:true,dotMatrix:false},
 ];
 const quick=reviewPassbookLegibility(fields,"quick");
 assert.ok(quick.some(x=>x.id==="txt"&&/contrast/.test(x.message)));
 assert.ok(quick.some(x=>x.id==="dynamic"&&x.severity==="error"));
 const pr2=reviewPassbookLegibility(fields,"dotmatrix");
 assert.equal(pr2.some(x=>x.id==="decor"),false,"Quick-only shape must not be inspected as PR2");
 assert.equal(pr2.some(x=>/contrast/.test(x.message)),false,"Quick color contrast does not certify dot matrix");
});
test("Review tab uses locally computed findings and never claims physical printer certification",()=>{
 assert.match(editor,/reviewPassbookLegibility\(draft\.elements,setup\.output\)/);
 assert.match(editor,/checkLegibility}>Accessibility \/ Legibility Check/);
 assert.match(editor,/confirm Epson print on physical passbook paper/);
 assert.match(editor,/className="ls-legibility-panel"/);
});
