'use strict';
const {C,status,paper}=require('./pr2-protocol.cjs');
const {hex}=require('./core.cjs');
const identity=Buffer.from([27,47,55]);
function classify(bytes){
 if(bytes.equals(identity))return 'pr2-identity';
 if(bytes.length===3&&bytes[0]===27&&bytes[1]===114)return 'status-frame';
 if(bytes.length===6&&bytes[0]===27&&bytes[1]===66&&bytes[2]===53)return 'paper-frame';
 return bytes.length?'unexpected-or-mixed':'no-response';
}
async function diagnose({io,log}){
 let transaction=0;
 const capture=async(label)=>{
  const id=++transaction,start=Date.now(),r=await io.rpc('capture',{},5000),bytes=Buffer.from(r.data,'base64');
  log({transaction:id,label,direction:'RX',hex:hex(bytes),classification:classify(bytes),elapsedMs:Date.now()-start,...r,data:undefined});
  return {bytes,limited:r.limitReached===true};
 };
 const tx=async(label,bytes)=>{log({transaction:transaction+1,label,direction:'TX',hex:hex(bytes)});const r=await io.write(bytes);log({label,direction:'WRITE-ACK',written:r.written});};
 const before=await capture('pre-existing-input');
 await tx('control-procedure',C.start);const control=await capture('after-control-procedure');
 await tx('identity',C.identity);const id=await capture('identity');
 await tx('status',C.status);const st=await capture('status');
 // Diagnose can collect paper information even when status is unexpected; no motion path exists here.
 await tx('paper',C.paper);const p=await capture('paper');
 const clean=!before.bytes.length&&!control.bytes.length&&![before,control,id,st,p].some(x=>x.limited);
 const shifted=before.bytes.length>0||st.bytes.equals(identity)||(!id.bytes.length&&p.bytes.length>0);
 let statusValid=false,statusReady=false,paperValid=false,paperState=null;
 try{const parsed=status(st.bytes,{allowNoPaper:true});statusValid=true;statusReady=parsed.ready===true;}catch(e){log({stage:'status',error:e.message,received:hex(st.bytes),expected:'1b 72 xx',identityInsteadOfStatus:st.bytes.equals(identity)});}
 try{paperState=paper(p.bytes);paperValid=true;log({paper:paperState});}catch(e){log({stage:'paper',error:e.message});}
 const matched=id.bytes.equals(identity)&&statusValid&&paperValid&&clean;
 const result={diagnosticFramesMatched:matched,statusReady,paperState,physicalVerified:false,motionAuthorized:false,
  finding:shifted?'response association unresolved; a late or stale frame was observed; no readiness inferred':matched?'strict-frames-match; physical verification still required':'incomplete, unexpected, stale or mixed response; no readiness inferred'};
 log({result});return result;
}
module.exports={diagnose,classify};
