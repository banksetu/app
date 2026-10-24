'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const readline=require('node:readline/promises');
const {nativeClient}=require('./pr2-native.cjs'),{run}=require('./core.cjs');
async function main(){
 if(process.platform!=='win32'||!process.stdin.isTTY)throw Error('Interactive Windows console required');
 const oneClick=process.argv.includes('--one-click');
 const sampleArg=process.argv.find(value=>/^--sample=(assam|union)$/.test(value));
 const sample=sampleArg?sampleArg.slice('--sample='.length):'assam';
 const base=__dirname,manifest=JSON.parse(fs.readFileSync(path.join(base,'SHA256.json'),'utf8'));
 for(const [name,digest] of Object.entries(manifest))if(path.basename(name)!==name||crypto.createHash('sha256').update(fs.readFileSync(path.join(base,name))).digest('hex')!==digest)throw Error('Package checksum mismatch');
 const output=path.join(process.env.LOCALAPPDATA,'BankSetu-PR2-LocalTest');fs.mkdirSync(output,{recursive:true});
 const lock=path.join(output,'agent.lock');const fd=fs.openSync(lock,'wx');
 const report=path.join(output,'diagnostic-'+new Date().toISOString().replace(/[:.]/g,'-')+'.jsonl');
 const log=e=>{const row={time:new Date().toISOString(),...e};fs.appendFileSync(report,JSON.stringify(row)+'\n');const shown=/print/.test(e.label||'')&&e.direction==='TX'?{...row,hex:'[saved in private local report]',bytes:e.hex.split(' ').length}:row;console.log(JSON.stringify(shown));};
 const prompt=readline.createInterface({input:process.stdin,output:process.stdout});let io;
 try{
 log({agent:'local-pr2-v1',source:fs.readFileSync(path.join(base,'SOURCE.txt'),'utf8').trim(),physicalVerified:false});
 console.log('Close Bank Setu and other printer applications. No driver changes. No automatic retry.');
 io=nativeClient(base);await io.handshake();const found=await io.list();
 const devices=found.devices.filter(d=>d.transport==='usb-direct'&&d.targetHardware===true);
 if(!devices.length)throw Error('No USB VID_04B8 PID_0005 interface found; no fallback to spooler');
 devices.forEach((d,i)=>console.log(i+': '+d.name));
 const index=devices.length===1?'0':await prompt.question('Select device number: ');
 if(!/^\d+$/.test(index)||!devices[Number(index)])throw Error('Invalid selection');
 if(!oneClick&&await prompt.question('Physically confirm Epson PLQ-20 in PR2 mode: type PLQ20 PR2: ')!=='PLQ20 PR2')throw Error('Model/mode not confirmed');
 const marker=path.join(output,'review-required.json');
 if(fs.existsSync(marker)){
 const reviewed=await prompt.question(oneClick?'Prior job marker found. Inspect the printer, then press ENTER to continue: ':'Prior motion may have occurred. Inspect paper and remove pending jobs. Type INSPECTED to unlock: ');
 if((oneClick&&reviewed!=='')||(!oneClick&&reviewed!=='INSPECTED'))throw Error('Physical review required');
 fs.unlinkSync(marker);
 }
 const action=oneClick?'full-suite':await prompt.question('Action (diagnose / full-suite / measure-width / print): ');
 if(!['diagnose','full-suite','measure-width','print'].includes(action))throw Error('Only diagnostic, consolidated full suite, one measured feed or one synthetic print proof is available');
 if(action==='full-suite')console.log('Full suite prints the synthetic '+sample+' approved-layout sample, waits for raster completion, then sends one front eject. It never retries motion.');
 const resolution=['print','full-suite'].includes(action)?(oneClick?216:Number(await prompt.question('Printer configuration vertical resolution (216 or 240): '))):undefined;
 const passbookType=action==='full-suite'?(oneClick?'horizontal':await prompt.question('Test paper type (horizontal / vertical / document): ')):undefined;
 let oneClickApproved=false;
 if(oneClick){
  console.log('ONE-CLICK TEST: one feed, approved Assam Gramin Bank synthetic layout in paced 24-dot bands, then one front eject. No motion retries.');
  if(await prompt.question('Insert the disposable test passbook/sheet in the front slot, confirm PLQ-20 PR2 mode, then press ENTER: ')!=='')throw Error('Local approval cancelled');
  oneClickApproved=true;
 }
 await io.open(devices[Number(index)],{});
 // Extra raw RX events from isolated helper include partial/timeout evidence.
 io.read=async n=>{const r=await io.rpc('read',{count:n},5000);const b=Buffer.from(r.data,'base64');log({direction:'RX-RAW',hex:b.toString('hex'),timedOut:!!r.timedOut,expected:n});if(r.timedOut||b.length!==n)throw Error('Incomplete response; inspect RX-RAW. No retry.');return b;};
 const diagnostic=await require('./diagnostics.cjs').diagnose({io,log});
 if(action==='print'&&(!diagnostic.diagnosticFramesMatched||!diagnostic.statusReady||!['aligned','inserted'].includes(diagnostic.paperState)))throw Error('Strict ready status and aligned synthetic paper are required before the print proof');
 if(action==='measure-width'&&(!diagnostic.diagnosticFramesMatched||!diagnostic.statusReady||diagnostic.paperState!=='aligned'))throw Error('Strict ready status and newly aligned disposable paper are required before measured feed');
 const recoverableCommandError=diagnostic.identityMatched&&diagnostic.cleanInput&&diagnostic.statusFrameMatched&&diagnostic.statusCode===56&&diagnostic.paperFrameMatched&&diagnostic.paperState==='aligned';
 if(action==='full-suite'&&!((diagnostic.diagnosticFramesMatched&&diagnostic.statusReady&&diagnostic.paperState==='aligned')||recoverableCommandError))throw Error(diagnostic.paperState==='absent'||diagnostic.paperState==='released'?'No paper detected. Insert the test passbook/sheet in the front slot and run Start.cmd again.':'Strict PR2 identity plus READY/ALIGNED or the known recoverable command-error state is required before the full suite');
 const approve=async a=>oneClick?oneClickApproved:await prompt.question('Local approval for '+a+'? Type APPROVE '+a.toUpperCase()+': ')==='APPROVE '+a.toUpperCase();
 const fence=async()=>fs.writeFileSync(marker,JSON.stringify({action,time:new Date().toISOString()}),{flag:'wx'});
 const sampleRaster=oneClick?JSON.parse(fs.readFileSync(path.join(base,sample+'-sample-raster.json'),'utf8')):undefined;
 const result=action==='diagnose'?diagnostic:action==='full-suite'?await require('./suite.cjs').fullSuite({io,log,approve,fence,resolution,passbookType,sampleRaster}):await run({io,action,resolution,log,approve,fence});
 log({result});
 }catch(e){log({error:e.message,physicalVerified:false});process.exitCode=1;}
 finally{io?.close();prompt.close();fs.closeSync(fd);fs.unlinkSync(lock);console.log('Report: '+report+'\nShare this file privately in ChatGPT, never in a public GitHub issue. Physical success requires your confirmation.');}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
