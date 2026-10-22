import {writeFileSync} from 'node:fs';
const url='https://banksetu-client-api.banksetu2026.workers.dev/license-public-key';
const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
if(!response.ok)throw new Error(`License public key endpoint unavailable (${response.status}). Deploy the verified Worker first.`);
const {publicKey,issuer}=await response.json();
if(issuer!=='banksetu-69e2f'||publicKey?.kty!=='RSA'||publicKey?.e!=='AQAB'||!/^[-_A-Za-z0-9]{300,}$/.test(publicKey.n||'')||publicKey.d)throw new Error('Untrusted or invalid license public key.');
await crypto.subtle.importKey('jwk',publicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
writeFileSync('src/generated/licensePublicKey.json',JSON.stringify({kty:'RSA',n:publicKey.n,e:publicKey.e,alg:'RS256',ext:true,key_ops:['verify']})+'\n');
console.log('Pinned Worker license verification public key for this release.');
