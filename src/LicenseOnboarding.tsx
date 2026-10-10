import { useEffect, useRef, useState } from 'react';
import './LicenseOnboarding.css';

type PublicSettings={pricing:{annualPaise:number;lifetimePaise:number;annualAvailable:boolean;lifetimeAvailable:boolean};uiEnabled:boolean;turnstileSiteKey:string};
const workerUrl=String(import.meta.env.VITE_BANKSETU_WORKER_URL||'').trim().replace(/\/+$/,'');
const price=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(paise/100);
export async function getPublicLicenseSettings():Promise<PublicSettings|null>{
  if(!workerUrl)return null;
  const response=await fetch(`${workerUrl}/license-public`,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return null;
  return response.json() as Promise<PublicSettings>;
}
export default function LicenseOnboarding({settings,onSignIn}:{settings:PublicSettings;onSignIn:()=>void}){
  const [plan,setPlan]=useState<'annual'|'lifetime'|'undecided'|null>(null);
  const [form,setForm]=useState({name:'',mobile:'',email:'',bankName:'',location:'',message:''});
  const [requestId]=useState(()=>crypto.randomUUID());
  const [token,setToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [done,setDone]=useState('');
  const widgetRef=useRef<HTMLDivElement|null>(null);
  const widgetIdRef=useRef<string|null>(null);
  useEffect(()=>{
    if(plan===null||!settings.turnstileSiteKey)return;
    let cancelled=false;let widgetId:string|undefined;
    const render=()=>{
      if(cancelled||!widgetRef.current||!(window as unknown as {turnstile?:{render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void}}).turnstile)return;
      widgetId=(window as unknown as {turnstile:{render:(element:HTMLElement,options:Record<string,unknown>)=>string}}).turnstile.render(widgetRef.current,{sitekey:settings.turnstileSiteKey,callback:(value:string)=>setToken(value),'expired-callback':()=>setToken('')});widgetIdRef.current=widgetId;
    };
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=render;document.head.appendChild(script);render();
    return()=>{cancelled=true;if(widgetId)(window as unknown as {turnstile?:{remove:(id:string)=>void}}).turnstile?.remove(widgetId);script.remove();};
  },[plan,settings.turnstileSiteKey]);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy||!plan||!token)return;setBusy(true);setError('');
    try{
      const response=await fetch(`${workerUrl}/license-inquiry`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...form,plan,requestId,turnstileToken:token}),signal:AbortSignal.timeout(20000)});
      const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Request could not be delivered.');
      setDone(result.referenceId);
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to send request.');setToken('');if(widgetIdRef.current)(window as unknown as {turnstile?:{reset:(id:string)=>void}}).turnstile?.reset(widgetIdRef.current);}
    finally{setBusy(false);}
  };
  return <main className="license-welcome"><div className="license-welcome-shell"><header><strong>BANK <span>SETU</span></strong><button onClick={onSignIn}>Already Have an Account? Sign In</button></header>
    {!plan?<><div className="license-intro"><span>Welcome to Bank Setu</span><h1>Choose Your License</h1><p>One license for your client workspace, on Windows and Android.</p></div>
      <div className="license-choices"><article><span>01 · ANNUAL</span><h2>Annual License</h2><strong>{settings.pricing.annualAvailable?price(settings.pricing.annualPaise):'Contact us'}</strong><p>One calendar year · Windows + Android included.</p><button disabled={!settings.pricing.annualAvailable} onClick={()=>setPlan('annual')}>Choose Annual</button></article><article><span>02 · LIFETIME</span><h2>Lifetime License</h2><strong>{settings.pricing.lifetimeAvailable?price(settings.pricing.lifetimePaise):'Contact us'}</strong><p>No scheduled expiry · Windows + Android included.</p><button disabled={!settings.pricing.lifetimeAvailable} onClick={()=>setPlan('lifetime')}>Choose Lifetime</button></article></div><button className="license-skip" onClick={()=>setPlan('undecided')}>Skip for Now · Contact Master Admin</button></>
    :<div className="license-contact"><button className="license-back" onClick={()=>setPlan(null)}>← Back to licenses</button><h1>Contact Master Admin</h1><p>Send your request. Activation and payment are reviewed by the Master Admin.</p>{done?<div role="status"><h2>Request received</h2><p>Reference ID: {done}</p><button onClick={onSignIn}>Sign In</button></div>:<form onSubmit={submit}>
      <label>Full Name<input required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Mobile / WhatsApp Number<input required maxLength={20} inputMode="tel" value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})}/></label><label>Email Address (optional)<input type="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Bank / CSP Center Name<input required maxLength={120} value={form.bankName} onChange={e=>setForm({...form,bankName:e.target.value})}/></label><label>Location (optional)<input maxLength={120} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label><label>Preferred License<select value={plan} onChange={e=>setPlan(e.target.value as 'annual'|'lifetime'|'undecided')}><option value="annual">Annual</option><option value="lifetime">Lifetime</option><option value="undecided">Not Decided</option></select></label><label className="wide">Message (optional)<textarea maxLength={500} value={form.message} onChange={e=>setForm({...form,message:e.target.value})}/></label><div className="wide" ref={widgetRef}/>{error&&<p className="license-form-error" role="alert">{error}</p>}<button disabled={busy||!token} className="license-submit">{busy?'Submitting…':'Submit Request'}</button>
    </form>}</div>}
  </div></main>;
}
