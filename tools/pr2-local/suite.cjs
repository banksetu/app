'use strict';
const {C,status,paper,rasterBandsPhysical}=require('./pr2-protocol.cjs');
const {hex,makeSampleRaster}=require('./core.cjs');

// Epson NPD0841-00: reproduce the documented bank-style PR2 start sequence.
// The earlier isolated ESC } - experiment was rejected by the real device with
// ESC r 38. It is intentionally not retried here.
async function fullSuite({io,log,approve,fence,resolution=216,passbookType='horizontal',sampleRaster,ejectSettleMs=1000,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const typeByte={document:0x40,vertical:0x44,horizontal:0x46}[passbookType];
 if(typeByte===undefined)throw Error('Paper type must be document, vertical or horizontal');
 if(![216,240].includes(resolution))throw Error('Select printer configuration resolution 216 or 240');
 const capture=async(label,maxWait=1500)=>{
  const bounded=Math.max(250,Math.min(20000,maxWait));
  const r=await io.rpc('capture',{timeoutMs:bounded},bounded+4000),bytes=Buffer.from(r.data,'base64');
  log({direction:'RX',label,hex:hex(bytes),segments:r.segments||[],zeroReads:r.zeroReads||0,quietTimeout:!!r.quietTimeout,limitReached:!!r.limitReached});
  if(r.limitReached)throw Error('USB reply exceeded the bounded capture window');
  return bytes;
 };
 const tx=async(label,bytes)=>{log({direction:'TX',label,hex:hex(bytes)});const r=await io.write(bytes);log({direction:'WRITE-ACK',label,written:r.written});};
 const query=async(label,command,length,maxWait=1500)=>{await tx(label,command);const bytes=await capture(label,maxWait);if(bytes.length!==length)throw Error(label+' returned '+bytes.length+' bytes; expected '+length);return bytes;};
 const rawState=async prefix=>{
  const sbytes=await query(prefix+'-status',C.status,3),pbytes=await query(prefix+'-paper',C.paper,6);
  let parsedStatus=null,parsedPaper=null,error=null;
  try{parsedStatus=status(sbytes,{allowNoPaper:true});}catch(e){error=e;}
  try{parsedPaper=paper(pbytes);}catch(e){error=error||e;}
  log({stage:prefix,status:parsedStatus,paper:parsedPaper,statusHex:hex(sbytes),error:error?.message||null});
  return {sbytes,pbytes,status:parsedStatus,paper:parsedPaper,error};
 };
 const requireReadyAligned=s=>{if(s.error||s.status?.ready!==true||s.paper!=='aligned')throw Error('Bank-style setup requires READY + DOCUMENT ALIGNED; status='+hex(s.sbytes)+' paper='+(s.paper||'unknown'));};
 if(!await approve('full-suite'))throw Error('Local approval declined');
 await fence();
 const plan=rasterBandsPhysical(sampleRaster||makeSampleRaster(),{profile:'epson-plq20-pr2-v1',verticalResolution:resolution,offsetX:0,offsetY:0});
 const lineHeightMm=25.4/6;
 const pageLines=Math.max(42,Math.min(99,Math.ceil(plan.physical.bottomMm/lineHeightMm)+1));
 const settleMs=Math.max(1000,Math.min(5000,Number(ejectSettleMs)||1000));

 // A prior rejected experiment leaves the documented command-error status and
 // blinking Ready light. ESC l clears only that error; it does not initialize,
 // feed, eject or retry the rejected command.
 let current=await rawState('suite-entry');
 if(current.sbytes.equals(Buffer.from([27,114,56]))){
  if(current.paper!=='aligned')throw Error('Command error is present but paper is not aligned; inspect locally');
  await tx('clear-prior-command-error',Buffer.from([27,108]));
  const resetReply=await capture('clear-prior-command-error');
  if(resetReply.length)throw Error('Unexpected response while clearing prior command error');
  current=await rawState('after-error-clear');
 }
 requireReadyAligned(current);

 await tx('configuration',Buffer.from([27,105]));
 const configuration=await capture('configuration');
 const configurationValid=configuration.length===6&&configuration[0]===27&&configuration[1]===112&&configuration[2]===81;
 log({configurationValid,configurationHex:hex(configuration),emulation:configuration[2]===81?'PR2':'not-PR2'});
 if(!configurationValid)throw Error('Printer configuration did not confirm PR2; suite stopped');

 // Default is manual operation. The bank-style client keeps only Power lit by
 // selecting automatic mode and automatic paper detection (n=0x60).
 const setup=[
  ['automatic-operation-mode',Buffer.from([27,46])],
  ['automatic-paper-detection',Buffer.from([27,85,96])],
  ['cut-sheet-passbook',Buffer.from([27,83,53])],
  ['paper-type-'+passbookType,Buffer.from([27,39,typeByte])],
  ['line-space-default',Buffer.from([27,38,48,48])],
  // Keep one full line below the actual last ink row. Union's final row now
  // remains inside the physical page, normally returning this to the floor.
  ['page-length-'+pageLines+'-lines',Buffer.concat([Buffer.from([27,81]),Buffer.from(String(pageLines).padStart(3,'0')),Buffer.from([27,90])])],
  ['top-edge-reference',Buffer.from([27,35,48])],
 ];
 for(const [label,command] of setup)await tx(label,command);
 const unsolicited=await capture('bank-style-setup');
 if(unsolicited.length&&!unsolicited.equals(Buffer.from([27,114,37])))throw Error('Unexpected response during bank-style setup: '+hex(unsolicited));
 current=await rawState('after-bank-style-setup');requireReadyAligned(current);

 // One documented feed to printable top. Never resend it.
 await tx('bank-style-feed',Buffer.from([27,76,48,48,48]));
 const feedReply=await capture('bank-style-feed');
 if(feedReply.length)throw Error('Unexpected response during bank-style feed: '+hex(feedReply));
 let p='aligned';
 for(let attempt=0;attempt<5;attempt++){
  p=paper(await query('after-bank-style-feed-paper',C.paper,6));log({paper:p,observation:attempt+1});
  if(p!=='aligned')break;
  if(attempt<4)await wait(500);
 }
 const after=status(await query('after-bank-style-feed-status',C.status,3),{allowNoPaper:true});
 if(after.ready!==true||p!=='inserted')throw Error('Bank-style feed not confirmed; status ready='+(after.ready===true)+' paper='+p+'. No graphics or retry sent.');

 // One explicit local approval covers one synthetic print followed by one
 // documented front output. This prevents a successfully printed passbook from
 // being stranded because a second prompt was missed.
 if(!await approve('print-and-front-eject'))return {configurationValid,insertedBy:'bank-style-feed',printed:false,ejected:false,postPaper:p,physicalVerified:false,requiresHumanConfirmation:true};
 log({stage:'banded-print',bands:plan.bands.length,transport:plan.transport,pixels:plan.pixels,density:plan.density,physical:plan.physical,pageLines,ejectSettleMs:settleMs});
 // Each block ends BIM and queues documented ESC } W. The following ESC j
 // status request is sent only after that complete block; READY is the strict
 // printer acknowledgement before the next block. No band or motion is retried.
 for(let i=0;i<plan.bands.length;i++){
  const label='suite-passbook-band-'+(i+1)+'-of-'+plan.bands.length;
  await tx(label,plan.bands[i]);
  const completed=status(await query(label+'-ready',C.status,3,15000),{allowNoPaper:true});
  if(completed.ready!==true)throw Error('Printer did not confirm completion of passbook band '+(i+1)+'. Printing stopped before eject.');
  log({stage:'band-complete',band:i+1,bands:plan.bands.length,status:'ready'});
 }
 const postPrintPaper=paper(await query('after-passbook-bands-paper',C.paper,6,5000));
 if(postPrintPaper!=='inserted')throw Error('Passbook was not retained after the final print band; front eject was not sent.');
 await wait(settleMs);
 await tx('front-eject',C.eject);
 const ejectReply=await capture('front-eject');
 if(ejectReply.length)throw Error('Unexpected response during front eject: '+hex(ejectReply));
 let released=null,observedInserted=false;
 for(let attempt=0;attempt<10;attempt++){
  await tx('after-front-eject-paper',C.paper);const bytes=await capture('after-front-eject-paper');
  if(bytes.length===0){log({paper:null,ejectObservation:attempt+1,observation:'no-response'});}
  else if(bytes.length!==6)throw Error('Mixed response while observing front eject: '+hex(bytes));
  else{released=paper(bytes);observedInserted=observedInserted||released==='inserted';log({paper:released,ejectObservation:attempt+1});}
  if(['released','absent'].includes(released))break;
  if(attempt<9)await wait(500);
 }
 if(observedInserted&&!['released','absent'].includes(released))throw Error('Front eject command was sent once, but inserted paper remained; do not pull against resistance');
 return {configurationValid,insertedBy:'bank-style-feed',sample:'synthetic-bank-setu',printed:true,ejectCommandSent:true,ejected:['released','absent'].includes(released),postPaper:released||'unobserved',physicalVerified:false,requiresHumanConfirmation:true};
}
module.exports={fullSuite};
