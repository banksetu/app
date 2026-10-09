import { createPrivateKey } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (!process.env.FIREBASE_DEPLOY_ACCOUNT) throw Error('Missing FIREBASE_SERVICE_ACCOUNT_BANKSETU_69E2F');
let account;
try { account = JSON.parse(process.env.FIREBASE_DEPLOY_ACCOUNT); } catch { throw Error('Firebase credential is not valid JSON'); }
if (account.type !== 'service_account' || account.project_id !== 'banksetu-69e2f' || !account.private_key) throw Error('Firebase credential project/type mismatch');
let key = account.private_key;
try { createPrivateKey(key); } catch {
  key = key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  try { createPrivateKey(key); } catch { throw Error('Firebase credential private key is invalid'); }
}
const path = join(process.env.RUNNER_TEMP, 'banksetu-firebase-credentials.json');
writeFileSync(path, JSON.stringify({...account,private_key:key}), {mode:0o600});
appendFileSync(process.env.GITHUB_ENV, `GOOGLE_APPLICATION_CREDENTIALS=${path}\n`);
