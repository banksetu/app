import test from "node:test";
import assert from "node:assert/strict";
import {getDocument,OPS} from "pdfjs-dist/legacy/build/pdf.mjs";
import {exportLayoutProofPdf} from "../src/layoutProofPdf.ts";

const part=(kind,label,changes={})=>({
 kind,page:1,imageData:"",
 origin:"static",label,fieldKey:"",value:"",defaultValue:"",
 x:12,y:16,width:70,height:7,z:1,rotation:0,font:"Arial",size:12,
 bold:false,italic:false,underline:false,align:"left",color:"#000000",
 background:"transparent",borderColor:"#111111",borderWidth:1,
 letterSpacing:0,opacity:1,quick:true,dotMatrix:true,preprinted:false,...changes
});

test("unapproved dot-matrix proof contains values only even if graphic flags are wrong",async()=>{
 const document={widthMm:190,heightMm:175,pageCount:1,elements:[
   part("text","TEST ACCOUNT",{z:1}),
   part("rectangle","decorative box",{z:2,x:5,y:10,width:100,height:100}),
   part("photo","PHOTO",{z:3,x:100,y:20,width:40,height:40}),
   part("ellipse","ellipse",{z:4,x:100,y:50,width:20,height:20}),
   part("line","divider",{z:5,x:5,y:90,width:130,height:1}),
 ]};
 const output=await exportLayoutProofPdf(document,"dotmatrix");
 const loadingTask=getDocument({data:new Uint8Array(await output.arrayBuffer()),useSystemFonts:true});
 const pdf=await loadingTask.promise;
 try{
   const page=await pdf.getPage(1);
   const text=(await page.getTextContent()).items.filter(i=>"str" in i).map(i=>i.str).join(" ");
   assert.match(text,/TEST ACCOUNT/);
   assert.doesNotMatch(text,/PHOTO/);
   const commands=(await page.getOperatorList()).fnArray;
   assert.equal(commands.includes(OPS.constructPath),false,"PR2 proof must contain no graphic paths");
 }finally{await loadingTask.destroy();}
});
