import assert from 'node:assert/strict';
import {mkdir,unlink} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const captureOnly=process.argv.includes('--capture-only');
const harness='scripts/assam-passbook-harness.generated.tsx';
const evidence='test-evidence';
let server,browser;
try{
 await mkdir(evidence,{recursive:true});
 const {writeFile}=await import('node:fs/promises');
 await writeFile(harness,`
import React from 'react';
import {createRoot} from 'react-dom/client';
import AssamQuickPassbook from '../src/AssamQuickPassbook';
const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="130"><rect width="100" height="130" fill="#cad9db"/><circle cx="50" cy="38" r="18" fill="#536f74"/><path d="M10 130v-35q40-55 80 0v35" fill="#536f74"/></svg>');
const long=new URLSearchParams(location.search).has('long');
const customer={enrolId:'SYNTHETIC-001',accountNo:'000000123456',name:long?'SYNTHETIC CUSTOMER WITH A VERY LONG FULL NAME':'SYNTHETIC CUSTOMER',contact:'0000000000',accountOpeningDate:'2026-10-05',fullAddress:long?'TEST BUILDING, LONG SYNTHETIC ROAD, TEST MARKET\\nTEST CITY, ASSAM\\nPOST OFFICE TEST, PIN 000000':'TEST ROAD\\nTEST CITY, ASSAM 000000',address:'',postOffice:'',pinCode:'',pan:'ABCDE0000F',uidaiNo:'000000000000',photoPreview:photo,jointHolder:'SYNTHETIC JOINT HOLDER',issueDate:'2026-10-07'};
createRoot(document.getElementById('root')!).render(<div className="passbook-page"><AssamQuickPassbook customer={customer} bankInfo={{passbookBank:'Assam Gramin Bank',branchName:'TEST BRANCH',address:'PO: TEST BRANCH\\nDIST: TEST DISTRICT\\nPIN 000000',ifsc:'TEST0000001',micr:'000000001',branchCode:'0000',branchEmail:'TEST@EXAMPLE.INVALID'}} onEdit={()=>{}} /></div>);
`);
 server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error',plugins:[{name:'synthetic-assam-passbook',configureServer(vite){vite.middlewares.use('/__assam_passbook_test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script type="module" src="/scripts/assam-passbook-harness.generated.tsx"></script></body></html>');});}}]});
 await server.listen();browser=await chromium.launch();
 const url=`http://127.0.0.1:${server.httpServer.address().port}/__assam_passbook_test`;
 for(const [mode,viewport] of [['desktop',{width:1280,height:950}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.locator('.assam-quick-document').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.locator('.assam-quick-document').screenshot({path:`${evidence}/assam-${captureOnly?'before':'after'}-${mode}.png`});
  if(!captureOnly){
   const metrics=await page.evaluate(()=>{
    const boxes=selector=>Array.from(document.querySelectorAll(selector),node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
    const doc=boxes('.assam-quick-document')[0];
    return {doc,left:boxes('.assam-quick-left .assam-quick-colon'),right:boxes('.assam-quick-right .assam-quick-colon'),rows:boxes('.assam-quick-left .assam-quick-field'),photo:boxes('.assam-quick-photo')[0],logo:boxes('.assam-quick-emblem')[0],scale:getComputedStyle(document.querySelector('.assam-quick-text')).transform};
   });
   assert.equal(metrics.left.length,9);assert.equal(metrics.right.length,5);
   for(const group of [metrics.left,metrics.right])assert(group.every(box=>Math.abs(box.x-group[0].x)<.6),'colon guides must line up');
   assert(metrics.rows.every((row,i,all)=>!i||row.y>=all[i-1].bottom-.5),'left rows must not overlap');
   assert(metrics.rows.at(-1).bottom<=metrics.doc.bottom,'last row must remain on passbook');
   assert(metrics.photo.x>metrics.doc.x+metrics.doc.width*.68);
   assert(metrics.logo.y>=metrics.doc.y+metrics.doc.height*.5);
   assert(metrics.scale.startsWith('matrix(0.7,'),'text must be compressed to 70%');
   assert.deepEqual(errors,[]);
  }
  await page.close();
 }
 if(!captureOnly){
  const page=await browser.newPage({viewport:{width:1280,height:950}});await page.goto(url+'?long');await page.locator('.assam-quick-document').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.locator('.assam-quick-document').screenshot({path:`${evidence}/assam-after-long-data.png`});
  const checks=await page.evaluate(()=>{const doc=document.querySelector('.assam-quick-document').getBoundingClientRect();return Array.from(document.querySelectorAll('.assam-quick-right .assam-quick-field'),node=>{const r=node.getBoundingClientRect();return {bottom:r.bottom,right:r.right,docBottom:doc.bottom,docRight:doc.right};});});
  assert(checks.every(x=>x.bottom<=x.docBottom+1&&x.right<=x.docRight+1),'long data must fit on the passbook');
  await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
  await page.pdf({path:`${evidence}/assam-passbook-test-print.pdf`,format:'A4',printBackground:true,preferCSSPageSize:true});
  const print=await page.evaluate(()=>getComputedStyle(document.querySelector('.assam-quick-text')).transform);
  assert(print.startsWith('matrix(0.7,'),'print must retain the same compression');
  await page.close();
 }
 console.log(captureOnly?'Synthetic before screenshots generated':'Assam passbook desktop/mobile geometry, print media and A4 PDF passed');
}finally{await browser?.close();await server?.close();await unlink(harness).catch(()=>{});}
