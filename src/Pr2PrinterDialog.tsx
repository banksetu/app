import {useEffect,useRef,useState} from 'react';
import {identity} from './core/localData';
import {requireLicensedWrite} from './core/licenseAccess';
import {confirmAction} from './uiDialogs';
import {rasterizePassbook,calibrationRaster,type Pr2Device,type Pr2Settings,type Pr2Raster,type Pr2Outcome} from './platform/pr2';
import './Pr2PrinterDialog.css';
const defaults:Pr2Settings={profile:'epson-plq20-pr2-v1',verticalResolution:240,offsetX:0,offsetY:0,confirmMode:false,confirmModel:false,acceptRaster:false,baud:9600,parity:'None',dataBits:8,stopBits:1};
export default function Pr2PrinterDialog({bankName,onClose,onComplete}:{bankName:string;onClose:()=>void;onComplete:(result:Pr2Outcome)=>void}){
 const [scope]=useState(()=>identity()),[devices,setDevices]=useState<Pr2Device[]>([]),[deviceId,setDeviceId]=useState(''),[settings,setSettings]=useState(defaults),[raster,setRaster]=useState<Pr2Raster|null>(null),[preview,setPreview]=useState(''),[message,setMessage]=useState('Preparing the active bank template…'),[busy,setBusy]=useState(true),[checked,setChecked]=useState(false),[done,setDone]=useState(false);
 const job=useRef(''),running=useRef(false),alive=useRef(true);const api=window.bankSetuPr2!,device=devices.find(d=>d.id===deviceId);
 const patch=(value:Partial<Pr2Settings>)=>{setSettings(old=>({...old,...value}));setChecked(false);};
 useEffect(()=>{alive.current=true;const stop=api.onProgress(event=>{if(event.id===job.current&&alive.current)setMessage(event.message);});
  const changed=()=>{void api.cancel({scope,id:job.current}).catch(()=>{});onClose();};window.addEventListener('banksetu-workspace-change',changed);
  const start=setTimeout(()=>{void (async()=>{try{await requireLicensedWrite();const [prepared,list]=await Promise.all([api.prepare(scope),api.discover(scope)]);job.current=prepared.id;const rendered=await rasterizePassbook(prepared.pdf);if(!alive.current)return;
   setRaster(rendered.raster);setPreview(rendered.preview);setDevices(list.devices);
   const remembered=list.devices.find(d=>d.id===list.preferences?.deviceId),matches=list.devices.filter(d=>d.profile);
   if(remembered){setDeviceId(remembered.id);setSettings({...defaults,...list.preferences,acceptRaster:false});}else if(matches.length===1)setDeviceId(matches[0].id);
   setMessage(list.devices.length?'Choose/check the printer. Graphics preserve the source geometry at 180 dpi; physical alignment requires a real test.':'No USB/COM/LPT printer found. Connect the printer and reopen this dialog.');
  }catch(e){if(alive.current)setMessage(e instanceof Error?e.message:'Printer Bridge unavailable.');}finally{if(alive.current)setBusy(false);}})();},0);
  return()=>{clearTimeout(start);alive.current=false;stop();window.removeEventListener('banksetu-workspace-change',changed);void api.cancel({scope,id:job.current}).catch(()=>{});};
 // The modal is bound to the opening workspace and prepared customer document.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const probe=async()=>{if(!device||running.current)return;running.current=true;setBusy(true);try{if(identity()!==scope)throw Error('Workspace changed.');const result=await api.probe({scope,device,settings});setChecked(result.pr2);setMessage(`PR2 communication confirmed. Paper: ${result.paper}. Physical alignment is not yet verified.`);}catch(e){setChecked(false);setMessage((e as Error).message);}finally{running.current=false;setBusy(false);}};
 const send=async(test:boolean)=>{if(!device||!raster||!checked||running.current)return;running.current=true;setBusy(true);try{await requireLicensedWrite();if(identity()!==scope)throw Error('Workspace changed.');
  const result=await api.send({scope,id:job.current,device,settings,raster:test?calibrationRaster():raster,test});setMessage(result.message||result.state);setDone(true);
  if(result.completed&&!test)onComplete(result);
 }catch(e){setMessage((e as Error).message);}finally{running.current=false;setBusy(false);}};
 return <div className="pr2-overlay"><section className="pr2-dialog" role="dialog" aria-modal="true" aria-label="Bank Setu Universal PR2 Printer Bridge">
  <h2>Bank Setu Universal PR2 Printer Bridge</h2><p>{bankName} · current passbook layout · Windows direct device transport</p>
  <label>Printer<select disabled={busy||done} value={deviceId} onChange={e=>{setDeviceId(e.target.value);setChecked(false);}}><option value="">Select a printer</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name} · {d.transport}</option>)}</select></label>
  <p>PLQ-20/20M has a documented graphics profile. PLQ-32, PLQ-35 and other models require their command/capability verification; their names alone do not enable this profile.</p>
  <fieldset disabled={busy||done}><label><input type="checkbox" checked={settings.confirmModel} onChange={e=>patch({confirmModel:e.target.checked})}/> I checked that the physical printer is PLQ-20/20M.</label><label><input type="checkbox" checked={settings.confirmMode} onChange={e=>patch({confirmMode:e.target.checked})}/> The printer configuration sheet shows PR2/Olivetti mode.</label>
  <label>Printer vertical resolution<select value={settings.verticalResolution} onChange={e=>patch({verticalResolution:Number(e.target.value)})}><option value={240}>240 units/inch</option><option value={216}>216 units/inch</option></select></label>
  {device?.transport==='serial'&&<><label>COM baud<select value={settings.baud} onChange={e=>patch({baud:Number(e.target.value)})}>{[4800,9600,19200,38400,57600,115200].map(v=><option key={v}>{v}</option>)}</select></label><label>Parity<select value={settings.parity} onChange={e=>patch({parity:e.target.value})}>{['None','Even','Odd'].map(v=><option key={v}>{v}</option>)}</select></label><small>8 data bits, 1 stop bit. Match the printer configuration; other serial configurations are not enabled.</small></>}
  <details><summary>Printer-side calibration only</summary>{(['offsetX','offsetY'] as const).map(key=><label key={key}>{key==='offsetX'?'Horizontal':'Vertical'} offset (mm)<input type="number" min={-10} max={10} step={.1} value={settings[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}<p>Source fonts/compression and preview remain unchanged. Test grid: 100 × 40 mm at x=20 mm, y=90 mm.</p></details></fieldset>
  {preview&&<details><summary>Active template graphics proof (180 dpi)</summary><img className="pr2-proof" src={preview} alt="Current bank passbook graphics proof"/></details>}
  <label><input disabled={busy||done} type="checkbox" checked={settings.acceptRaster} onChange={e=>setSettings(old=>({...old,acceptRaster:e.target.checked}))}/> I reviewed the graphics proof. Hardware dot resolution and printable margins need physical verification.</label>
  <p role="status">{message}</p><div className="pr2-actions">
  {device?.requiresReview&&<button disabled={busy} onClick={()=>void (async()=>{if(await confirmAction('I have inspected the interrupted passbook print and accept that another print may duplicate it. Allow a new request?','Review interrupted printing')){await api.acknowledge({scope,deviceId});setDevices(old=>old.map(d=>d.id===deviceId?{...d,requiresReview:false}:d));}})().catch(e=>setMessage((e as Error).message))}>Review interrupted job</button>}
  <button disabled={busy||done||!device||!settings.confirmMode||!settings.confirmModel} onClick={()=>void probe()}>Check printer</button>
  <button disabled={busy||done||!checked||!raster||device?.requiresReview} onClick={()=>void send(true)}>Print calibration test</button>
  <button disabled={busy||done||!checked||!raster||!settings.acceptRaster||device?.requiresReview} onClick={()=>void send(false)}>Send this passbook</button>
  {busy&&<button onClick={()=>{if(!running.current){onClose();return;}void api.cancel({scope,id:job.current}).catch(e=>setMessage((e as Error).message));setMessage('Cancellation requested. If printing started, inspect the passbook before retrying.');}}>Cancel job</button>}
  <button disabled={busy} onClick={onClose}>{done?'Close · review before next print':'Close'}</button></div>
 </section></div>;
}
