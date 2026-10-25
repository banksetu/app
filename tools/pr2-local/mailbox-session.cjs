'use strict';
const fs=require('node:fs'),path=require('node:path');
const {open,seal,uuid}=require('./mailbox-crypto.cjs');
// Explicitly injected keys: no default/test key, plaintext key file, remote key rotation,
// automatic code loading, or fallback to unsigned/public diagnostics.
function session({pair,approvalPublicKey,controllerDecryptKey,controllerSigningKey,resultPublicKey,engine,transport,directory}){
 if(!uuid.test(pair))throw Error('Unpaired mailbox');
 const pending=path.join(directory,'sealed-outbox');fs.mkdirSync(pending,{recursive:true});
 return {
  async accept(packet){
   const id=packet?.id;if(!uuid.test(id))throw Error('Invalid job ID');
   const job=open(packet,{pair,id,kind:'job',recipientPrivateKey:controllerDecryptKey,senderPublicKey:approvalPublicKey});
   // Bind signed job identity to the encrypted routing identity, without executing it.
   const inner=JSON.parse(Buffer.from(job.payload,'base64').toString('utf8'));
   if(inner.id!==id)throw Error('Inner/outer job identity mismatch');
   // engine consumes durable intent before USB and handles expiry/device/bundle checks.
   // Duplicate/expired/forged jobs fail without replacing an earlier result.
   let result,began=false;try{result=await engine.accept(job,{onStarted:()=>{began=true;}});}catch(e){if(!began)throw e;result={error:e.message,physicalVerified:false,requiresReview:true};}
   const sealed=seal({jobId:id,physicalVerified:false,result},{pair,id,kind:'result',recipientPublicKey:resultPublicKey,senderPrivateKey:controllerSigningKey});
   const file=path.join(pending,id+'.json');const fd=fs.openSync(file,'wx');
   try{fs.writeFileSync(fd,JSON.stringify(sealed));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   return sealed;
  },
  async flush(){
   for(const name of fs.readdirSync(pending).filter(n=>n.endsWith('.json')&&uuid.test(n.slice(0,-5)))){
    const id=name.slice(0,-5),file=path.join(pending,name),packet=JSON.parse(fs.readFileSync(file,'utf8'));
    // On conflict, require byte-equivalent packet already there; never overwrite.
    const existing=await transport.read({pair,id,kind:'result'});
    if(existing){if(JSON.stringify(existing)!==JSON.stringify(packet))throw Error('Conflicting encrypted result');}
    else await transport.publish({pair,id,kind:'result'},packet);
    fs.renameSync(file,file+'.sent');
   }
  },
 };
}
module.exports={session};
