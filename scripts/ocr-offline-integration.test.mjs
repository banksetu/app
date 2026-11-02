import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createWorker} from "tesseract.js";

const root=process.cwd();
const assets=path.join(root,"dist","ocr");
function blankBmp(width=128,height=64){
 const stride=Math.ceil(width*3/4)*4;
 const buffer=Buffer.alloc(54+stride*height,255);
 buffer.write("BM",0,"ascii");
 buffer.writeUInt32LE(buffer.length,2);
 buffer.writeUInt32LE(54,10);
 buffer.writeUInt32LE(40,14);
 buffer.writeInt32LE(width,18);
 buffer.writeInt32LE(height,22);
 buffer.writeUInt16LE(1,26);
 buffer.writeUInt16LE(24,28);
 buffer.writeUInt32LE(stride*height,34);
 return buffer;
}
test("fully offline English/Hindi OCR worker initializes and recognizes a local image", {timeout:120000}, async()=>{
 for(const lang of ["eng","hin"])
  assert.ok(fs.existsSync(path.join(assets,"lang",lang+".traineddata.gz")),lang+" model absent");
 assert.ok(fs.existsSync(path.join(assets,"worker.min.js")),"offline worker absent");
 assert.ok(fs.readdirSync(path.join(assets,"core")).some(name=>name.endsWith(".wasm")),"offline WASM core absent");
 const worker=await createWorker(["eng","hin"],1,{
   langPath:path.join(assets,"lang"),
   corePath:path.join(assets,"core"),
   cacheMethod:"none",
 });
 try{
  const result=await worker.recognize(blankBmp());
  assert.equal(typeof result.data.text,"string");
 } finally {await worker.terminate();}
});
