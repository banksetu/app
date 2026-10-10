import { useEffect, useState } from 'react';
import { callBankSetuWorker } from './workerApi';
import './LicenseManagement.css';

type Pricing = {annualPaise:number;lifetimePaise:number;annualAvailable:boolean;lifetimeAvailable:boolean;upgradeCreditEnabled:boolean;maxCreditPaise:number;graceDays:number;paymentInstructions:string};
type License = {tenantId:string;plan:string;status:string;expiresAt:string|null;paidPaise:number;revision:number};
type Inquiry = {id:string;kind:string;tenantId?:string;name?:string;bankName?:string;email?:string;status:string;quotedPaise?:number;paymentStatus:string};
type LicenseState = {license:License|null;view:{state:string;daysRemaining:number|null;canWrite:boolean};pricing:Pricing;flags:{uiEnabled:boolean};serverTime:string;legacyAccess:boolean};
const rupees=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format((paise||0)/100);
const initial:Pricing={annualPaise:0,lifetimePaise:0,annualAvailable:false,lifetimeAvailable:false,upgradeCreditEnabled:false,maxCreditPaise:0,graceDays:7,paymentInstructions:'Contact the Master Admin for payment details.'};
export default function LicenseManagement({master}:{master:boolean}) {
  const [pricing,setPricing]=useState<Pricing>(initial);
  const [uiEnabled,setUiEnabled]=useState(false);
  const [state,setState]=useState<LicenseState|null>(null);
  const [requests,setRequests]=useState<Inquiry[]>([]);
  const [licenses,setLicenses]=useState<License[]>([]);
  const [tenants,setTenants]=useState<Array<{tenantId:string;bankName:string}>>([]);
  const [truncated,setTruncated]=useState(false);
  const [summary,setSummary]=useState({total:0,active:0,soon:0,expired:0,pending:0});
  const [tenantId,setTenantId]=useState('');
  const [invite,setInvite]=useState({name:'',email:'',bankName:''});
  const [plan,setPlan]=useState<'annual'|'lifetime'>('annual');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const refresh=async()=>{
    if(master){
      const [settings,listing]=await Promise.all([
        callBankSetuWorker<{pricing:Pricing;flags:{uiEnabled:boolean}}>('/license-admin-settings',{}),
        callBankSetuWorker<{requests:Inquiry[];licenses:License[];tenants:Array<{tenantId:string;bankName:string}>;summary:{total:number;active:number;soon:number;expired:number;pending:number};truncated:boolean}>('/license-admin-list',{}),
      ]);
      setPricing(settings.pricing);setUiEnabled(settings.flags.uiEnabled);setRequests(listing.requests);setLicenses(listing.licenses);setTenants(listing.tenants);setSummary(listing.summary);setTruncated(listing.truncated);
    }else{
      const result=await callBankSetuWorker<LicenseState>('/license-me',{});
      setState(result);setPricing(result.pricing);
    }
  };
  useEffect(()=>{void refresh().catch(reason=>setError(reason instanceof Error?reason.message:'Unable to load license information.'));},[master]);
  const perform=async(fn:()=>Promise<unknown>,message:string)=>{
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{await fn();await refresh();setNotice(message);}catch(reason){setError(reason instanceof Error?reason.message:'Could not complete the request.');}finally{setBusy(false);}
  };
  const setMoney=(field:'annualPaise'|'lifetimePaise'|'maxCreditPaise',value:string)=>{
    const numeric=Math.round(Number(value)*100);
    setPricing(prev=>({...prev,[field]:Number.isFinite(numeric)?numeric:0}));
  };
  return <section className="license-panel">
    <div className="license-banner"><div><span>Bank Setu · License Management</span><h2>{master?'Welcome Back, Master Admin':'Your Bank Setu License'}</h2><p>One tenant license includes Windows and Android access.</p></div><div className="license-device">▣ <span>Desktop + Mobile</span></div></div>
    {master?<>
      <div className="license-summary">{[['Total Clients',summary.total,'blue'],['Active Licenses',summary.active,'green'],['Expiring Soon',summary.soon,'amber'],['Expired Licenses',summary.expired,'red'],['Pending Requests',summary.pending,'violet']].map(([label,count,color])=><div key={label} className={`license-tile ${color}`}><strong>{truncated?"≥":""}{count}</strong><span>{label}</span></div>)}</div>
      <div className="license-grid"><form className="license-card" onSubmit={e=>{e.preventDefault();void perform(()=>callBankSetuWorker('/license-save-settings',{pricing,uiEnabled}),'Pricing saved and audited.');}}>
        <h3>License Pricing <small>Master Control</small></h3><p>Configure prices without publishing a new app.</p>
        <div className="license-plan-inputs"><label>Annual License · INR<input type="number" min="0" step="0.01" value={(pricing.annualPaise/100).toFixed(2)} onChange={e=>setMoney('annualPaise',e.target.value)}/></label><label>Lifetime License · INR<input type="number" min="0" step="0.01" value={(pricing.lifetimePaise/100).toFixed(2)} onChange={e=>setMoney('lifetimePaise',e.target.value)}/></label></div>
        <label><input type="checkbox" checked={pricing.annualAvailable} onChange={e=>setPricing({...pricing,annualAvailable:e.target.checked})}/> Annual available</label>
        <label><input type="checkbox" checked={pricing.lifetimeAvailable} onChange={e=>setPricing({...pricing,lifetimeAvailable:e.target.checked})}/> Lifetime available</label>
        <label><input type="checkbox" checked={pricing.upgradeCreditEnabled} onChange={e=>setPricing({...pricing,upgradeCreditEnabled:e.target.checked})}/> Apply annual payment credit to lifetime upgrades</label>
        <label>Maximum credit · INR<input type="number" min="0" step="0.01" value={(pricing.maxCreditPaise/100).toFixed(2)} onChange={e=>setMoney('maxCreditPaise',e.target.value)}/></label>
        <label>Grace period · days<input type="number" min="0" max="30" value={pricing.graceDays} onChange={e=>setPricing({...pricing,graceDays:Number(e.target.value)})}/></label>
        <label>Payment/contact instructions<textarea maxLength={500} value={pricing.paymentInstructions} onChange={e=>setPricing({...pricing,paymentInstructions:e.target.value})}/></label>
        <label><input type="checkbox" checked={uiEnabled} onChange={e=>setUiEnabled(e.target.checked)}/> Show first-install pricing when public request protection is configured</label>
        <p className="license-note">Existing-client enforcement remains off. Prices require confirmed payment for activation.</p><button disabled={busy}>Save Pricing</button>
      </form>
      <div className="license-card"><h3>Invite New Client</h3><p>Creates a pending account and emails the client a secure password setup link. Assign a paid license to activate access.</p><label>Client name<input value={invite.name} maxLength={100} onChange={e=>setInvite({...invite,name:e.target.value})}/></label><label>Login email<input type="email" value={invite.email} maxLength={254} onChange={e=>setInvite({...invite,email:e.target.value})}/></label><label>Bank / CSP name<input value={invite.bankName} maxLength={120} onChange={e=>setInvite({...invite,bankName:e.target.value})}/></label><button disabled={busy||!invite.name||!invite.email||!invite.bankName} onClick={()=>void perform(async()=>{const result=await callBankSetuWorker<{tenantId:string;emailDelivered:boolean;warning?:string}>('/create-client-invite',invite);setTenantId(result.tenantId);if(!result.emailDelivered)throw new Error(result.warning||'Password setup email was not delivered.');},'Invitation sent. Confirm payment and assign a license to activate the client.')}>Send Secure Invitation</button><h3>Assign a Tenant License</h3><p>Review the existing tenant and confirm payment before assigning a plan. This does not change customer data.</p>
        <label>Verified Tenant<select value={tenantId} onChange={e=>setTenantId(e.target.value)}><option value="">Select an existing tenant</option>{tenants.map(item=><option key={item.tenantId} value={item.tenantId}>{item.bankName||item.tenantId} · {item.tenantId}</option>)}</select></label>
        <label>Plan<select value={plan} onChange={e=>setPlan(e.target.value as 'annual'|'lifetime')}><option value="annual">Annual · {rupees(pricing.annualPaise)}</option><option value="lifetime">Lifetime · {rupees(pricing.lifetimePaise)}</option></select></label>
        <button disabled={busy||!tenantId} onClick={()=>{if(window.confirm(`Confirm verified payment and assign ${plan} license to tenant ${tenantId}?`))void perform(()=>callBankSetuWorker('/license-admin-assign',{tenantId,plan,requestId:crypto.randomUUID(),paymentConfirmed:true}),'License assigned.');}}>Confirm Payment & Assign</button>
        <h3>Requests</h3>{truncated&&<p className="license-note">More than 100 records: full pagination is required before managing older requests.</p>}
        {requests.length===0?<p>No requests yet.</p>:<div className="license-request-list">{requests.map(item=><div key={item.id}><strong>{item.kind} · {item.bankName||item.tenantId||'Applicant'}</strong><span>{item.status} · {item.quotedPaise==null?'Price requires confirmation':rupees(item.quotedPaise)}</span>{item.status==='pending'&&item.kind!=='inquiry'&&<div><button disabled={busy} onClick={()=>{if(window.confirm('Confirm payment and approve this request?'))void perform(()=>callBankSetuWorker('/license-admin-decision',{requestId:item.id,action:'approve',paymentConfirmed:true}),'Request approved.');}}>Approve after payment</button><button disabled={busy} onClick={()=>void perform(()=>callBankSetuWorker('/license-admin-decision',{requestId:item.id,action:'reject'}),'Request rejected.')}>Reject</button></div>}</div>)}</div>}
      </div></div>
      <div className="license-card"><h3>Tenant Licenses</h3><div className="license-request-list">{licenses.length===0?'No licenses assigned yet.':licenses.map(item=><div key={item.tenantId}><strong>{item.tenantId}</strong><span>{item.plan} · {item.status} {item.expiresAt&&`· Expires ${new Date(item.expiresAt).toLocaleDateString()}`}</span></div>)}</div></div>
    </>:<div className="license-card"><h3>{state?.license?`${state.license.plan} License`:'Existing Tenant · Review Pending'}</h3><p>Status: {state?.view.state.replaceAll('_',' ')||'Loading…'}{state?.license?.expiresAt&&` · Expires ${new Date(state.license.expiresAt).toLocaleDateString()}`}</p><p>{state?.legacyAccess?'Your existing account stays accessible while licensing is reviewed.':pricing.paymentInstructions}</p>{state?.license?.plan==='annual'&&<div className="license-actions"><button disabled={busy} onClick={()=>void perform(()=>callBankSetuWorker('/license-request-change',{kind:'renewal',requestId:crypto.randomUUID()}),'Renewal request submitted.')}>Renew License · {rupees(pricing.annualPaise)}</button><button disabled={busy} onClick={()=>void perform(()=>callBankSetuWorker('/license-request-change',{kind:'upgrade',requestId:crypto.randomUUID()}),'Upgrade request submitted.')}>Upgrade to Lifetime</button></div>}</div>}
    {error&&<p role="alert" className="license-error">{error}</p>}{notice&&<p role="status" className="license-success">{notice}</p>}
  </section>;
}
