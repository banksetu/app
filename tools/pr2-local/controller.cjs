'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
function signedPayload(envelope,key){
 if(!envelope||Object.keys(envelope).sort().join(',')!=='payload,signature'||typeof envelope.payload!=='string'||envelope.payload.length>32768||typeof envelope.signature!=='string')throw Error('Invalid signed envelope');
 const data=Buffer.from(envelope.payload,'base64'),pub=crypto.createPublicKey(key);
 if(pub.asymmetricKeyType!=='ed25519'||!crypto.verify(null,data,pub,Buffer.from(envelope.signature,'base64')))throw Error('Signature rejected');
 return JSON.parse(data.toString('utf8'));
}
function verifyJob(envelope,{key,deviceId,bundleHash,now=Date.now()}){
 const j=signedPayload(envelope,key);
 if(Object.keys(j).sort().join(',')!=='action,bundleHash,deviceId,expiresAt,id,issuedAt,version'||j.version!==1||!/^[-a-f0-9]{36}$/.test(j.id)||!/^[a-f0-9]{64}$/.test(j.deviceId)||j.deviceId!==deviceId||j.bundleHash!==bundleHash)throw Error('Job target/schema rejected');
 if(!Number.isSafeInteger(j.issuedAt)||!Number.isSafeInteger(j.expiresAt)||j.issuedAt>now+5000||j.expiresAt<=now||j.expiresAt-j.issuedAt>300000||j.expiresAt<=j.issuedAt)throw Error('Job expired or time window invalid');
 // This diagnostic pilot intentionally has no motion or arbitrary parameters.
 if(j.action!=='diagnose')throw Error('Action blocked: physical tests require separate approval and validated protocol');
 return j;
}
function verifyComponents(envelope,key,directory){
 const m=signedPayload(envelope,key);
 if(m.version!==1||!Array.isArray(m.files)||m.files.length<1||m.files.length>30)throw Error('Invalid component manifest');
 const names=new Set();for(const entry of m.files){
  if(!entry||typeof entry.name!=='string'||path.basename(entry.name)!==entry.name||entry.name.includes('\\')||entry.name.includes(':')||names.has(entry.name)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Unsafe component manifest');
  names.add(entry.name);
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,entry.name))).digest('hex')!==entry.sha256)throw Error('Component hash mismatch');
 }
 // Verifies staged data only. Never downloads, installs, imports or executes an update.
 return m;
}
function controller({directory,key,deviceId,bundleHash,execute,log,now=Date.now}){
 const ledger=path.join(directory,'consumed.json');
 let consumed=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):{};
 if(!consumed||Array.isArray(consumed)||typeof consumed!=='object')throw Error('Invalid durable ledger');
 let busy=false;
 return {async accept(envelope){
  if(busy)throw Error('Controller busy');
  if(fs.existsSync(path.join(directory,'STOP')))throw Error('Emergency stop active');
  const j=verifyJob(envelope,{key,deviceId,bundleHash,now:now()});
  if(Object.hasOwn(consumed,j.id))throw Error('Duplicate or crash-uncertain job; never replay');
  if(Object.keys(consumed).length>=10000)throw Error('Ledger full; operator review required');
  busy=true;
  try{
   consumed[j.id]={state:'started',time:now()};
   const temp=ledger+'.tmp';fs.writeFileSync(temp,JSON.stringify(consumed));fs.renameSync(temp,ledger);
   log({jobId:j.id,event:'accepted',action:j.action,time:now()});
   const result=await execute(j);
   log({jobId:j.id,event:'finished',physicalVerified:false,result,time:now()});return result;
  }catch(e){log({jobId:j.id,event:'failed-no-retry',error:e.message,time:now()});throw e;}
  finally{busy=false;}
 }};
}
module.exports={controller,verifyJob,verifyComponents};
