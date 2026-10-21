'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const readline=require('node:readline/promises');
const {nativeClient}=require('./pr2-native.cjs'),{run}=require('./core.cjs');
async function main(){
 if(process.platform!=='win32'||!process.stdin.isTTY)throw Error('Interactive Windows console required');
 const base=__dirname,manifest=JSON.parse(fs.readFileSync(path.join(base,'SHA256.json'),'utf8'));
 for(const [name,digest] of Object.entries(manifest))if(path.basename(name)!==name||crypto.createHash('sha256').update(fs.readFileSync(path.join(base,name))).digest('hex')!==digest)throw Error('Package checksum mismatch');
 const output=path.join(process.env.LOCALAPPDATA,'BankSetu-PR2-LocalTest');fs.mkdirSync(output,{recursive:true});
 const lock=path.join(output,'agent.lock');const fd=fs.openSync(lock,'wx');
 const report=path.join(output,'diagnostic-'+new Date().toISOString().replace(/[:.]/g,'-')+'.jsonl');
 const log=e=>{const row={time:new Date().toISOString(),...e};fs.appendFileSync(report,JSON.stringify(row)+'\n');console.log(JSON.stringify(row));};
 const prompt=readline.createInterface({input:process.stdin,output:process.stdout});let io;
 try{
 log({agent:'local-pr2-v1',source:fs.readFileSync(path.join(base,'SOURCE.txt'),'utf8').trim(),physicalVerified:false});
 console.log('Close Bank Setu and other printer applications. No driver changes. No automatic retry.');
 io=nativeClient(base);await io.handshake();const found=await io.list();
 const devices=found.devices.filter(d=>d.transport==='usb-direct'&&d.targetHardware===true);
 if(!devices.length)throw Error('No USB VID_04B8 PID_0005 interface found; no fallback to spooler');
 devices.forEach((d,i)=>console.log(i+': '+d.name));
 const index=await prompt.question('Select device number: ');
 if(!/^\d+$/.test(index)||!devices[Number(index)])throw Error('Invalid selection');
 if(await prompt.question('Physically confirm Epson PLQ-20 in PR2 mode: type PLQ20 PR2: ')!=='PLQ20 PR2')throw Error('Model/mode not confirmed');
 const marker=path.join(output,'review-required.json');
 if(fs.existsSync(marker)){
 if(await prompt.question('Prior motion may have occurred. Inspect paper and remove pending jobs. Type INSPECTED to unlock: ')!=='INSPECTED')throw Error('Physical review required');
 fs.unlinkSync(marker);
 }
 const action=await prompt.question('Action (diagnose / feed / print / eject): ');
 if(action!=='diagnose')throw Error('Motion tests disabled pending diagnostic validation and separate approval');
 const resolution=action==='print'?Number(await prompt.question('Printer configuration vertical resolution (216 or 240): ')):undefined;
 await io.open(devices[Number(index)],{});
 // Extra raw RX events from isolated helper include partial/timeout evidence.
 io.read=async n=>{const r=await io.rpc('read',{count:n},5000);const b=Buffer.from(r.data,'base64');log({direction:'RX-RAW',hex:b.toString('hex'),timedOut:!!r.timedOut,expected:n});if(r.timedOut||b.length!==n)throw Error('Incomplete response; inspect RX-RAW. No retry.');return b;};
 const result=action==='diagnose'?await require('./diagnostics.cjs').diagnose({io,log}):await run({io,action,resolution,log,approve:async a=>await prompt.question('Permission for ONE '+a+' action on disposable test paper? Type APPROVE '+a.toUpperCase()+': ')==='APPROVE '+a.toUpperCase(),fence:async()=>fs.writeFileSync(marker,JSON.stringify({action,time:new Date().toISOString()}),{flag:'wx'})});
 log({result});
 }catch(e){log({error:e.message,physicalVerified:false});process.exitCode=1;}
 finally{io?.close();prompt.close();fs.closeSync(fd);fs.unlinkSync(lock);console.log('Report: '+report+'\nShare this file privately in ChatGPT, never in a public GitHub issue. Physical success requires your confirmation.');}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
