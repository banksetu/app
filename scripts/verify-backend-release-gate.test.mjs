import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBackendReleaseGate,backendSourceCommit,backendTree} from './verify-backend-release-gate.mjs';

const sourceCommit='a'.repeat(40);
const sample=(runs,status=200)=>async()=>new Response(JSON.stringify({workflow_runs:runs}),{status});
const args={repository:'synthetic/app',token:'synthetic-token',sourceCommit};
test('native release accepts only a successful deployment for the current backend source',async()=>{
 assert.equal(await verifyBackendReleaseGate({...args,fetchImpl:sample([{head_sha:sourceCommit,conclusion:'success'}])}),sourceCommit);
 assert.equal(await verifyBackendReleaseGate({...args,fetchImpl:sample([{head_sha:'b'.repeat(40),conclusion:'success'}]),equivalentCommit:sha=>sha==='b'.repeat(40)}),sourceCommit);
 await assert.rejects(verifyBackendReleaseGate({...args,fetchImpl:sample([{head_sha:'b'.repeat(40),conclusion:'success'}])}),/no successful production deployment/);
 await assert.rejects(verifyBackendReleaseGate({...args,fetchImpl:sample([{head_sha:sourceCommit,conclusion:'failure'}])}),/no successful production deployment/);
 await assert.rejects(verifyBackendReleaseGate({...args,fetchImpl:sample([],403)}),/Cannot verify/);
});
test('backend tree comparison covers every deployment-gated path',()=>{
 const tree=backendTree('HEAD',(binary,args)=>{
  assert.equal(binary,'git');
  assert.deepEqual(args.slice(0,4),['ls-tree','-r','HEAD','--']);
  assert(args.includes('apps-script/Code.gs'));
  assert(args.includes('firestore.rules'));
  return 'guarded tree\n';
 });
 assert.equal(tree,'guarded tree');
});
test('desktop-only release checks the last backend source commit',()=>{
 const sha='b'.repeat(40);
 assert.equal(backendSourceCommit((binary,args)=>{
   assert.equal(binary,'git');
   assert.deepEqual(args.slice(0,5),['log','--first-parent','-1','--format=%H','--']);
   assert(args.includes('src/core/localData.ts'));
   assert(args.includes('cloudflare'));
   assert(!args.includes('desktop/main.cjs'));
   return `${sha}\n`;
 }),sha);
});
