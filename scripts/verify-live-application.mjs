const origin='https://banksetu-app.web.app';
const expected=process.env.PORTFOLIO_COMMIT||process.env.GITHUB_SHA;
if(!expected)throw Error('Missing expected application commit.');
for(let attempt=0;attempt<5;attempt++){
 try{
  const options={cache:'no-store',signal:AbortSignal.timeout(15000)};
  const [page,metadata]=await Promise.all([fetch(origin+'/app/?revision='+expected,options),fetch(origin+'/app/deployment.json?revision='+expected,options)]);
  const html=await page.text(),deployed=await metadata.json();
  const script=html.match(/src="(\/app\/assets\/[^" ]+\.js)"/);
  if(page.ok&&metadata.ok&&deployed.kind==='application'&&deployed.commit===expected&&script){const response=await fetch(origin+script[1],options);if(response.ok){console.log(`Verified hosted application ${expected} and production JavaScript bundle at /app/. Authenticated tenant workflows require a test account.`);process.exit(0);}}
 }catch{/* Retry only propagation failures. */}
 await new Promise(resolve=>setTimeout(resolve,3000));
}
throw Error('Hosted application commit/bundle verification failed.');
