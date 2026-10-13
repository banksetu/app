import assert from 'node:assert/strict';
import {writeFile,unlink,mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const harness='scripts/afsm-ui-harness.generated.tsx';let server,browser;
try{
 await writeFile(harness,`import React from 'react';import {createRoot} from 'react-dom/client';import FormsSendToBranch from '../src/FormsSendToBranch';createRoot(document.getElementById('root')!).render(<FormsSendToBranch bankName="State Bank of India"/>);`);
 server=await createServer({configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{
 name:'synthetic-afsm-ui',enforce:'pre',resolveId(id,importer){
  if(importer?.includes('/src/')&& /\/(?:afsm|localData|licenseAccess|pdfActions)$/.test(id))return '\0afsm-mock:'+id.split('/').at(-1);
 },load(id){
  if(id==='\0afsm-mock:localData')return `export const identity=()=>"synthetic:tenant:connection";export const recordSafeRecovery=()=>{};`;
  if(id==='\0afsm-mock:licenseAccess')return `export const requireLicensedWrite=async()=>{};`;
  if(id==='\0afsm-mock:pdfActions')return `export const saveAfsmPdf=async()=>window.saved=(window.saved||0)+1;export const printAfsmPdf=async()=>window.printed=(window.printed||0)+1;`;
  if(id==='\0afsm-mock:afsm')return `export const afsmDisplay=()=>"Not Sent";const records=Array.from({length:100},(_,i)=>({recordId:'record-'+(i+1),name:'Synthetic Customer '+(i+1),accountNo:'AC'+(i+1),uidaiNo:'123456789012'}));export const searchAfsmCustomers=async query=>records.filter(c=>query==='all'||c.accountNo===query);export const markCustomersAfsmSent=async(scope,ids,operationId,resend)=>{window.marked={scope,ids,operationId,resend};return ids.length;};`;
 },configureServer(vite){vite.middlewares.use('/__afsm_test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<html><body style="margin:12px;background:#124a83;color:white;font-family:Arial"><div id="root"></div><script type="module" src="/${harness}"></script></body></html>`);});}
 }]});await server.listen();browser=await chromium.launch();await mkdir('test-evidence',{recursive:true});
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('AFSM browser error:',e.message);});page.on('console',m=>{if(m.type()==='error')console.error(m.text());});page.on('dialog',dialog=>dialog.accept());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__afsm_test`);
  await page.locator('input').waitFor({timeout:10000}).catch(async error=>{console.error('AFSM initial page:',await page.locator('body').innerText());throw error;});
  const search=async term=>{await page.getByRole('textbox').fill(term);await page.getByRole('button',{name:'Search',exact:true}).click();};
  for(const term of ['AC1','AC50','AC40','AC100']){await search(term);await page.getByRole('button',{name:'Select / Add',exact:true}).click();}
  assert.equal(await page.getByRole('heading',{name:'Selected Customers (4)'}).count(),1);
  await search('AC50');assert(await page.getByRole('button',{name:'Select / Add',exact:true}).isDisabled());
  const names=await page.locator('.afsm-panel').nth(1).locator('.afsm-row strong').allTextContents();assert.deepEqual(names,['Synthetic Customer 1','Synthetic Customer 50','Synthetic Customer 40','Synthetic Customer 100']);
  await page.getByRole('button',{name:'Remove',exact:true}).nth(2).click();assert.equal(await page.getByRole('heading',{name:'Selected Customers (3)'}).count(),1);
  await page.getByRole('button',{name:'Generate A4 Form',exact:true}).click();await page.waitForSelector('.customer-pdf-page canvas');assert.equal(await page.evaluate(()=>window.marked),undefined);
  await page.getByRole('button',{name:'Print',exact:true}).click();await page.getByRole('button',{name:'Download / Save',exact:true}).click();assert.equal(await page.evaluate(()=>window.marked),undefined);
  await page.getByRole('button',{name:'Confirm Printed & Sent to Branch',exact:true}).click();await page.waitForFunction(()=>!!window.marked);assert.deepEqual(await page.evaluate(()=>window.marked.ids),['record-1','record-50','record-100']);
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();await search('all');
  for(let i=0;i<100;i++)await page.getByRole('button',{name:'Select / Add',exact:true}).nth(i).click();
  assert.equal(await page.getByRole('heading',{name:'Selected Customers (100)'}).count(),1);await page.getByRole('button',{name:'Generate A4 Form',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-page]').length===5);
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('123456789012')),false);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.screenshot({path:`test-evidence/afsm-${viewport.width}.png`,fullPage:true});await page.close();console.log(`AFSM ${viewport.width}px: selection order, removal, duplicate prevention, exact confirmation batch, 100 customers and five-page preview passed.`);
 }
}finally{await browser?.close();await server?.close();await unlink(harness).catch(()=>{});}
