import fs from 'node:fs';import assert from 'node:assert/strict';import {resolve}from'node:path';
import {createServer}from'vite';import react from'@vitejs/plugin-react';import {chromium}from'playwright';
process.chdir(resolve(import.meta.dirname,'..'));fs.mkdirSync('test-evidence',{recursive:true});
const mocks={
 '../firebase':`export const auth={currentUser:{uid:new URLSearchParams(location.search).get('role')==='master_owner'?'master':'client'}};`,
 './firebase':`export const auth={currentUser:{uid:new URLSearchParams(location.search).get('role')==='master_owner'?'master':'client',email:'synthetic@example.test'}};export const db={};`,
 'firebase/firestore':`window.chatMessages=[];window.chatCallbacks=[];const stamp=()=>({toDate:()=>new Date()});
 const ref=(parts)=>({path:parts.map(p=>typeof p==='object'?p.path||'':p).filter(Boolean).join('/')});export const collection=(...p)=>ref(p);export const doc=(...p)=>ref(p);export const query=(r)=>r;export const where=()=>({});export const orderBy=()=>({});export const limit=()=>({});export const serverTimestamp=stamp;
 export const getDocs=async()=>({docs:[{id:'client',data:()=>({name:'Synthetic Client',email:'client@example.test',tenantId:'tenant',role:'client_admin',status:'approved',subscriptionStatus:'active'})}]});
 const snap=(r)=>{if(r.path.endsWith('/messages'))return{docs:window.chatMessages.map((data,i)=>({id:data.id||data.attachment?.id||String(i),data:()=>data}))};if(r.path.includes('/messages/')){const target=window.chatMessages.find((data,i)=>(data.id||data.attachment?.id||String(i))===r.path.split('/').at(-1));return{exists:()=>!!target,data:()=>target};}if(r.path==='supportConversations')return{docs:window.chatMessages.length?[{id:'client',data:()=>({clientUid:'client',clientName:'Synthetic Client',tenantId:'tenant',lastMessage:'Support message'})}]:[]};return r.path==='supportConversations/client'?{exists:()=>false,data:()=>({})}:{docs:[]};};
 export const onSnapshot=(r,next)=>{const fn=()=>next(snap(r));window.chatCallbacks.push(fn);fn();return()=>window.chatCallbacks=window.chatCallbacks.filter(x=>x!==fn);};export const updateDoc=async()=>{};export const setDoc=async()=>{};
 export const addDoc=async(_r,data)=>{window.chatMessages.push(data);window.chatCallbacks.forEach(fn=>fn());};`,
 './workerApi':`window.mediaCalls=[];window.mediaFiles=new Map();export const callBankSetuWorker=async(route,body)=>{
 window.mediaCalls.push({route,...body});if(route==='/support-media-read')return window.mediaFiles.get(body.id);
 if(route==='/support-message-send'){window.chatMessages.push({id:'text-'+window.chatMessages.length,text:body.text,senderUid:new URLSearchParams(location.search).get('role')==='master_owner'?'master':'client',createdAt:{toDate:()=>new Date()}});window.chatCallbacks.forEach(fn=>fn());return{success:true};}
 if(route==='/support-conversation-delete'){window.chatMessages.splice(0);window.mediaFiles.clear();window.chatCallbacks.forEach(fn=>fn());return{success:true,deleted:true};}
 if(route==='/support-media-reply'){const target=window.chatMessages.find(x=>x.attachment?.id===body.replyToMessageId);window.chatMessages.push({id:'reply-'+window.chatMessages.length,text:body.text,senderUid:'master',createdAt:{toDate:()=>new Date()},replyTo:{messageId:body.replyToMessageId,kind:target.attachment.kind}});window.chatCallbacks.forEach(fn=>fn());return{success:true};}

 const id='fixture-'+window.chatMessages.length,expires=Date.now()+86400000;window.mediaFiles.set(id,body);window.chatMessages.push({text:body.text,senderUid:new URLSearchParams(location.search).get('role')==='master_owner'?'master':'client',createdAt:{toDate:()=>new Date()},attachment:{id,kind:body.mimeType.startsWith('image/')?'photo':'audio',expiresAt:{toMillis:()=>expires}}});window.chatCallbacks.forEach(fn=>fn());return{success:true};};`,
};
fs.writeFileSync('test-evidence/support.html','<div id="root"></div><script type="module" src="/test-evidence/support.tsx"></script>');
fs.writeFileSync('test-evidence/support.tsx',`import React,{useState}from'react';import{createRoot}from'react-dom/client';import SupportCenter from'../src/SupportCenter';import FloatingSupportButton from'../src/FloatingSupportButton';import'../src/App.css';const role=new URLSearchParams(location.search).get('role')||'client_admin';document.documentElement.dataset.appearance='dark';sessionStorage.setItem('bankSetuAccountRole',role);sessionStorage.setItem('bankSetuTenantId','tenant');function App(){const[open,setOpen]=useState(false);return <main className="banksetu-app-shell" data-appearance="dark"><div className="banksetu-main-workspace">{open&&<SupportCenter accountRole={role}/>}<FloatingSupportButton unread={0} open={()=>setOpen(true)}/></div></main>};createRoot(document.getElementById('root')).render(<App/>);`);
const server=await createServer({configFile:false,root:process.cwd(),plugins:[{name:'support-ui-fixture',enforce:'pre',resolveId(source,importer){const key=source.startsWith('../')?'./'+source.slice(3):source;if(importer?.includes('/src/')&&mocks[key])return'\0support:'+key;},load(id){if(id.startsWith('\0support:'))return mocks[id.slice(9)];}},react()],server:{host:'127.0.0.1',port:5199,strictPort:true}});
let browser;
try{
 await server.listen();browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 for(const width of [390,1280])for(const role of ['master_owner','client_admin']){
  const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:5199/test-evidence/support.html?role=${role}`);await page.getByRole('button',{name:'Open Support Center',exact:true}).click();
  await page.getByRole('button',{name:'Private Chat',exact:true}).first().click();
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
  await page.getByLabel('Photo options',{exact:true}).click();await page.getByRole('button',{name:'Reply',exact:true}).click();
  await page.locator('.support-reply-draft').waitFor();await page.getByPlaceholder('Type your message…').fill('Please check the photo');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Please check the photo',{exact:true}).waitFor();assert.equal(await page.locator('.message .support-reply-reference').count(),1);
  assert.equal(await page.getByRole('button',{name:/Delete photo|Delete audio/}).count(),0,'individual message deletion is unavailable');
  if(role==='master_owner'){
   await page.getByRole('button',{name:'Delete Full Chat',exact:true}).click();const confirmation=page.getByRole('dialog',{name:'Delete complete support chat',exact:true});await confirmation.waitFor();
   assert.equal(await confirmation.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(23, 35, 56)');await confirmation.getByRole('button',{name:'Confirm',exact:true}).click();
   await page.waitForFunction(()=>window.chatMessages.length===0);assert.equal(await page.evaluate(()=>window.mediaFiles.size),0);
  }else assert.equal(await page.getByRole('button',{name:'Delete Full Chat',exact:true}).count(),0,'client cannot delete a conversation');

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'support fits viewport');
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS: ${width}px ${role}: support home → private chat → photo/audio → reply → Master-only full deletion`);
 }
}finally{await browser?.close();await server.close();for(const file of ['test-evidence/support.html','test-evidence/support.tsx'])fs.rmSync(file,{force:true});}
