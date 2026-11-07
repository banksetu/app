import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {wordTransform,wordNudge,wordGroup,wordGroupIds} from "../src/layoutWordGeometry.ts";
import {compressedTextStyle,typographyIsValid} from "../src/layoutTypography.ts";
import {sanitizeLayoutTemplate} from "../cloudflare/layoutTemplates.js";
const page={widthMm:190,heightMm:175};
const a=(id,x,y,w=20,h=10)=>({id,page:1,x,y,width:w,height:h,size:12});
test("Word alignment uses the selected anchor, leaves other objects unchanged",()=>{
 const src=[a("a",14,60,30,9),a("b",37,79),a("other",80,80)];
 const r=wordTransform(src,["a","b"],page,{kind:"align",direction:"left",target:"selection"},"a");
 assert.equal(r[1].x,14);assert.equal(r[2],src[2]);assert.equal(src[1].x,37);
 const s=wordTransform(r,["a","b"],page,{kind:"size",dimension:"both"},"a");
 assert.equal(s[1].width,30);assert.equal(s[1].height,9);
});
test("Word distribute supports equal and custom gaps without shifting outsiders",()=>{
 const src=[a("a",10,40,20,10),a("b",55,70,15,7),a("c",110,100,30,13)];
 const r=wordTransform(src,["a","b","c"],page,{kind:"distribute",axis:"horizontal"});
 assert.equal(r[1].x-r[0].x-r[0].width,r[2].x-r[1].x-r[1].width);
 const v=wordTransform(src,["a","b","c"],page,{kind:"distribute",axis:"vertical",gapMm:5});
 assert.equal(v[1].y,55);assert.equal(v[2].y,67);
});
test("Word commands reject clipping, locked objects and unrelated pages",()=>{
 assert.throws(()=>wordTransform([a("a",180,10,10),a("b",15,30,20)],["a","b"],page,
  {kind:"size",dimension:"width"},"b"),/outside/);
 assert.throws(()=>wordTransform([{...a("a",20,20),locked:true},a("b",30,30)],["a","b"],page,
  {kind:"align",direction:"left",target:"page"}),/Unlock/);
 assert.throws(()=>wordTransform([a("a",10,10,40),a("b",20,30,40),a("c",30,50,40)],["a","b","c"],page,
  {kind:"distribute",axis:"horizontal"}),/overlap/);
 assert.throws(()=>wordTransform([a("a",10,20),{...a("b",20,40),page:2}],["a","b"],page,
  {kind:"size",dimension:"both"}),/one page/);
});
test("Grouping and bounded nudge preserve coordinates and input",()=>{
 const src=[a("a",0,40),a("b",165,40),a("other",80,80)];
 const r=wordNudge(src,["a","b"],page,-5,12);
 assert.equal(r[0].x,0);assert.equal(r[1].y,52);
 const grouped=wordGroup(src,["a","b"],"group-demo");
 assert.deepEqual(wordGroupIds(grouped,grouped[0]),["a","b"]);
 assert.equal(wordGroup(grouped,["a","b"],null)[0].groupId,undefined);
 assert.equal(src[0].groupId,undefined);
});
test("Line spacing persists through sanitization without customer values",()=>{
 assert.equal(compressedTextStyle({fontCompression:100}).lineHeight,1.18);
 assert.equal(compressedTextStyle({lineHeight:1.5}).lineHeight,1.5);
 for(const h of [.8,1,1.15,1.5,2,3])assert.equal(typographyIsValid({lineHeight:h}),true);
 for(const h of [0,.5,3.1,NaN,Infinity])assert.equal(typographyIsValid({lineHeight:h}),false);
 const part={...a("name",15,90,90,20),kind:"field",origin:"customer",label:"Name",fieldKey:"name",
  value:"PRIVATE CUSTOMER",defaultValue:"",z:1,rotation:0,font:"Arial",bold:false,italic:false,underline:false,
  align:"left",color:"#000000",background:"transparent",borderColor:"#000000",borderWidth:1,
  letterSpacing:0,fontCompression:100,opacity:1,quick:true,dotMatrix:true,preprinted:false,
  lineHeight:1.5,locked:true,groupId:"group-demo"};
 const d={version:1,mode:"passbook",bankName:"Demo Bank",widthMm:190,heightMm:175,
  foldMm:87,printStartMm:90,pageCount:1,elements:[part]};
 const clean=sanitizeLayoutTemplate(d,"Demo Bank");
 assert.equal(clean.elements[0].lineHeight,1.5);assert.equal(clean.elements[0].locked,true);
 assert.equal(clean.elements[0].groupId,"group-demo");assert.equal(clean.elements[0].value,"");
 assert.throws(()=>sanitizeLayoutTemplate({...d,elements:[{...part,lineHeight:4}]},"Demo Bank"),/Invalid layout element/);
});
test("Word layout toolbar and both output modes use retained spacing",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const studio=read("src/CustomizeLayoutStudio.tsx");
 for(const s of ["Align selected","Distribute","Equal width","Equal height","Baseline","Group","Ungroup","Lock","Line spacing","Select Page Objects"])
  assert.ok(studio.includes(s),s);
 assert.match(read("src/WorkspaceTemplateDocument.tsx"),/lineHeight:part.lineHeight\?\?1.18/);
 assert.match(read("src/layoutProofPdf.ts"),/lineHeightFactor:part.lineHeight\?\?1.18/);
 assert.match(read("src/layoutOutputPreflight.ts"),/part.lineHeight\?\?1.18/);
});
