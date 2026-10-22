import type { LicensePermission } from './core/licensePolicy';
import './LicenseManagement.css';
export default function LicenseNotice({open,permission}:{open:()=>void;permission:LicensePermission}){
  if(permission.state==='master'||permission.state==='active')return null;
  return <div role="status" className="license-note" style={{margin:'12px 20px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
    <strong>License {permission.state.replaceAll('_',' ')}</strong>
    {permission.expiresAt && <span>Expiry: {new Date(permission.expiresAt).toLocaleDateString()}{permission.daysRemaining!==null?` · ${permission.daysRemaining} days remaining`:''}</span>}
    <button type="button" onClick={open}>Renew or Upgrade</button>
  </div>;
}
