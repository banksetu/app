import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {prepareOfflineOcr} from "./prepare-offline-ocr.mjs";

test("offline OCR packager copies local core, worker and bilingual models without remote downloads",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"banksetu-ocr-test-"));
 try {
  const make=(p,bytes="LOCAL TEST FIXTURE")=>{
   const full=path.join(root,p);
   fs.mkdirSync(path.dirname(full),{recursive:true});
   fs.writeFileSync(full,bytes);
  };
  make("node_modules/tesseract.js/dist/worker.min.js");
  make("node_modules/tesseract.js-core/tesseract-core-simd.wasm.js");
  make("node_modules/tesseract.js-core/tesseract-core-simd.wasm");
  make("node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz");
  make("node_modules/@tesseract.js-data/hin/4.0.0/hin.traineddata.gz");
  const result=prepareOfflineOcr("dist",root);
  assert.deepEqual(result,{version:1,eng:true,hin:true,coreFiles:2,localOnly:true});
  for(const p of [
   "dist/ocr/worker.min.js","dist/ocr/core/tesseract-core-simd.wasm.js",
   "dist/ocr/core/tesseract-core-simd.wasm",
   "dist/ocr/lang/eng.traineddata.gz","dist/ocr/lang/hin.traineddata.gz",
   "dist/ocr/manifest.json"
  ]) assert.ok(fs.existsSync(path.join(root,p)),p);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test("offline OCR packager fails closed when language assets are incomplete",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"banksetu-ocr-missing-"));
 try {assert.throws(()=>prepareOfflineOcr("dist",root),/Pinned Tesseract package missing/);}
 finally {fs.rmSync(root,{recursive:true,force:true});}
});
