import fs from 'node:fs';import assert from 'node:assert/strict';import {resolve}from'node:path';
import {createServer}from'vite';import react from'@vitejs/plugin-react';import {chromium}from'playwright';
process.chdir(resolve(import.meta.dirname,'..'));fs.mkdirSync('test-evidence',{recursive:true});
const mocks={
 './firebase':`export const auth={currentUser:{uid:new URLSearchParams(location.search).get('role')==='master_owner'?'master':'client',email:'synthetic@example.test'}};export const db={};`,
 'firebase/firestore':`window.chatMessages=[];window.chatCallbacks=[];const stamp=()=>({toDate:()=>new Date()});
 const ref=(parts)=>({path:parts.map(p=>typeof p==='object'?p.path||'':p).filter(Boolean).join('/')});export const collection=(...p)=>ref(p);export const doc=(...p)=>ref(p);export const query=(r)=>r;export const where=()=>({});export const orderBy=()=>({});export const limit=()=>({});export const serverTimestamp=stamp;
 export const getDocs=async()=>({docs:[{id:'client',data:()=>({name:'Synthetic Client',email:'client@example.test',tenantId:'tenant',role:'client_admin',status:'approved',subscriptionStatus:'active'})}]});
 const snap=(r)=>r.path.endsWith('/messages')?{docs:window.chatMessages.map((data,i)=>({id:String(i),data:()=>data}))}:r.path==='supportConversations/client'?{exists:()=>false,data:()=>({})}:{docs:[]};
 export const onSnapshot=(r,next)=>{const fn=()=>next(snap(r));window.chatCallbacks.push(fn);fn();return()=>window.chatCallbacks=window.chatCallbacks.filter(x=>x!==fn);};export const updateDoc=async()=>{};export const setDoc=async()=>{};
 export const addDoc=async(_r,data)=>{window.chatMessages.push(data);window.chatCallbacks.forEach(fn=>fn());};`,
 './workerApi':`window.mediaCalls=[];window.mediaFiles=new Map();export const callBankSetuWorker=async(route,body)=>{
 window.mediaCalls.push({route,...body});if(route==='/support-media-read')return window.mediaFiles.get(body.id);
 const id='fixture-'+window.mediaFiles.size,expires=Date.now()+86400000;window.mediaFiles.set(id,body);window.chatMessages.push({text:body.text,senderUid:new URLSearchParams(location.search).get('role')==='master_owner'?'master':'client',createdAt:{toDate:()=>new Date()},attachment:{id,kind:body.mimeType.startsWith('image/')?'photo':'audio',expiresAt:{toMillis:()=>expires}}});window.chatCallbacks.forEach(fn=>fn());return{success:true};};`,
};
fs.writeFileSync('test-evidence/support.html','<div id="root"></div><script type="module" src="/test-evidence/support.tsx"></script>');
fs.writeFileSync('test-evidence/support.tsx',`import React,{useState}from'react';import{createRoot}from'react-dom/client';import SupportCenter from'../src/SupportCenter';import FloatingSupportButton from'../src/FloatingSupportButton';import'../src/App.css';const role=new URLSearchParams(location.search).get('role')||'client_admin';sessionStorage.setItem('bankSetuAccountRole',role);sessionStorage.setItem('bankSetuTenantId','tenant');function App(){const[open,setOpen]=useState(false);return <main className="banksetu-app-shell" data-appearance="dark"><div className="banksetu-main-workspace">{open&&<SupportCenter accountRole={role}/>}<FloatingSupportButton unread={0} open={()=>setOpen(true)}/></div></main>};createRoot(document.getElementById('root')).render(<App/>);`);
const server=await createServer({configFile:false,root:process.cwd(),plugins:[{name:'support-ui-fixture',enforce:'pre',resolveId(source,importer){if(importer?.includes('/src/')&&mocks[source])return'\0support:'+source;},load(id){if(id.startsWith('\0support:'))return mocks[id.slice(9)];}},react()],server:{host:'127.0.0.1',port:5199,strictPort:true}});
let browser;
try{
 await server.listen();browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 for(const width of [390,1280])for(const role of ['master_owner','client_admin']){
  const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:5199/test-evidence/support.html?role=${role}`);await page.getByRole('button',{name:'Open Support Center',exact:true}).click();
  if(role==='master_owner')await page.locator('.support-users button').click();
  const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=40;canvas.height=40;const context=canvas.getContext('2d');context.fillStyle='#1565c0';context.fillRect(0,0,40,40);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
  await page.getByLabel('Attach support photo').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:png});
  await page.getByPlaceholder('Type your message…').fill('Keep this caption');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.waitForFunction(()=>window.mediaCalls.some(x=>x.route==='/support-media-send')||document.querySelector('.support-error'));
  assert.equal(await page.locator('.support-error').count(),0,await page.locator('.support-error').allTextContents());
  await page.getByRole('button',{name:'View photo',exact:true}).click();
  await page.locator('.support-attachment img').evaluate(img=>img.decode());
  assert.equal(await page.locator('.message p').first().innerText(),'Keep this caption');
  await page.getByRole('button',{name:'Record audio',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
  await page.waitForTimeout(200);await page.getByRole('button',{name:'Stop recording',exact:true}).click();
  await page.locator('.support-selected-file').waitFor();await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Play audio',exact:true}).click();await page.locator('audio').waitFor();
  await page.locator('audio').evaluate(async audio=>{await audio.play();audio.pause();});
  assert.equal(await page.evaluate(()=>window.mediaCalls.filter(x=>x.route==='/support-media-send').length),2);
  assert.equal(await page.evaluate(()=>window.mediaCalls.filter(x=>x.route==='/support-media-send')[1].mimeType.startsWith('audio/')),true);
  await page.getByPlaceholder('Type your message…').fill('Text stays');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Text stays',{exact:true}).waitFor();assert.equal(await page.locator('.message').count(),3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'support fits viewport');
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS: ${width}px ${role}: floating support → photo upload/view → voice record/send/play → persistent text`);
 }
}finally{await browser?.close();await server.close();for(const file of ['test-evidence/support.html','test-evidence/support.tsx'])fs.rmSync(file,{force:true});}
