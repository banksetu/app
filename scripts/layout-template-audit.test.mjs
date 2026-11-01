import test from "node:test";
import assert from "node:assert/strict";
import {auditPassbookTemplate} from "../src/layoutTemplateAudit.ts";

const part=(overrides={})=>({
 id:"one",kind:"field",origin:"customer",fieldKey:"accountNo",label:"Account No",
 page:1,x:20,y:100,width:60,height:8,quick:true,dotMatrix:true,preprinted:false,
 ...overrides
});
const draft=(overrides={})=>({
 mode:"passbook",bankName:"Central Bank of India",widthMm:190,heightMm:173,
 foldMm:86,printStartMm:100,pageCount:1,elements:[part()],...overrides
});
test("valid draft passes static audit without claiming physical print certification",()=>{
 assert.deepEqual(auditPassbookTemplate(draft()),[]);
});
test("missing mappings and content outside paper are flagged",()=>{
 const report=auditPassbookTemplate(draft({elements:[part({fieldKey:"",x:180})]}));
 assert.ok(report.some(item=>item.severity==="error"&&/mapping/.test(item.message)));
 assert.ok(report.some(item=>item.severity==="warning"&&/boundary/.test(item.message)));
});
test("Union Bank values-only guard rejects static dot-matrix labels",()=>{
 const report=auditPassbookTemplate(draft({bankName:"Union Bank of India",elements:[part({origin:"static",fieldKey:""})]}));
 assert.ok(report.some(item=>/values only/.test(item.message)));
});
test("overlapping printed content can be separately marked and reviewed",()=>{
 const report=auditPassbookTemplate(draft({elements:[part({preprinted:true})]}));
 assert.ok(report.some(item=>/Already-printed/.test(item.message)));
});
