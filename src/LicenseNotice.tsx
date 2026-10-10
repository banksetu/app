import { useEffect, useState } from 'react';
import { callBankSetuWorker } from './workerApi';
import './LicenseManagement.css';
type Status={license:{plan:string;expiresAt:string|null}|null;view:{state:string;daysRemaining:number|null};flags:{uiEnabled:boolean}};
export default function LicenseNotice({open}:{open:()=>void}){
  const [status,setStatus]=useState<Status|null>(null);
  const [dismissed,setDismissed]=useState(false);
  useEffect(()=>{let active=true;void callBankSetuWorker<Status>('/license-me',{}).then(value=>{if(active)setStatus(value);}).catch(()=>{/* Temporary backend failure must not block existing app access. */});return()=>{active=false;};},[]);
  const view=status?.view;
  if(!view||dismissed||!['expiring_soon','grace','expired','suspended','revoked'].includes(view.state))return null;
  const days=view.daysRemaining;
  const milestone=days!==null&&[30,15,7,1,0].some(n=>days<=n);
  if(view.state==='expiring_soon'&&!milestone)return null;
  return <div role="status" className="license-note" style={{margin:'12px 20px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><strong>License {view.state.replaceAll('_',' ')}</strong><span>{status.license?.expiresAt?`Expiry: ${new Date(status.license.expiresAt).toLocaleDateString()} · ${days||0} days remaining`:''}</span><button type="button" onClick={open}>Renew or Upgrade</button><button type="button" onClick={()=>setDismissed(true)} aria-label="Dismiss license reminder">×</button></div>;
}
