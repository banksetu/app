import {cpSync,copyFileSync,existsSync} from 'node:fs';
if(!existsSync('portfolio-dist/index.html')||!existsSync('web-app-dist/index.html'))throw Error('Build the portfolio and web application before assembling Hosting.');
cpSync('web-app-dist','portfolio-dist/app',{recursive:true});
// Legacy branding paths remain valid without changing the portfolio landing page.
for(const name of ['banksetu-logo.png','banksetu-icon.png'])if(existsSync('public/'+name))copyFileSync('public/'+name,'portfolio-dist/'+name);
console.log('Hosting: portfolio at /, authenticated application at /app/.');
