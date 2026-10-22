import test from 'node:test';import assert from 'node:assert/strict';
import {quotaResult,dayStart,masterUsage} from './masterStatus.js';
test('usage limits clamp remaining and preserve missing values',()=>{assert.equal(quotaResult(120,100).remaining,0);assert.equal(quotaResult(NaN,100).remaining,null);assert.equal(dayStart(Date.parse('2026-03-08T18:00:00Z'),'America/Los_Angeles'),'2026-03-08T08:00:00.000Z');assert.equal(dayStart(Date.parse('2026-11-01T18:00:00Z'),'America/Los_Angeles'),'2026-11-01T07:00:00.000Z');assert.equal(dayStart(Date.parse('2026-10-04T08:00:00Z'),'UTC'),'2026-10-04T00:00:00.000Z');assert.equal(dayStart(Date.parse('2026-10-04T08:00:00Z'),'America/Los_Angeles'),'2026-10-04T07:00:00.000Z');});
test('unavailable provider metrics are not reported as zero; presence counts only active clients',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'Forbidden'}}),{status:403});
 try{const result=await masterUsage({FIREBASE_PROJECT_ID:'test'},async()=> 'token',async()=>[{document:{fields:{role:'client_admin',active:true}}},{document:{fields:{role:'client_user',active:true}}},{document:{fields:{role:'client_user',active:false}}},{document:{fields:{role:'master_owner',active:true}}}],value=>value);
 assert.match(result.hosting.unavailable,/permission/);assert.equal(result.hosting.used,undefined);assert.match(result.cloudflare.unavailable,/not configured/);assert.equal(result.presence.admins,1);assert.equal(result.presence.users,1);
 }finally{globalThis.fetch=original;}
});
