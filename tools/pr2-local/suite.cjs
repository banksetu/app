'use strict';
const {C,status,paper}=require('./pr2-protocol.cjs');
const {hex,proof}=require('./core.cjs');

// One bounded, locally approved investigation. Each documented motion command
// is sent at most once. A later candidate is allowed only while the printer
// still reports READY + DOCUMENT ALIGNED. The first insertion stops the suite.
async function fullSuite({io,log,approve,fence,resolution=216,passbookType='horizontal'}){
 const typeByte={document:0x40,vertical:0x44,horizontal:0x46}[passbookType];
 if(typeByte===undefined)throw Error('Paper type must be document, vertical or horizontal');
 const capture=async label=>{
  const r=await io.rpc('capture',{},5000),bytes=Buffer.from(r.data,'base64');
  log({direction:'RX',label,hex:hex(bytes),segments:r.segments||[],zeroReads:r.zeroReads||0,quietTimeout:!!r.quietTimeout,limitReached:!!r.limitReached});
  if(r.limitReached)throw Error('USB reply exceeded the bounded capture window');
  return bytes;
 };
 const tx=async(label,bytes)=>{log({direction:'TX',label,hex:hex(bytes)});const r=await io.write(bytes);log({direction:'WRITE-ACK',label,written:r.written});};
 const exact=async(label,command,length)=>{
  await tx(label,command);const bytes=await capture(label);
  if(bytes.length!==length)throw Error(label+' returned '+bytes.length+' bytes; expected '+length);
  return bytes;
 };
 const state=async prefix=>{
  const sbytes=await exact(prefix+'-status',C.status,3);
  const pbytes=await exact(prefix+'-paper',C.paper,6);
  let parsedStatus;try{parsedStatus=status(sbytes,{allowNoPaper:true});}catch(error){return {sbytes,pbytes,error,statusHex:hex(sbytes)};}
  let parsedPaper;try{parsedPaper=paper(pbytes);}catch(error){return {sbytes,pbytes,error,statusHex:hex(sbytes)};}
  log({stage:prefix,status:parsedStatus,paper:parsedPaper});
  return {sbytes,pbytes,status:parsedStatus,paper:parsedPaper};
 };
 if(![216,240].includes(resolution))throw Error('Select printer configuration resolution 216 or 240');
 if(!await approve('full-suite'))throw Error('Local approval declined');
 await fence();

 await tx('configuration',Buffer.from([27,105]));
 const configuration=await capture('configuration');
 const configurationValid=configuration.length===6&&configuration[0]===27&&configuration[1]===112;
 log({configurationValid,configurationHex:hex(configuration)});
 if(configuration.length&&!configurationValid)throw Error('Unexpected PR2 configuration response; suite stopped');

 await tx('paper-type-'+passbookType,Buffer.from([27,39,typeByte]));
 const typeReply=await capture('paper-type-'+passbookType);
 if(typeReply.length)throw Error('Unexpected response after paper-type setting; suite stopped');
 let current=await state('after-paper-type');
 if(current.error)throw current.error;
 if(current.status.ready!==true||current.paper!=='aligned')throw Error('Full suite requires READY + DOCUMENT ALIGNED before motion');

 const candidates=[
  {name:'width-measurement',command:Buffer.from([27,125,45]),measurement:true},
  {name:'length-measurement',command:Buffer.from([27,45]),measurement:true},
  {name:'absolute-position-feed',command:Buffer.from([27,76,48,48,48]),measurement:false},
 ];
 const attempts=[];
 for(const candidate of candidates){
  await tx(candidate.name,candidate.command);
  const response=await capture(candidate.name);
  const measurementValid=candidate.measurement&&response.length===6&&response[0]===27&&response[1]===83&&response.subarray(2).every(x=>x>=48&&x<=57);
  if(response.length&&!measurementValid)throw Error(candidate.name+' returned unexpected bytes; suite stopped');
  current=await state('after-'+candidate.name);
  attempts.push({name:candidate.name,responseHex:hex(response),measurementValid,statusHex:hex(current.sbytes),paper:current.paper||null,error:current.error?.message||null});
  log({suiteAttempt:attempts.at(-1)});
  if(current.error)throw Error(candidate.name+' status '+hex(current.sbytes)+': '+current.error.message);
  if(current.status.ready!==true)throw Error(candidate.name+' left printer non-ready; suite stopped without reset');
  if(current.paper==='inserted'){
   if(!await approve('synthetic-print'))return {configurationValid,attempts,insertedBy:candidate.name,printed:false,physicalVerified:false};
   const chunks=proof(resolution);
   for(const bytes of chunks.slice(1))await tx('suite-synthetic-print',bytes);
   const final=await state('post-suite-print');
   return {configurationValid,attempts,insertedBy:candidate.name,printed:true,postPaper:final.paper||null,physicalVerified:false,requiresHumanConfirmation:true};
  }
  if(current.paper!=='aligned')throw Error(candidate.name+' changed paper to '+current.paper+'; suite stopped');
 }
 return {configurationValid,attempts,insertedBy:null,printed:false,physicalVerified:false,requiresHumanConfirmation:true};
}
module.exports={fullSuite};
