import test from "node:test";
import assert from "node:assert/strict";
import {importLegacyWordDoc} from "../src/layoutLegacyWordImport.ts";
function makeDoc(text){
  const sectorSize=512,totalSectors=18,END=0xfffffffe,FREE=0xffffffff;
  const file=Buffer.alloc(sectorSize*(totalSectors+1)),header=file.subarray(0,512);
  Buffer.from("d0cf11e0a1b11ae1","hex").copy(header,0);
  header.writeUInt16LE(0xfffe,28);header.writeUInt16LE(9,30);header.writeUInt16LE(6,32);
  header.writeUInt32LE(1,44);header.writeUInt32LE(1,48);
  header.writeUInt32LE(4096,56);header.writeUInt32LE(FREE,60);
  header.writeUInt32LE(FREE,68);header.writeUInt32LE(0,72);
  for(let i=0;i<109;i++)header.writeUInt32LE(i===0?0:FREE,76+4*i);
  const sector=n=>file.subarray(512+n*512,512+(n+1)*512);
  const fat=sector(0);
  for(let i=0;i<128;i++)fat.writeUInt32LE(FREE,4*i);
  fat.writeUInt32LE(0xfffffffd,0);fat.writeUInt32LE(END,4);
  for(let i=2;i<=9;i++)fat.writeUInt32LE(i===9?END:i+1,4*i);
  for(let i=10;i<=17;i++)fat.writeUInt32LE(i===17?END:i+1,4*i);
  const dir=sector(1);
  function entry(index,name,type,start,size){
    const off=index*128;
    const encoded=Buffer.from(name+"\0","utf16le");encoded.copy(dir,off);
    dir.writeUInt16LE(encoded.length,off+64);dir[off+66]=type;
    dir.writeUInt32LE(start,off+116);dir.writeUInt32LE(size,off+120);
  }
  entry(0,"Root Entry",5,END,0);entry(1,"WordDocument",2,2,4096);entry(2,"0Table",2,10,4096);
  const word=Buffer.concat(Array.from({length:8},(_,i)=>sector(i+2)));
  word.writeUInt16LE(0xa5ec,0);word.writeUInt16LE(0,10);
  word.writeUInt16LE(0,32);word.writeUInt16LE(0,34);word.writeUInt16LE(34,36);
  word.writeUInt32LE(64,302);word.writeUInt32LE(21,306);
  Buffer.from(text,"utf16le").copy(word,1024);
  for(let i=0;i<8;i++)word.subarray(i*512,(i+1)*512).copy(sector(i+2));
  const table=sector(10);table[64]=2;table.writeUInt32LE(16,65);
  table.writeUInt32LE(0,69);table.writeUInt32LE(text.length,73);
  table.writeUInt32LE(1024,79);
  return {name:"passbook.doc",size:file.length,arrayBuffer:async()=>file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength)};
}
test("legacy DOC OLE WordDocument piece table restores Unicode and punctuation locally",async()=>{
  const doc=await importLegacyWordDoc(makeDoc("Branch: नमस्ते; 123.\rAccount No: ABC#45"));
  assert.equal(doc.paragraphs[0].text,"Branch: नमस्ते; 123.");
  assert.equal(doc.paragraphs[1].text,"Account No: ABC#45");
  assert.ok(doc.warnings.some(s=>s.includes("Legacy DOC")));
});
test("legacy DOC never executes or imports arbitrary binary files",async()=>{
  await assert.rejects(importLegacyWordDoc({name:"evil.doc",size:600,arrayBuffer:async()=>new Uint8Array(600).buffer}),/not a Word/);
  await assert.rejects(importLegacyWordDoc({...makeDoc("test"),name:"something.exe"}),/Choose an old binary/);
});
