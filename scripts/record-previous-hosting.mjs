import { appendFileSync } from 'node:fs';
let previous='previous Hosting release retained in Firebase Hosting history';
try {
  const response=await fetch('https://banksetu-app.web.app/deployment.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.ok){const data=await response.json();if(/^[a-f0-9]{40}$/.test(data.commit||'')) previous=`previous live commit: ${data.commit}`;}
} catch { /* Firebase Hosting history is still available for rollback. */ }
console.log(previous);
if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Portfolio deployment recovery\n${previous}\nRestore the previous verified Hosting release in Firebase Hosting if verification fails.\n`);
