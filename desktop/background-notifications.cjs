const API_KEY='AIzaSyDjm01ZjY9sHVtMLI9J2OG7HqR-w9lVnLo';
// Main-process polling only: no hidden BrowserWindow or persistent renderer.
function createBackgroundNotifications({fetch,read,write,notify,currentVersion,onRevoked=()=>{},intervalMs=300000}){
  let session=null,timer=null,generation=0,running=false;
  try{session=read();}catch{session=null;}
  const valid=value=>value&&typeof value.uid==='string'&&value.uid.length<=128&&typeof value.refreshToken==='string'&&value.refreshToken.length<10000&&value.worker==='https://banksetu-client-api.banksetu2026.workers.dev';
  if(!valid(session))session=null;
  const persist=()=>write(session);
  const status=()=>({enabled:!!session,uid:session?.uid||null,intervalMinutes:intervalMs/60000});
  const clear=()=>{generation++;session=null;persist();if(timer)clearInterval(timer);timer=null;};
  async function poll(){
    if(!session||running)return;running=true;const active=session,epoch=generation;
    const live=()=>session===active&&generation===epoch;
    try{
      const tokenResponse=await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:active.refreshToken}).toString(),signal:AbortSignal.timeout(10000)});
      if(!live())return;
      if([400,401,403].includes(tokenResponse.status)){clear();onRevoked();return;}
      if(!tokenResponse.ok)return;
      const token=await tokenResponse.json();if(!live())return;
      if(token.user_id!==active.uid){clear();onRevoked();return;}
      active.refreshToken=token.refresh_token||active.refreshToken;
      const call=async route=>{const response=await fetch(active.worker+route,{method:'POST',headers:{authorization:`Bearer ${token.id_token}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});if([401,403].includes(response.status))throw Object.assign(Error('Access revoked'),{revoked:true});if(!response.ok)throw Error('Notification feed unavailable');return response.json();};
      const [license,requests]=await Promise.all([call('/license-me'),call('/license-my-requests')]);if(!live())return;
      if(license.license?.tenantId&&active.tenantId!==license.license.tenantId){clear();onRevoked();return;}
      const events=[];
      if(license.license)events.push({id:`license:${license.license.revision}:${license.view.state}`,title:'Bank Setu license updated',body:`License status: ${String(license.view.state).replaceAll('_',' ')}. Open Bank Setu for details.`,page:'license-management'});
      for(const item of requests.requests||[])if(['approved','rejected'].includes(item.status))events.push({id:`request:${item.id}:${item.status}`,title:`Bank Setu request ${item.status}`,body:'Open your license panel for the payment review result.',page:'license-management'});
      try{const response=await fetch('https://banksetu-app.web.app/version.json',{signal:AbortSignal.timeout(10000)});if(response.ok){const version=await response.json();const latest=version.windowsVersion;if(typeof latest==='string'&&/^\d+\.\d+\.\d+$/.test(latest)&&latest.localeCompare(currentVersion,undefined,{numeric:true})>0)events.push({id:`update:${latest}`,title:'Bank Setu update available',body:`Version ${latest} is available. Open Bank Setu to update.`,page:'dashboard'});}}catch{/* Update metadata failure does not block license notices. */}
      if(!live())return;
      const seen=new Set(active.seen||[]);
      // First opt-in establishes a baseline; historical approvals are not new alerts.
      for(const event of events){if(active.initialized&&!seen.has(event.id))notify(event);seen.add(event.id);}
      active.seen=[...seen].slice(-200);active.initialized=true;persist();
    }catch(error){if(live()&&error.revoked){clear();onRevoked();}}finally{running=false;}
  }
  const start=()=>{if(timer)clearInterval(timer);timer=session?setInterval(()=>void poll(),intervalMs):null;if(session)void poll();};
  const bind=value=>{if(!valid(value)||typeof value.tenantId!=='string'||!value.tenantId)throw Error('Invalid authenticated notification session.');generation++;session={uid:value.uid,tenantId:value.tenantId,refreshToken:value.refreshToken,worker:value.worker,seen:[],initialized:false};try{persist();}catch(error){session=null;throw error;}start();};
  start();return {status,bind,clear,poll,stop:()=>{generation++;if(timer)clearInterval(timer);timer=null;}};
}
module.exports={createBackgroundNotifications};
