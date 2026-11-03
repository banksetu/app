import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {
 compressedTextStyle,typographyCompression,typographyIsValid,trackingMm,
} from "../src/layoutTypography.ts";
import {exportLayoutProofPdf} from "../src/layoutProofPdf.ts";
import {sanitizeLayoutTemplate} from "../cloudflare/layoutTemplates.js";

test("Office ribbon supports 0.5 px increments from 0 to 10 px and 50–100% font width",()=>{
 for(let i=0;i<=20;i++){
   const tracking=i/2;
   assert.equal(typographyIsValid({letterSpacing:tracking,fontCompression:75}),true);
   assert.ok(Math.abs(trackingMm({letterSpacing:tracking})-tracking*25.4/96)<1e-10);
 }
 assert.equal(typographyCompression(undefined),1);
 assert.equal(typographyCompression(50),.5);
 assert.equal(typographyCompression(75),.75);
 for(const invalid of [25,49,101,NaN,Infinity])
   assert.equal(typographyIsValid({fontCompression:invalid}),false);
});

test("compressed text stretches its wrapping width without compressing physical paper/selection",()=>{
 const normal=compressedTextStyle({letterSpacing:.5,fontCompression:100},1.5);
 assert.equal(normal.transform,"scaleX(1)");
 assert.equal(normal.letterSpacing,"0.75px");
 const compressed=compressedTextStyle({letterSpacing:2,fontCompression:60});
 assert.equal(compressed.transform,"scaleX(0.6)");
 assert.ok(Math.abs(parseFloat(compressed.width)-166.66666)<.001);
 assert.equal(compressed.transformOrigin,"left top");
});

const item=(change={})=>({
 id:"part-1",kind:"field",page:1,origin:"customer",
 label:"Account type",fieldKey:"accountType",value:"PRIVATE_TEST_VALUE",
 defaultValue:"Saving",x:12,y:80,width:80,height:12,z:1,
 rotation:0,size:16,letterSpacing:0,fontCompression:100,opacity:1,borderWidth:1,
 align:"left",bold:true,italic:false,underline:false,font:"Arial",
 color:"#101010",background:"transparent",borderColor:"#333333",
 quick:true,dotMatrix:true,preprinted:false,...change
});
const draft=(elements)=>({
 version:1,mode:"passbook",bankName:"Generic Test Bank",
 widthMm:190,heightMm:175,foldMm:87,printStartMm:90,pageCount:1,elements
});

test("new compression is sanitized, persists and never includes customer values",()=>{
 const safe=sanitizeLayoutTemplate(draft([item({letterSpacing:3.5,fontCompression:65})]),"Generic Test Bank");
 assert.equal(safe.elements[0].letterSpacing,3.5);
 assert.equal(safe.elements[0].fontCompression,65);
 assert.equal(safe.elements[0].value,"");
 const legacy=sanitizeLayoutTemplate(draft([item({fontCompression:undefined})]),"Generic Test Bank");
 assert.equal(legacy.elements[0].fontCompression,100);
 for(const invalid of [-2,0,45,101,Infinity,NaN]){
   assert.throws(()=>sanitizeLayoutTemplate(draft([item({fontCompression:invalid})]),"Generic Test Bank"),/Invalid layout element/);
 }
});

test("Quick PDF proof preserves actual horizontal glyph compression and letter spacing",async()=>{
 const phrase="ABCDEFG123456";
 const common=item({kind:"text",origin:"static",fieldKey:"",label:phrase,
   value:"",defaultValue:"",width:130,height:20,size:18,dotMatrix:false});
 const layout=draft([
   common,
   {...common,id:"compressed",y:110,fontCompression:60},
   {...common,id:"lettergap",y:140,letterSpacing:4,fontCompression:100}
 ]);
 const blob=await exportLayoutProofPdf(layout,"quick");
 const loading=getDocument({data:new Uint8Array(await blob.arrayBuffer()),
   useSystemFonts:true,disableFontFace:true});
 const doc=await loading.promise;
 try{
   const page=await doc.getPage(1);
   const content=await page.getTextContent();
   const items=content.items.filter(x=>typeof x.str==="string"&&x.str.replace(/\s+/g,"")===phrase);
   assert.equal(items.length,3,JSON.stringify(content.items.map(x=>x.str)));
   assert.ok(items[1].width<items[0].width*.72,
     "60% font width should produce a visibly narrower proof glyph run");
   assert.ok(items[2].width>items[0].width+8,
     "4 px letter tracking should widen the proof glyph run");
 }finally{await loading.destroy();}
});

test("Office formatting is saved and rendered in editor, browser print and PDF",()=>{
 const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
 const browser=readFileSync(new URL("../src/WorkspaceTemplateDocument.tsx",import.meta.url),"utf8");
 const proof=readFileSync(new URL("../src/layoutProofPdf.ts",import.meta.url),"utf8");
 for(const label of ["Letter gap (px)","Font width / compression","Font compression percentage","compressedTextStyle"])
   assert.ok(editor.includes(label),"Office control missing: "+label);
 assert.match(browser,/compressedTextStyle\(item\)/);
 assert.match(proof,/horizontalScale:compression/);
 assert.match(proof,/charSpace/);
});
