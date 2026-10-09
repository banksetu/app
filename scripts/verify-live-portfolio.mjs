import { readFileSync } from 'node:fs';
const origin='https://banksetu-app.web.app';
const commit=process.env.PORTFOLIO_COMMIT || process.env.GITHUB_SHA;
const expected=JSON.parse(readFileSync('portfolio-dist/version.json'));
for(let attempt=0;attempt<5;attempt++){
  try {
    const options={cache:'no-store',signal:AbortSignal.timeout(15000)};
    const [home,deployment,version]=await Promise.all([fetch(`${origin}/?revision=${commit}`,options),fetch(`${origin}/deployment.json?revision=${commit}`,options),fetch(`${origin}/version.json?revision=${commit}`,options)]);
    const html=await home.text(); const deployed=await deployment.json(); const actual=await version.json();
    if(home.ok && deployment.ok && version.ok && deployed.kind==='portfolio' && deployed.commit===commit && actual.latestVersion===expected.latestVersion && actual.windowsDownloadUrl===expected.windowsDownloadUrl && actual.androidDownloadUrl===expected.androidDownloadUrl && html.includes('Bank Setu — Windows') && !/login|signup|customer-dashboard/i.test(html)){
      console.log(`Verified live portfolio ${deployed.commit}, update manifest v${actual.latestVersion}`);process.exit(0);
    }
  } catch { /* Hosting propagation may be delayed. */ }
  await new Promise(resolve=>setTimeout(resolve,3000));
}
throw Error('Live portfolio/version verification failed');
