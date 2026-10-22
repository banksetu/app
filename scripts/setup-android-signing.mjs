// Run only in your trusted, authenticated Codespace. Never paste the output files into chat.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const repo = 'banksetu/app';
const run = (cmd,args,extra={}) => execFileSync(cmd,args,{stdio:['pipe','pipe','pipe'],...extra});
try {
  run('gh',['auth','status']);
  run('keytool',['-help']);
  const existing = JSON.parse(run('gh',['secret','list','--repo',repo,'--json','name']).toString());
  if (existing.some(s=>s.name.startsWith('ANDROID_KEY'))) throw Error('Android signing secrets already exist. Refusing to replace the signing identity.');
  const folder = join(homedir(),'banksetu-private-signing');
  mkdirSync(folder,{recursive:true,mode:0o700});
  const file = join(folder,'android-signing.json');
  const keystore = join(folder,'banksetu-release.p12');
  let identity;
  if (existsSync(file)) identity = JSON.parse(readFileSync(file,'utf8'));
  else {
    if (existsSync(keystore)) throw Error('An existing keystore needs recovery; refusing to overwrite it.');
    identity = {password:randomBytes(36).toString('base64url'),alias:'banksetu-release'};
    writeFileSync(file,JSON.stringify(identity),{mode:0o600,flag:'wx'});
  }
  if (!existsSync(keystore)) {
    run('keytool',['-genkeypair','-keystore',keystore,'-storetype','PKCS12','-alias',identity.alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Bank Setu','-storepass:env','BANKSETU_SIGN_PASSWORD','-keypass:env','BANKSETU_SIGN_PASSWORD'],{env:{...process.env,BANKSETU_SIGN_PASSWORD:identity.password}});
  }
  run('keytool',['-list','-keystore',keystore,'-alias',identity.alias,'-storepass:env','BANKSETU_SIGN_PASSWORD'],{env:{...process.env,BANKSETU_SIGN_PASSWORD:identity.password}});
  const secrets = {ANDROID_KEYSTORE_BASE64:readFileSync(keystore).toString('base64'),ANDROID_KEYSTORE_PASSWORD:identity.password,ANDROID_KEY_ALIAS:identity.alias,ANDROID_KEY_PASSWORD:identity.password};
  for (const [name,value] of Object.entries(secrets)) run('gh',['secret','set',name,'--repo',repo],{input:value});
  console.log('Android signing secrets saved to banksetu/app.');
  console.log(`Keep a private backup of ${folder} before deleting this Codespace. Do not commit or share its files.`);
} catch (error) {
  // Do not print child-process environment or credential-bearing stderr.
  console.error('Signing setup stopped. Verify gh authentication, repository-secret write access and Java keytool availability. Existing signing secrets are never overwritten.');
  if (error.message?.startsWith('Android signing') || error.message?.startsWith('An existing keystore')) console.error(error.message);
  process.exitCode=1;
}
