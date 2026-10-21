const {test}=require('node:test'),assert=require('node:assert/strict'),c=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {seal,open}=require('./mailbox-crypto.cjs'),{mailbox,route}=require('./mailbox.cjs'),{controller}=require('./controller.cjs'),{session}=require('./mailbox-session.cjs'),{readiness}=require('./pairing-gate.cjs');
const keys=t=>{const k=c.generateKeyPairSync(t);return {public:k.publicKey.export({type:'spki',format:'pem'}),private:k.privateKey.export({type:'pkcs8',format:'pem'})};};
const approval=keys('ed25519'),deviceSigner=keys('ed25519'),deviceEncryption=keys('x25519'),resultEncryption=keys('x25519');
const pair=c.randomUUID(),id=c.randomUUID(),ctx={pair,id,kind:'job'},sealOpts={...ctx,recipientPublicKey:deviceEncryption.public,senderPrivateKey:approval.private},openOpts={...ctx,recipientPrivateKey:deviceEncryption.private,senderPublicKey:approval.public};
const payload={message:'SYNTHETIC ONLY raw hex remains private',issuedAt:Date.now()};
test('authenticated encrypted roundtrip; plaintext absent from public packet',()=>{const p=seal(payload,sealOpts);assert.deepEqual(open(p,openOpts),payload);assert.ok(!JSON.stringify(p).includes(payload.message));});
for(const field of ['signature','ciphertext','tag','iv','ephemeral'])test('reject tampered '+field,()=>{const p=seal(payload,sealOpts);const b=Buffer.from(p[field],'base64');b[0]^=1;p[field]=b.toString('base64');assert.throws(()=>open(p,openOpts));});
for(const change of [{pair:c.randomUUID()},{id:c.randomUUID()},{kind:'result'},{senderPublicKey:deviceSigner.public},{recipientPrivateKey:resultEncryption.private}])test('reject wrong binding/key '+Object.keys(change),()=>assert.throws(()=>open(seal(payload,sealOpts),{...openOpts,...change})));
test('randomized encryption; unknown fields rejected',()=>{const a=seal(payload,sealOpts),b=seal(payload,sealOpts);assert.notEqual(a.ciphertext,b.ciphertext);assert.throws(()=>open({...a,logs:'raw'},openOpts));});
function api(){const files=new Map(),calls=[];let unavailable=false;return {calls,files,setUnavailable:v=>unavailable=v,fetch:async(url,opts)=>{
 calls.push({url,opts});if(unavailable)throw Error('private secret could be in network error');assert.equal(opts.redirect,'error');assert.ok(url.startsWith('https://api.github.com/repos/banksetu/app/contents/tools/pr2-local/mailbox/'));
 const p=url.split('/contents/')[1].split('?')[0];if(opts.method==='PUT'){const b=JSON.parse(opts.body);assert.equal(b.branch,'codex/pr2-local-test-20261021');if(files.has(p))return new Response('{}',{status:422});files.set(p,b.content);return Response.json({commit:{sha:'synthetic'}});}
 if(!files.has(p))return new Response('{}',{status:404});return Response.json({type:'file',encoding:'base64',content:files.get(p)});
 }};}
test('authenticated fixed repo/branch create/read API; no raw data',async()=>{const f=api(),m=mailbox({getToken:async()=>'local-test-credential',fetchImpl:f.fetch}),p=seal(payload,sealOpts);await m.publish(ctx,p);assert.deepEqual(open(await m.read(ctx),openOpts),payload);assert.ok(!f.calls[0].opts.body.includes(payload.message));await assert.rejects(m.publish(ctx,p),/422/);assert.equal(f.calls[0].opts.headers.Authorization,'Bearer local-test-credential');});
test('reject unsealed raw output and path injection before API',async()=>{const f=api(),m=mailbox({getToken:async()=>'test',fetchImpl:f.fetch});await assert.rejects(m.publish(ctx,{logs:'raw'}));assert.throws(()=>route({...ctx,id:'../main'}));assert.equal(f.calls.length,0);});
test('no token leakage on failure/redirect; no follow',async()=>{const f=api();f.setUnavailable(true);const m=mailbox({getToken:async()=>'SECRET-TOKEN',fetchImpl:f.fetch});await assert.rejects(m.read(ctx),e=>!e.message.includes('SECRET')&&e.message.includes('unavailable'));});
test('missing key custody leaves pairing blocked without touching USB',()=>{const r=readiness({transportProbe:true});assert.equal(r.ready,false);assert.equal(r.mayOpenPrinter,false);assert.ok(r.missing.some(x=>x.includes('Work Mode')));});
test('sealed job through durable engine; encrypted result upload retry never reexecutes',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pr2-mailbox-'));try{
 const job={version:1,id,deviceId:'a'.repeat(64),bundleHash:'b'.repeat(64),action:'diagnose',issuedAt:Date.now(),expiresAt:Date.now()+60000};const b=Buffer.from(JSON.stringify(job));const signed={payload:b.toString('base64'),signature:c.sign(null,b,approval.private).toString('base64')};
 const f=api(),transport=mailbox({getToken:async()=>'TEST',fetchImpl:f.fetch});let executions=0;
 const engine=controller({directory,key:approval.public,deviceId:job.deviceId,bundleHash:job.bundleHash,log:()=>{},execute:async()=>{executions++;return {synthetic:'MOCK-USB-NO-HARDWARE',events:[{hex:'1b 2f 37'}]};}});
 const config={pair,approvalPublicKey:approval.public,controllerDecryptKey:deviceEncryption.private,controllerSigningKey:deviceSigner.private,resultPublicKey:resultEncryption.public,engine,transport,directory};const s=session(config);
 const p=seal(signed,sealOpts);await s.accept(p);await assert.rejects(s.accept(p),/Duplicate/);
 f.setUnavailable(true);await assert.rejects(s.flush(),/unavailable/);assert.equal(executions,1);
 f.setUnavailable(false);await session(config).flush();assert.equal(executions,1);
 const r=await transport.read({...ctx,kind:'result'});assert.ok(!JSON.stringify(r).includes('MOCK-USB'));const value=open(r,{pair,id,kind:'result',recipientPrivateKey:resultEncryption.private,senderPublicKey:deviceSigner.public});assert.equal(value.physicalVerified,false);assert.equal(value.result.synthetic,'MOCK-USB-NO-HARDWARE');
 }finally{fs.rmSync(directory,{recursive:true});}
});
