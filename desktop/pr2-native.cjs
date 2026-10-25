'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const VERSION=1;
function nativeClient(directory,{spawnProcess=spawn}={}){
 const executable=path.join(directory,'BankSetu.Pr2Bridge.exe');let manifest;
 try{manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));if(!fs.existsSync(executable))throw Error();}catch{throw Error('Printer Bridge is missing or damaged. Repair/reinstall the Bank Setu EXE.');}
 if(manifest.protocol!==VERSION||manifest.sha256!==crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'))throw Error('Printer Bridge is missing or damaged. Repair/reinstall the Bank Setu EXE.');
 const child=spawnProcess(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
 let seq=0,pending=null,buffer='',closed=false;
 const stop=()=>{if(closed)return;closed=true;child.kill();if(pending){clearTimeout(pending.timer);pending.reject(Error('Printer communication interrupted. Do not resend until the physical result is checked.'));pending=null;}};
 child.on('error',stop);child.on('exit',stop);child.stdin.on('error',stop);child.stdout.on('error',stop);child.stderr.on('error',stop);child.stderr.resume();
 child.stdout.on('data',data=>{
  buffer+=data.toString('utf8');if(buffer.length>2_000_000){stop();return;}
  let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let value;try{value=JSON.parse(line);}catch{stop();return;}
   if(!pending||value.id!==pending.id){stop();return;}const p=pending;pending=null;clearTimeout(p.timer);value.error?p.reject(Error(value.error)):p.resolve(value.result);
  }
 });
 function rpc(op,args={},timeout=6000){if(closed)return Promise.reject(Error('Printer Bridge is closed.'));if(pending)return Promise.reject(Error('Printer Bridge is busy.'));return new Promise((resolve,reject)=>{const id=++seq;pending={id,resolve,reject,timer:setTimeout(()=>{stop();},timeout)};child.stdin.write(JSON.stringify({id,op,...args})+'\n',error=>{if(error)stop();});});}
 return {rpc,close:stop,async handshake(){const reply=await rpc('hello');if(reply.protocol!==VERSION)throw Error('Printer Bridge version mismatch.');},async list(){return rpc('list');},async open(device,settings){return rpc('open',{deviceId:device.id,baud:settings.baud||9600,parity:settings.parity||'None',dataBits:settings.dataBits||8,stopBits:settings.stopBits||1});},async write(bytes){const data=Buffer.from(bytes),result=await rpc('write',{data:data.toString('base64')},15000);if(result.written!==data.length)throw Error('Incomplete printer transmission. Do not resend.');return result;},async read(count){const r=await rpc('read',{count},5000);return Buffer.from(r.data,'base64');},async capture(timeoutMs=1500){timeoutMs=Math.max(250,Math.min(20000,Number(timeoutMs)||1500));const r=await rpc('capture',{timeoutMs},timeoutMs+4000);if(r.limitReached||typeof r.data!=='string')throw Error('USB reply exceeded the bounded capture window. No print data sent.');return Buffer.from(r.data,'base64');}};
}
module.exports={nativeClient,VERSION};
