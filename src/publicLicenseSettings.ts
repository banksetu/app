export type PublicSettings={pricing:{annualPaise:number;lifetimePaise:number;annualAvailable:boolean;lifetimeAvailable:boolean};uiEnabled:boolean;turnstileSiteKey:string};
const workerUrl=String(import.meta.env.VITE_BANKSETU_WORKER_URL||'').trim().replace(/\/+$/,'');
export async function getPublicLicenseSettings():Promise<PublicSettings|null>{
  if(!workerUrl)return null;
  const response=await fetch(`${workerUrl}/license-public`,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return null;
  return response.json() as Promise<PublicSettings>;
}
