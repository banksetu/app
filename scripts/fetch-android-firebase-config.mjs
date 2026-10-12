import { createPrivateKey, sign } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const project = 'banksetu-69e2f';
const packageName = 'in.banksetu.android';
const account = JSON.parse(process.env.FIREBASE_DEPLOY_ACCOUNT || 'null');
if (account?.type !== 'service_account' || account.project_id !== project || !account.client_email || !account.private_key) {
  throw Error('The configured Firebase service account is unavailable or belongs to a different project.');
}
const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const claim = `${part({alg:'RS256',typ:'JWT'})}.${part({iss:account.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
const key = createPrivateKey(account.private_key.replace(/\\n/g, '\n'));
const signed = `${claim}.${sign('RSA-SHA256', Buffer.from(claim), key).toString('base64url')}`;
const oauth = await fetch('https://oauth2.googleapis.com/token', {method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signed})});
const auth = await oauth.json();
if (!oauth.ok || !auth.access_token) throw Error('Firebase service account OAuth request failed.');
async function api(path, options) {
  const response = await fetch(`https://firebase.googleapis.com/v1beta1/${path}`, { ...options, headers:{authorization:`Bearer ${auth.access_token}`,'content-type':'application/json'} });
  const value = await response.json();
  if (!response.ok) throw Error(`Firebase Management API ${response.status}: ${value.error?.message || 'unavailable'}`);
  return value;
}
let list = await api(`projects/${project}/androidApps?pageSize=100`);
let matches = (list.apps || []).filter(app => app.packageName === packageName && app.state !== 'DELETED');
if (!matches.length && process.env.BANKSETU_REGISTER_ANDROID_APP === 'true') {
  const operation = await api(`projects/${project}/androidApps`, {method:'POST',body:JSON.stringify({packageName,displayName:'Bank Setu Android'})});
  if (!operation.name?.includes('operations/')) throw Error('Firebase did not return an Android app registration operation.');
  let done = operation;
  for (let attempt = 0; !done.done && attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    done = await api(operation.name);
  }
  if (!done.done || done.error) throw Error(`Firebase Android app registration did not complete: ${done.error?.message || 'timed out'}`);
  list = await api(`projects/${project}/androidApps?pageSize=100`);
  matches = (list.apps || []).filter(app => app.packageName === packageName && app.state !== 'DELETED');
}
if (matches.length !== 1) throw Error(`Expected one Firebase Android app for ${packageName}; found ${matches.length}. Register it in Firebase Console, then retry.`);
const config = await api(`${matches[0].name}/config`);
const content = JSON.parse(Buffer.from(config.configFileContents || '', 'base64').toString('utf8'));
if (content.project_info?.project_id !== project || !content.client?.some(client => client.client_info?.android_client_info?.package_name === packageName)) {
  throw Error('Firebase Android config does not match the production project and application ID.');
}
writeFileSync('android/app/google-services.json', `${JSON.stringify(content)}\n`, {mode:0o600});
console.log('Verified Firebase Android app config for production package.');
