import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBackendReleaseGate} from './verify-backend-release-gate.mjs';

const sourceCommit='a'.repeat(40);
const sample=(runs,status=200)=>async()=>new Response(JSON.stringify({workflow_runs:runs}),{status});
const args={repository:'synthetic/app',token:'synthetic-token',sourceCommit};
test('native release accepts only a successful deployment for the current backend source',async()=>{
 assert.equal(await verifyBackendReleaseGate({...args,fetchImpl:sample([{head_sha:sourceCommit,conclusion:'success'}])}),sourceCommit);
 await assert.rejects(verifyBackendReleaseGate({...args,fetchImpl:sample([{head_sha:'b'.repeat(40),conclusion:'success'}])}),/no successful production deployment/);
 await assert.rejects(verifyBackendReleaseGate({...args,fetchImpl:sample([{head_sha:sourceCommit,conclusion:'failure'}])}),/no successful production deployment/);
 await assert.rejects(verifyBackendReleaseGate({...args,fetchImpl:sample([],403)}),/Cannot verify/);
});
