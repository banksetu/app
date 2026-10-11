import {readFileSync,appendFileSync} from 'node:fs';
import {createSign} from 'node:crypto';
import {pathToFileURL} from 'node:url';

/** Additive metadata migration for old apps/bridges which used the rollout flag. */
export async function enforceClientLicenses({projectId,token,fetchImpl=fetch}){
 const base=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
 const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
 let pageToken='',checked=0,updated=0;
 const tenants=new Set();
 do{
  const response=await fetchImpl(`${base}/users?pageSize=300${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`,{headers});
  if(!response.ok)throw Error(`Cannot inspect client license metadata (${response.status}).`);
  const page=await response.json();
  for(const document of page.documents||[]){
   const fields=document.fields||{},role=fields.role?.stringValue,tenantId=fields.tenantId?.stringValue;
   if(!['client_admin','client_user'].includes(role)||!tenantId)continue;
   checked++;tenants.add(tenantId);
   if(fields.licenseRequired?.booleanValue===true)continue;
   const url=`https://firestore.googleapis.com/v1/${document.name}?updateMask.fieldPaths=licenseRequired&currentDocument.updateTime=${encodeURIComponent(document.updateTime)}`;
   const patch=await fetchImpl(url,{method:'PATCH',headers,body:JSON.stringify({fields:{licenseRequired:{booleanValue:true}}})});
   if(!patch.ok)throw Error(`Client metadata changed during enforcement (${patch.status}); rerun from current state.`);
   updated++;
  }
  pageToken=page.nextPageToken||'';
 }while(pageToken);
 let bridges=0,legacyBridges=0;
 for(const tenantId of tenants){
  const response=await fetchImpl(`${base}/tenantSettings/${encodeURIComponent(tenantId)}`,{headers});
  if(response.status===404)continue;
  if(!response.ok)throw Error(`Cannot verify tenant bridge configuration (${response.status}).`);
  const fields=(await response.json()).fields||{};
  const bridge=fields.bridgeUrl?.stringValue||fields.apiUrl?.stringValue;
  if(!bridge)continue;
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(bridge))throw Error('An invalid tenant bridge URL needs review.');
  const statusResponse=await fetchImpl(`${bridge}?action=status`,{signal:AbortSignal.timeout(15000)});
  if(!statusResponse.ok)throw Error('A deployed tenant bridge cannot be verified.');
  const status=await statusResponse.json();
  if(status.tenantId!==tenantId||status.tenantIsolationVersion!=='v3'||!Number.isInteger(status.licenseEnforcementVersion)||status.licenseEnforcementVersion<1)throw Error('A tenant Apps Script lacks verified license enforcement. Deploy the bundled Code.gs before releasing.');
  bridges++;if(status.licenseEnforcementVersion===1)legacyBridges++;
 }
 return {checked,updated,bridges,legacyBridges};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const account=JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
 if(account.project_id!=='banksetu-69e2f')throw Error('Unexpected Firebase credential project.');
 const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const payload=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:account.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
 const signer=createSign('RSA-SHA256');signer.update(payload);signer.end();
 const assertion=`${payload}.${signer.sign(account.private_key,'base64url')}`;
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 const token=(await response.json()).access_token;if(!response.ok||!token)throw Error('Could not authorize client license metadata enforcement.');
 const result=await enforceClientLicenses({projectId:account.project_id,token});
 console.log(JSON.stringify(result));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\nClient license metadata: ${result.checked} checked, ${result.updated} old flags upgraded. ${result.bridges} tenant bridges verified; ${result.legacyBridges} use v1 compatibility with enforced profile flags. No customer data or queues modified.\n`);
}
