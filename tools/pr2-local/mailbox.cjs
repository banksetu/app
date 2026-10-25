'use strict';
const {uuid}=require('./mailbox-crypto.cjs');
const REPO='banksetu/app',BRANCH='codex/pr2-local-test-20261021',PREFIX='tools/pr2-local/mailbox';
function route({pair,id,kind}){if(!uuid.test(pair)||!uuid.test(id)||!['job','result','pairing-probe'].includes(kind))throw Error('Invalid mailbox route');return `${PREFIX}/${pair}/${kind}/${id}.json`;}
function assertSealed(packet,context){
 if(!packet||Object.keys(packet).sort().join(',')!=='ciphertext,ephemeral,id,iv,kind,pair,recipient,signature,tag,v'||packet.v!==1||packet.pair!==context.pair||packet.id!==context.id||packet.kind!==context.kind)throw Error('Only bound encrypted packets may enter mailbox');
 for(const field of ['ciphertext','ephemeral','iv','signature','tag'])if(typeof packet[field]!=='string'||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(packet[field]))throw Error('Invalid sealed packet');
 if(!/^[a-f0-9]{64}$/.test(packet.recipient)||Buffer.from(packet.iv,'base64').length!==12||Buffer.from(packet.tag,'base64').length!==16||Buffer.from(packet.signature,'base64').length!==64)throw Error('Invalid sealed packet lengths');
 if(JSON.stringify(packet).length>190000)throw Error('Mailbox packet too large');
}
// This adapter accepts a locally supplied token provider. It never obtains credentials
// from GitHub, logs a token, follows redirects, or uses public raw-content endpoints.
function mailbox({getToken,fetchImpl=fetch,signal}){
 async function request(method,pathname,body){
  let token;try{token=await getToken();}catch{throw Error('Protected local credential unavailable');}if(typeof token!=='string'||!token.length||/[\r\n]/.test(token))throw Error('Local API credential unavailable');
  const timeout=AbortSignal.timeout(15000);const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  let response;try{response=await fetchImpl(`https://api.github.com/repos/${REPO}/contents/${pathname}`,{method,redirect:'error',signal:combined,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'BankSetu-PR2-Mailbox','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}catch{throw Error('Mailbox network unavailable; no printer retry');}
  // Never include remote error bodies, request headers or credentials in exceptions.
  if(response.status===404&&method==='GET')return null;
  if(!response.ok)throw Error(`Mailbox API rejected request (${response.status})`);
  const reader=response.body?.getReader();if(!reader)throw Error('Missing API body');let count=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>300000){await reader.cancel();throw Error('API response too large');}chunks.push(Buffer.from(value));}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid API JSON');}
 }
 return {
  async listJobs(pair){
   if(!uuid.test(pair))throw Error('Invalid pairing');
   const rows=await request('GET',`${PREFIX}/${pair}/job?ref=${encodeURIComponent(BRANCH)}`);
   if(rows===null)return [];if(!Array.isArray(rows)||rows.length>1000)throw Error('Invalid mailbox listing');
   return rows.filter(x=>x.type==='file'&&typeof x.name==='string'&&x.name.endsWith('.json')&&uuid.test(x.name.slice(0,-5))).map(x=>x.name.slice(0,-5)).slice(0,32);
  },
  async publish(context,packet){assertSealed(packet,context);const content=Buffer.from(JSON.stringify(packet)).toString('base64');
   // Create-only. A conflict never overwrites a result or initiates USB replay.
   return request('PUT',route(context),{branch:BRANCH,message:'PR2 encrypted mailbox envelope',content});},
  async read(context){const r=await request('GET',route(context)+`?ref=${encodeURIComponent(BRANCH)}`);if(!r)return null;
   if(r.type!=='file'||r.encoding!=='base64'||typeof r.content!=='string'||r.content.length>260000)throw Error('Invalid API file');const p=JSON.parse(Buffer.from(r.content,'base64').toString('utf8'));assertSealed(p,context);return p;},
 };
}
module.exports={mailbox,route,assertSealed,REPO,BRANCH};
