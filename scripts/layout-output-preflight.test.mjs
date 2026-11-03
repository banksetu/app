import test from "node:test";
import assert from "node:assert/strict";
import {preflightLayoutOutput} from "../src/layoutOutputPreflight.ts";
const item=(change={})=>({
 id:"customer",kind:"field",origin:"customer",label:"Account",fieldKey:"accountNo",
 page:1,x:15,y:95,width:65,height:8,size:11,letterSpacing:0,
 quick:true,dotMatrix:true,preprinted:false,...change
});
const paper={widthMm:190,heightMm:173,pageCount:1};
test("step 5: correctly bound values pass paper/output geometry preflight",()=>{
 const report=preflightLayoutOutput([item()],paper,"dotmatrix","Central Bank of India",()=>"1234567890123");
 assert.deepEqual(report.errors,[]);
});
test("step 5: block out-of-paper positions, missing fields and clear text clipping",()=>{
 const data=[
   item({id:"outside",x:187,width:15}),
   item({id:"missing",fieldKey:"customerName",y:105}),
   item({id:"tooLong",fieldKey:"address",width:8,height:3,y:115}),
 ];
 const report=preflightLayoutOutput(data,paper,"dotmatrix","PNB",part=>
   part.id==="missing"?"":part.id==="tooLong"?"A long customer address will not fit":"123456");
 assert.equal(report.errors.length,3);
 assert.ok(report.errors.some(e=>/outside measured paper/.test(e)));
 assert.ok(report.errors.some(e=>/Missing required/.test(e)));
 assert.ok(report.errors.some(e=>/clipped/.test(e)));
});
test("step 5: custom PR2 output ignores preprinted and graphics, Union Bank static labels",()=>{
 const layers=[
  item({id:"preprinted",kind:"text",origin:"preprinted",preprinted:true}),
  item({id:"graphic",kind:"image",origin:"static",x:500}),
  item({id:"static",kind:"text",origin:"static",x:500}),
  item({id:"dynamic"})
 ];
 const report=preflightLayoutOutput(layers,paper,"dotmatrix","Union Bank of India",()=>"VALUE");
 assert.deepEqual(report.errors,[],"non-printing layers must never block PR2 values-only output");
});
test("step 5: invalid page geometry never silently prints",()=>{
 assert.ok(preflightLayoutOutput([item({page:3})],paper,"quick","PNB",()=>"VALUE").errors.some(x=>/invalid page/.test(x)));
 assert.ok(preflightLayoutOutput([item()],{widthMm:NaN,heightMm:200},"quick","PNB",()=>"VALUE").errors.length);
});
