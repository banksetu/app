import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/customerPhoto.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {optimizeCustomerPhoto, CUSTOMER_PHOTO_MAX_BYTES} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('photo optimizer preserves aspect ratio and enforces the 15 KB final blob', async () => {
  const dimensions=[];
  globalThis.HTMLImageElement=class {};
  globalThis.createImageBitmap=async () => ({width:1600,height:1200,close(){}});
  globalThis.document={createElement: () => ({width:0,height:0,getContext(){return {fillRect(){},drawImage(){},set fillStyle(_value){}};},toBlob(callback,_mime,quality){
    dimensions.push([this.width,this.height]);
    callback(new Blob([new Uint8Array(Math.round(this.width*this.height*quality/5))],{type:'image/jpeg'}));
  }})};
  globalThis.FileReader=class {readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;this.onload();});}};
  const photo=await optimizeCustomerPhoto(new Blob(['original'],{type:'image/png'}));
  assert.ok(photo.bytes<=CUSTOMER_PHOTO_MAX_BYTES);
  assert.equal(Buffer.from(photo.dataUrl.split(',')[1],'base64').length,photo.bytes);
  assert.ok(dimensions.every(([width,height])=>Math.abs(width/height-4/3)<0.01));
});

test('photo optimizer refuses a file that cannot fit under 15 KB', async () => {
  globalThis.document={createElement: () => ({width:0,height:0,getContext(){return {fillRect(){},drawImage(){},set fillStyle(_value){}};},toBlob(callback){callback(new Blob([new Uint8Array(16000)],{type:'image/jpeg'}));}})};
  await assert.rejects(optimizeCustomerPhoto(new Blob(['original'],{type:'image/png'})),/cannot fit under 15 KB/);
});
