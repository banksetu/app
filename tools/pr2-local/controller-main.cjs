'use strict';
// No networking adapter, HTTP listener, shell execution, service or GitHub credential.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {controller}=require('./controller.cjs'),{nativeClient}=require('./pr2-native.cjs'),{diagnose}=require('./diagnostics.cjs');
async function main(){
 if(process.platform!=='win32')throw Error('Windows required');
 const directory=path.join(process.env.LOCALAPPDATA,'BankSetu-PR2-Controller');fs.mkdirSync(directory,{recursive:true});
 const configFile=path.join(directory,'pairing.json');
 if(!fs.existsSync(configFile)){
  console.log('BLOCKED: no paired approval key/device and no supported private remote transport. No printer opened.');
  console.log('Folder: '+directory);return;
 }
 const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
 if(config.remoteTransport)throw Error('Remote transport unavailable: no supported dispatch/result connector paired');
 const bundleHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'SHA256.json'))).digest('hex');
 if(config.bundleHash!==bundleHash)throw Error('Locally approved bundle pin mismatch; no automatic executable update');
 // Verify all packaged components before helper launch, using locally approved bundle pin as trust anchor.
 const hashes=JSON.parse(fs.readFileSync(path.join(__dirname,'SHA256.json'),'utf8'));
 for(const [name,digest]of Object.entries(hashes))if(path.basename(name)!==name||crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')!==digest)throw Error('Package integrity mismatch');
 const lock=path.join(directory,'controller.lock');const fd=fs.openSync(lock,'wx');let active,stopping=false;
 const stop=()=>{stopping=true;active?.close();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const inbox=path.join(directory,'inbox'),outbox=path.join(directory,'outbox');fs.mkdirSync(inbox,{recursive:true});fs.mkdirSync(outbox,{recursive:true});
 const audit=e=>fs.appendFileSync(path.join(directory,'audit.jsonl'),JSON.stringify({time:new Date().toISOString(),...e})+'\n');
 const engine=controller({directory,key:config.approvalPublicKey,deviceId:config.deviceId,bundleHash,log:audit,execute:async job=>{
  const events=[],log=e=>events.push({time:new Date().toISOString(),...e});
  try{
   if(stopping||fs.existsSync(path.join(directory,'STOP')))throw Error('Stopped');
   active=nativeClient(__dirname);await active.handshake();const found=await active.list();
   const device=found.devices.find(d=>d.id===job.deviceId&&d.targetHardware===true&&d.transport==='usb-direct');
   if(!device)throw Error('Paired USB printer absent');
   await active.open(device,{});return await diagnose({io:active,log});
  }catch(e){log({error:e.message});throw e;}
  finally{active?.close();active=null;fs.writeFileSync(path.join(outbox,job.id+'.json'),JSON.stringify({jobId:job.id,physicalVerified:false,events},null,2));}
 }});
 console.log('LOCAL QUEUE PILOT ONLY. Remote dispatch/upload BLOCKED. Ctrl+C or STOP file stops controller.');
 const guard=setInterval(()=>{if(fs.existsSync(path.join(directory,'STOP')))stop();},100);
 try{
  while(!stopping){
   for(const name of fs.readdirSync(inbox).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){
    if(stopping)break;const file=path.join(inbox,name);
    try{if(fs.statSync(file).size>40000)throw Error('Job too large');await engine.accept(JSON.parse(fs.readFileSync(file,'utf8')));}
    catch(e){audit({event:'job-rejected-or-failed',file:name,error:e.message});}
    fs.renameSync(file,file+'.processed');
   }
   await new Promise(r=>setTimeout(r,500));
  }
 }finally{clearInterval(guard);stop();fs.closeSync(fd);fs.unlinkSync(lock);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
