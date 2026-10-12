import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/core/photoState.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {mergeRemotePhoto,mergeUploadedPhoto}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('unchanged remote photo reuses the cached preview without a new download',()=>{
  const old={enrolId:'C1',photoUrl:'drive://one',photoPreview:'image-one'};
  assert.equal(mergeRemotePhoto({enrolId:'C1',photoUrl:'drive://one'},old).photoPreview,'image-one');
});

test('a photo replacement from another device never displays the old photo',()=>{
  const old={enrolId:'C1',photoUrl:'drive://one',photoPreview:'image-one',photoDataUrl:'pending-one'};
  const next=mergeRemotePhoto({enrolId:'C1',photoUrl:'drive://two'},old);
  assert.equal(next.photoPreview,'');
  assert.equal(next.photoDataUrl,undefined);
});

test('an uploaded replacement retains its new preview but consumes pending bytes',()=>{
  const next=mergeUploadedPhoto({photoUrl:'drive://two'}, {photoUrl:'drive://one',photoPreview:'image-one'}, {photoDataUrl:'image-two'});
  assert.equal(next.photoPreview,'image-two');
  assert.equal(next.photoDataUrl,undefined);
});
