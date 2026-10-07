let cached;
export function metricNumber(point) { const value=point?.value;return value ? Number(value.int64Value??value.doubleValue??NaN) : NaN; }
export function quotaResult(used,limit,extra={}) {return {used,limit,remaining:Number.isFinite(used)&&Number.isFinite(limit)?Math.max(0,limit-used):null,...extra};}
export function dayStart(now,zone) {
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const parts=Object.fromEntries(formatter.formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const midnight=Date.UTC(+parts.year,+parts.month-1,+parts.day);
 let instant=midnight;
 for(let i=0;i<3;i++){const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));const local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);instant=midnight-(local-instant);}
 return new Date(instant).toISOString();
}
export async function masterUsage(env,tokenProvider,firestoreRequest,decodeFields) {
 const now=Date.now(),checkedAt=new Date(now).toISOString();
 if(cached&&now-cached.time<300000)return cached.value;
 const token=await tokenProvider(env);
 const monitor=async(type,mode='gauge')=>{
  const params=new URLSearchParams({'filter':`metric.type="${type}"`,'interval.startTime':mode==='delta'?dayStart(now,'America/Los_Angeles'):new Date(now-86400000*2).toISOString(),'interval.endTime':checkedAt,'pageSize':'1000'});
  if(mode==='delta'){params.set('aggregation.alignmentPeriod','86400s');params.set('aggregation.perSeriesAligner','ALIGN_SUM');}
  const response=await fetch(`https://monitoring.googleapis.com/v3/projects/${env.FIREBASE_PROJECT_ID}/timeSeries?${params}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!response.ok)throw new Error(response.status===403?'Monitoring Viewer permission is required.':'Cloud Monitoring API is unavailable.');
  if(data.nextPageToken)throw new Error('Monitoring result exceeded one page; totals were not estimated.');
  if(!data.timeSeries?.length)throw new Error('No monitoring sample is available yet.');
  const points=data.timeSeries.flatMap(series=>mode==='delta'?series.points||[]:(series.points||[]).slice(0,1));
  const values=points.map(metricNumber);if(values.some(value=>!Number.isFinite(value)))throw new Error('Monitoring returned an invalid number.');
  return {used:mode==='limit'?Math.max(...values):values.reduce((a,b)=>a+b,0),sampledAt:points.map(p=>p.interval?.endTime).sort().at(-1)||checkedAt};
 };
 const measured=async(action)=>{try{return await action();}catch(error){return {unavailable:String(error.message||error)};}};
 const [hosting,reads,writes,cloudflare,presence]=await Promise.all([
  measured(async()=>{const [usage,limit]=await Promise.all([monitor('firebasehosting.googleapis.com/storage/total_bytes'),monitor('firebasehosting.googleapis.com/storage/limit','limit')]);return quotaResult(usage.used,limit.used,{sampledAt:usage.sampledAt,unit:'bytes',scope:'project'});}),
  measured(async()=>{const result=await monitor('firestore.googleapis.com/document/read_count','delta');return quotaResult(result.used,50000,{sampledAt:result.sampledAt,reset:'America/Los_Angeles',estimated:true});}),
  measured(async()=>{const result=await monitor('firestore.googleapis.com/document/write_count','delta');return quotaResult(result.used,20000,{sampledAt:result.sampledAt,reset:'America/Los_Angeles',estimated:true});}),
  measured(async()=>{
   if(!env.CLOUDFLARE_ANALYTICS_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)throw new Error('Cloudflare Analytics read token is not configured.');
   const start=dayStart(now,'UTC');const query='query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){workersInvocationsAdaptive(limit:1,filter:{datetime_geq:$start,datetime_leq:$end}){sum{requests}}}}}';
   const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:`Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({query,variables:{account:env.CLOUDFLARE_ACCOUNT_ID,start,end:checkedAt}}),signal:AbortSignal.timeout(10000)});
   const data=await response.json();if(!response.ok||data.errors?.length)throw new Error('Cloudflare Analytics permission/query failed.');
   const groups=data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;if(!Array.isArray(groups))throw new Error('Cloudflare returned no usable result.');
   const used=groups.reduce((sum,group)=>sum+Number(group.sum.requests),0);if(!Number.isFinite(used))throw new Error('Invalid Cloudflare metrics.');
   return quotaResult(used,100000,{sampledAt:checkedAt,reset:'UTC',estimated:true,scope:'account',plan:'Workers Free assumed; verify in console'});
  }),
  measured(async()=>{
   const result=await firestoreRequest(env,':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:{from:[{collectionId:'onlinePresence'}],where:{fieldFilter:{field:{fieldPath:'lastSeen'},op:'GREATER_THAN_OR_EQUAL',value:{stringValue:new Date(now-7*60000).toISOString()}}},limit:1000}})});
   const active=result.filter(item=>item.document).map(item=>decodeFields(item.document.fields||{})).filter(item=>item.active===true);
   return {admins:active.filter(item=>item.role==='client_admin').length,users:active.filter(item=>item.role==='client_user').length,windowMinutes:7,truncated:result.filter(item=>item.document).length>=1000,sampledAt:checkedAt};
  })
 ]);
 const value={checkedAt,hosting,firestoreReads:reads,firestoreWrites:writes,cloudflare,presence};cached={time:now,value};return value;
}
