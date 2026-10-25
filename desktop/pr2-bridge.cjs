'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PROFILES,C,status,paper,rasterBandsPhysical}=require('./pr2-protocol.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function createBridge({directory,transport,authorize,progress=()=>{},now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const file=path.join(directory,'pr2-state-v1.json');let saved={version:1,preferences:{},jobs:{},fences:{}};
 if(fs.existsSync(file)){saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version!==1||!saved.jobs||!saved.preferences||!saved.fences)throw Error('Printer Bridge state needs repair; existing data was retained.');}
 for(const job of Object.values(saved.jobs))if(job.state==='sending')saved.fences[job.deviceId]=true;
 const active=new Map();
 const persist=()=>{fs.mkdirSync(directory,{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(saved),{mode:0o600});fs.renameSync(temp,file);};
 function settingsFor(scope,device,settings){
  authorize(scope);const profile=PROFILES[settings?.profile];if(!profile)throw Error('No verified command profile exists for this model. Use normal Print or obtain model documentation.');
  if(/\bPLQ[- ]?\d/i.test(device?.name||'')&&!profile.model.test(device.name))throw Error('Selected model has no verified command profile.');
  if(settings.confirmMode!==true||settings.confirmModel!==true)throw Error('Confirm the physical model and PR2 mode before testing.');
  if(![216,240].includes(settings.verticalResolution))throw Error('Choose the vertical resolution from the printer configuration sheet.');
  if(![settings.offsetX,settings.offsetY].every(n=>Number.isFinite(n)&&Math.abs(n)<=10))throw Error('Printer calibration must be between -10 and +10 mm.');
  if(settings.paperLengthMm!==undefined&&(!Number.isFinite(settings.paperLengthMm)||settings.paperLengthMm<100||settings.paperLengthMm>300))throw Error('Passbook paper length is outside the supported range.');
  if(!['horizontal','vertical','document'].includes(settings.passbookType||'horizontal'))throw Error('Unsupported passbook paper type.');
  return {...settings,profile:profile.id};
 }
 async function connection(device,settings){const io=transport();try{await io.handshake();await io.open(device,settings);return io;}catch(e){io.close();throw e;}}
 async function response(io,length,directUsb,timeoutMs=1500){const bytes=directUsb?await io.capture(timeoutMs):await io.read(length);if(bytes.length!==length)throw Error('Incomplete or mixed PR2 response. No print data sent.');return bytes;}
 async function exchange(io,command,length,directUsb,timeoutMs=1500){await io.write(command);return response(io,length,directUsb,timeoutMs);}
 async function identify(io,device){
  const directUsb=device.transport==='usb-direct';
  if(directUsb){
   if((await io.capture()).length)throw Error('Stale USB response before PR2 initialization. No print data sent.');
  }
  await io.write(C.start);
  if(directUsb&&(await io.capture()).length)throw Error('Unexpected response to PR2 initialization. No print data sent.');
  const id=await exchange(io,C.identity,3,directUsb);
  if(!id.equals(Buffer.from([27,47,55])))throw Error('The selected device did not confirm PR2 emulation. No print data sent.');
  const statusFrame=await exchange(io,C.status,3,directUsb),paperState=paper(await exchange(io,C.paper,6,directUsb));
  const commandError=statusFrame.equals(Buffer.from([27,114,56]));
  if(!commandError)status(statusFrame,{allowNoPaper:true});
  return {paper:paperState,commandError};
 }
 async function quiet(io,device,timeoutMs=1500){return device.transport==='usb-direct'?io.capture(timeoutMs):Buffer.alloc(0);}
 async function recoverAndConfigure(io,device,settings,observed,plan){
  if(observed.paper!=='aligned')throw Error('Please reinsert your passbook in the front slot.');
  if(observed.commandError){
   await io.write(Buffer.from([27,108]));const cleared=await quiet(io,device);
   if(cleared.length)throw Error('Printer command error could not be cleared safely.');
   status(await exchange(io,C.status,3,device.transport==='usb-direct'),{allowNoPaper:true});
   if(paper(await exchange(io,C.paper,6,device.transport==='usb-direct'))!=='aligned')throw Error('Please reinsert your passbook in the front slot.');
  }
  const configuration=await exchange(io,Buffer.from([27,105]),6,device.transport==='usb-direct');
  if(configuration[0]!==27||configuration[1]!==112||configuration[2]!==81)throw Error('Printer configuration is not in PR2/Olivetti mode.');
  const typeByte={document:0x40,vertical:0x44,horizontal:0x46}[settings.passbookType||'horizontal'];
  const physicalLength=Number(settings.paperLengthMm)||Math.max(100,Math.min(300,plan.pageHeightMm));
  const pageLines=Math.max(42,Math.min(99,Math.ceil(physicalLength/(25.4/6))));
  const setup=[Buffer.from([27,46]),Buffer.from([27,85,96]),Buffer.from([27,83,53]),Buffer.from([27,39,typeByte]),Buffer.from([27,38,48,48]),Buffer.concat([Buffer.from([27,81]),Buffer.from(String(pageLines).padStart(3,'0')),Buffer.from([27,90])]),Buffer.from([27,35,48])];
  for(const command of setup)await io.write(command);
  const unsolicited=await quiet(io,device);
  if(unsolicited.length&&!unsolicited.equals(Buffer.from([27,114,37])))throw Error('Printer rejected the tested automatic PR2 setup.');
  const ready=status(await exchange(io,C.status,3,device.transport==='usb-direct'),{allowNoPaper:true}),aligned=paper(await exchange(io,C.paper,6,device.transport==='usb-direct'));
  if(ready.ready!==true||aligned!=='aligned')throw Error('Please reinsert your passbook in the front slot.');
 }
 return {
  async discover(scope){authorize(scope);const io=transport();try{await io.handshake();const found=await io.list();const preferences=saved.preferences[hash(scope)];return {...found,profiles:Object.values(PROFILES).map(({model,...p})=>p),preferences,devices:found.devices.map(d=>({...d,profile:Object.values(PROFILES).find(p=>p.model.test(d.name))?.id||null,requiresReview:!!saved.fences[d.id]}))};}finally{io.close();}},
  async probe(scope,device,settings){settings=settingsFor(scope,device,settings);if(active.has(device.id))throw Error('Printer is busy.');active.set(device.id,{scope,probing:true});let io;try{io=await connection(device,settings);active.get(device.id).io=io;if(active.get(device.id).cancelled)throw Error('Printer check cancelled.');const observed=await identify(io,device);return {pr2:true,paper:observed.paper,hardwareVerified:false};}finally{io?.close();active.delete(device.id);}},
  acknowledge(scope,deviceId){authorize(scope);if(active.has(deviceId))throw Error('Wait for the active printer job.');delete saved.fences[deviceId];for(const job of Object.values(saved.jobs))if(job.deviceId===deviceId&&job.state==='sending')job.state='reviewed';persist();},
  cancel(scope,id){authorize(scope);for(const value of active.values())if(value.scope===scope&&(value.id===id||value.probing)){value.cancelled=true;value.io?.close();return true;}return false;},
  close(){for(const value of active.values()){value.cancelled=true;value.io?.close();}},
  async print({scope,id,device,settings,raster,rasters,test=false}){
   settings=settingsFor(scope,device,settings);
   if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid print request identity.');
   const scopeHash=hash(scope),prior=saved.jobs[id];if(prior){if(prior.scope!==scopeHash)throw Error('Print request belongs to another workspace.');return {state:prior.state==='sending'?'uncertain':prior.state,completed:prior.state==='completed',replayed:true};}
   if(saved.fences[device.id])throw Error('Previous printing was interrupted. Inspect the passbook and acknowledge its result before another job.');
   if(active.has(device.id))throw Error('This printer already has an active request.');
   if(!test&&settings.acceptRaster!==true)throw Error('Confirm the 180 dpi graphics proof; physical alignment has not been verified.');
   const pages=Array.isArray(rasters)&&rasters.length?rasters:[raster];
   if(pages.length>10)throw Error('A direct passbook job supports at most 10 pages.');
   const plans=pages.map(page=>({...rasterBandsPhysical(page,settings),pageHeightMm:page.height*25.4/page.dpi})),job={id,scope,cancelled:false,io:null};active.set(device.id,job);
   let transmitted=false;const overallDeadline=now()+600000;
   const check=()=>{authorize(scope);if(now()>overallDeadline)throw Error('Printer job timed out.');if(job.cancelled)throw Error('Printing cancelled.');};
   const notify=message=>progress({id,message});
   try{
    job.io=await connection(device,settings);check();let observed=await identify(job.io,device),state=observed.paper;
    for(let pageIndex=0;pageIndex<plans.length;pageIndex++){
     const plan=plans[pageIndex],deadline=now()+60000;
     while(state!=='aligned'){
      notify(pageIndex===0?'Please insert your passbook.':'Please change your passbook paper.');check();if(now()>=deadline)throw Error('No passbook detected within 60 seconds. Insert it and start a new request.');
      await wait(1000);check();state=paper(await exchange(job.io,C.paper,6,device.transport==='usb-direct'));
     }
     observed={...observed,paper:state};check();await recoverAndConfigure(job.io,device,settings,observed,plan);observed={paper:'aligned',commandError:false};
     if(!transmitted){
      // Persist intent BEFORE the first feeding/graphics byte; a crash never triggers automatic replay.
      saved.jobs[id]={scope:scopeHash,deviceId:device.id,state:'sending',time:now()};
      const ids=Object.keys(saved.jobs);for(const old of ids.slice(0,Math.max(0,ids.length-200)))delete saved.jobs[old];persist();transmitted=true;
     }
     notify('Feeding passbook page '+(pageIndex+1)+' of '+plans.length+'. Do not remove it.');
     await job.io.write(plan.feed);const feedReply=await quiet(job.io,device);if(feedReply.length)throw Error('Printer rejected the tested passbook feed command.');check();
     let inserted;
     for(let attempt=0;attempt<5;attempt++){
      check();inserted=paper(await exchange(job.io,C.paper,6,device.transport==='usb-direct'));
      if(inserted==='inserted'||inserted!=='aligned')break;
      if(attempt<4)await wait(500);
     }
     const feedStatus=status(await exchange(job.io,C.status,3,device.transport==='usb-direct'),{allowNoPaper:true});
     if(feedStatus.ready!==true)throw Error('Printer is not ready after feed. Graphics were stopped.');
     if(inserted!=='inserted')throw Error('Paper feed not confirmed ('+inserted+'). Graphics were stopped.');
     for(let band=0;band<plan.bands.length;band++){
      check();notify('Printing page '+(pageIndex+1)+' of '+plans.length+', band '+(band+1)+' of '+plan.bands.length+'. Do not remove it.');await job.io.write(plan.bands[band]);
      const completed=status(await exchange(job.io,C.status,3,device.transport==='usb-direct',15000),{allowNoPaper:true});
      if(completed.ready!==true)throw Error('Printer did not confirm completion of passbook band '+(band+1)+'. Printing stopped before eject.');
     }
     const retained=paper(await exchange(job.io,C.paper,6,device.transport==='usb-direct',5000));
     if(retained!=='inserted')throw Error('Passbook was not retained after the final print band; front eject was not sent.');
     await wait(pageIndex===0&&settings.paperLengthMm===215?3000:1000);check();notify('Returning the passbook through the front slot. Do not pull it.');await job.io.write(C.eject);const ejectReply=await quiet(job.io,device);if(ejectReply.length)throw Error('Printer rejected the front return command.');
     let released=null,observedInserted=false;
     for(let attempt=0;attempt<10;attempt++){
      check();try{released=paper(await exchange(job.io,C.paper,6,device.transport==='usb-direct'));observedInserted=observedInserted||released==='inserted';}
      catch(error){if(device.transport!=='usb-direct'||!/Incomplete or mixed/.test(error.message))throw error;released=null;}
      if(['absent','released'].includes(released))break;if(attempt<9)await wait(500);
     }
     if(observedInserted&&!['absent','released'].includes(released))throw Error('Front return was sent once, but inserted paper remained.');
     if(!['absent','released'].includes(released))throw Error('Front return was sent once, but the direct USB status channel stayed silent; inspect the paper.');
     state=released;observed={paper:state,commandError:false};
    }
    check();saved.jobs[id].state='completed';saved.preferences[scopeHash]={deviceId:device.id,...settings};persist();
    return {state:'completed',completed:true,message:'Print completed.'};
   }catch(error){
    if(transmitted){saved.jobs[id].state='uncertain';saved.fences[device.id]=true;persist();return {state:'uncertain',completed:false,message:'Printing may have started. '+error.message+' No automatic resend. Inspect the passbook before retrying.'};}
    return {state:job.cancelled?'cancelled':'failed',completed:false,message:error.message};
   }finally{job.io?.close();active.delete(device.id);}
  },
 };
}
module.exports={createBridge};
