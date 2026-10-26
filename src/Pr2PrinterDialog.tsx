import {useEffect,useRef,useState} from 'react';
import {identity} from './core/localData';
import {requireLicensedWrite} from './core/licenseAccess';
import {rasterizePassbook,type Pr2Settings,type Pr2Outcome} from './platform/pr2';
import type {PrintOffset} from './PrintAlignmentPreview';
import './Pr2PrinterDialog.css';
const defaultsFor=(bankName:string):Pr2Settings=>({profile:'epson-plq20-pr2-v1',verticalResolution:/union bank/i.test(bankName)?216:240,offsetX:0,offsetY:0,confirmMode:true,confirmModel:true,acceptRaster:true,baud:9600,parity:'None',dataBits:8,stopBits:1,paperLengthMm:/union bank/i.test(bankName)?215:/punjab national bank|punjab bank|\bpnb\b/i.test(bankName)?190:/assam gramin|agvb|\bagb\b/i.test(bankName)?175:undefined,passbookType:'horizontal'});
export default function Pr2PrinterDialog({bankName,offset={x:0,y:0},testOnly=false,sourceRoot='.passbook-page',onClose,onComplete}:{bankName:string;offset?:PrintOffset;testOnly?:boolean;sourceRoot?:string;onClose:()=>void;onComplete:(result:Pr2Outcome)=>void}){
 const defaults=defaultsFor(bankName);
 const [scope]=useState(()=>identity()),[message,setMessage]=useState('Preparing the active bank template…'),[busy,setBusy]=useState(true),[done,setDone]=useState(false),[failed,setFailed]=useState(false);
 const job=useRef(''),running=useRef(false),alive=useRef(true);const api=window.bankSetuPr2!;
 const cancel=()=>void api.cancel({scope,id:job.current}).catch(()=>{});
 useEffect(()=>{alive.current=true;const stop=api.onProgress(event=>{if(event.id===job.current&&alive.current)setMessage(event.message);});
  const changed=()=>{void api.cancel({scope,id:job.current}).catch(()=>{});onClose();};window.addEventListener('banksetu-workspace-change',changed);
  const start=setTimeout(()=>{void (async()=>{let root:HTMLElement|null=null,calibratedArea:HTMLElement|null=null,previousTransform='';try{await requireLicensedWrite();root=document.querySelector<HTMLElement>(sourceRoot);root?.style.setProperty('--alignment-x',`${offset.x}mm`);root?.style.setProperty('--alignment-y',`${offset.y}mm`);root?.classList.add('alignment-print-active');document.documentElement.classList.add('pr2-direct-preparing');
   if(/assam gramin|agvb|\bagb\b/i.test(bankName)){const shell=document.querySelector<HTMLElement>('.passbook-shell'),area=document.querySelector<HTMLElement>('.passbook-print-area'),paths=[...document.querySelectorAll<SVGGraphicsElement>('.pb-pr2-typography path')].filter(path=>path.getBoundingClientRect().height>0);if(shell&&area&&paths.length){previousTransform=area.style.transform;const first=Math.min(...paths.map(path=>path.getBoundingClientRect().top)),target=shell.getBoundingClientRect().top+116*96/25.4;area.style.transform=`translateY(${target-first}px)`;calibratedArea=area;}}
   const [prepared,list]=await Promise.all([api.prepare(scope),api.discover(scope)]);job.current=prepared.id;const rendered=await rasterizePassbook(prepared.pdf);if(!alive.current)return;
   const compatible=list.devices.filter(device=>device.profile),remembered=compatible.find(device=>device.id===list.preferences?.deviceId),device=remembered||(compatible.length===1?compatible[0]:undefined);
   if(!device)throw Error(compatible.length?'More than one supported passbook printer is connected. Keep only the printer you want to use connected.':'Please connect your Epson PLQ passbook printer.');
   if(device.requiresReview)await api.acknowledge({scope,deviceId:device.id});
   const settings:Pr2Settings={...defaults,...list.preferences,profile:device.profile||defaults.profile,verticalResolution:defaults.verticalResolution,offsetX:0,offsetY:0,confirmMode:true,confirmModel:true,acceptRaster:true,paperLengthMm:defaults.paperLengthMm,passbookType:'horizontal'};
   running.current=true;setMessage('Please insert your passbook.');
   const result=await api.send({scope,id:prepared.id,device,settings,raster:rendered.rasters[0],rasters:rendered.rasters,test:testOnly});
   if(!alive.current)return;setMessage(result.message||result.state);setDone(true);
   if(result.completed&&!testOnly)onComplete(result);else if(!result.completed)setFailed(true);
  }catch(e){if(alive.current){setMessage(e instanceof Error?e.message:'Printer Bridge unavailable.');setFailed(true);}}finally{running.current=false;if(calibratedArea)calibratedArea.style.transform=previousTransform;root?.classList.remove('alignment-print-active');root?.style.removeProperty('--alignment-x');root?.style.removeProperty('--alignment-y');document.documentElement.classList.remove('pr2-direct-preparing');if(alive.current)setBusy(false);}})();},0);
  return()=>{clearTimeout(start);alive.current=false;stop();window.removeEventListener('banksetu-workspace-change',changed);void api.cancel({scope,id:job.current}).catch(()=>{});};
 // The modal is bound to the opening workspace and prepared customer document.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 return <div className="pr2-overlay"><section className="pr2-dialog pr2-progress" role="dialog" aria-modal="true" aria-label="Olivetti passbook printing">
  <h2>{done&&!failed?'Print completed':'Olivetti Mode Print'}</h2><p role="status">{message}</p><div className="pr2-actions">
  {busy&&<button onClick={()=>{cancel();setMessage('Cancellation requested. If printing started, inspect the passbook before retrying.');}}>Cancel</button>}
  {!busy&&<button onClick={onClose}>Close</button>}</div>
 </section></div>;
}
