import test from "node:test";
import assert from "node:assert/strict";
import {deflateRawSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {extractWordParagraphs,importWordDocx} from "../src/layoutWordDocumentImport.ts";
function docx(xml,{method=8}={}){
  const name=Buffer.from("word/document.xml"),body=Buffer.from(xml);
  const bytes=method===8?deflateRawSync(body):body;
  const local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);
  local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(name.length,26);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(method,10);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(body.length,24);
  central.writeUInt16LE(name.length,28);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  const cdOffset=local.length+name.length+bytes.length;
  end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(cdOffset,16);
  const raw=Buffer.concat([local,name,bytes,central,name,end]);
  return {name:"example.docx",size:raw.length,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)};
}
test("offline Word importer preserves Hindi/English punctuation and alignment",async()=>{
  const xml='<w:document xmlns:w="x"><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>नाम: राम; A&amp;B.</w:t></w:r></w:p><w:p><w:r><w:t>IFSC:</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>ABCD0123</w:t></w:r></w:p></w:body></w:document>';
  const imported=await importWordDocx(docx(xml));
  assert.equal(imported.paragraphs[0].text,"नाम: राम; A&B.");
  assert.equal(imported.paragraphs[0].align,"center");
  assert.equal(imported.paragraphs[1].text,"IFSC:\tABCD0123");
  assert.deepEqual(imported.warnings,[]);
});
test("manual review warnings for unsupported Word structures",()=>{
  const doc=extractWordParagraphs('<w:p><w:t>Text</w:t></w:p><w:tbl/><w:drawing/>');
  assert.equal(doc.paragraphs[0].text,"Text");
  assert.ok(doc.warnings.some(x=>x.includes("tables")));
  assert.ok(doc.warnings.some(x=>x.includes("drawings")));
});
test("DOC and corrupted files fail closed",async()=>{
  await assert.rejects(importWordDocx({...docx(""),name:"old.doc"}),/DOCX/);
  await assert.rejects(importWordDocx({name:"invalid.docx",size:4,arrayBuffer:async()=>new ArrayBuffer(4)}),/DOCX file exceeds|DOCX archive/);
});
test("wizard, dynamic mapping, local save, approval and release safety remain separated",()=>{
  const wiz=readFileSync(new URL("../src/LayoutSetupWizard.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
  for(const label of ["Please Select Your Bank","Upload PDF Sample","Upload Word DOC/DOCX","Create New Layout","Quick Passbook","Passbook Print (PR2)","Continue Editing"])assert.ok(wiz.includes(label),label);
  for(const label of ["importWordDocx","Draw Customer Data Box","Draw Bank Data Box","Preview with Customer Data","Restore Layout Backup","publishLocalLayoutSlot","submitForReview","selectApprovedTemplate"])assert.ok(ui.includes(label),label);
  assert.match(ui,/windowsLayoutEngineAvailable/);
});

test("DOCX preserves editable table cell positions and basic Word paragraph styles",()=>{
 const xml='<w:document><w:body><w:p><w:r><w:t>Heading.</w:t></w:r></w:p>'+
   '<w:tbl><w:tr><w:tc><w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="223344"/></w:rPr><w:t>नाम:</w:t></w:r></w:p></w:tc>'+
   '<w:tc><w:p><w:r><w:t>राम; x:y</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'+
   '<w:p><w:r><w:t>Footer</w:t></w:r></w:p></w:body></w:document>';
 const result=extractWordParagraphs(xml);
 assert.deepEqual(result.paragraphs.map(p=>p.text),["Heading.","नाम:","राम; x:y","Footer"]);
 assert.deepEqual(result.paragraphs[1].table,{id:1,row:0,col:0,columns:2,rows:1});
 assert.deepEqual(result.paragraphs[2].table,{id:1,row:0,col:1,columns:2,rows:1});
 assert.equal(result.paragraphs[1].bold,true);
 assert.equal(result.paragraphs[1].size,12);
 assert.equal(result.paragraphs[1].color,"#223344");
});
