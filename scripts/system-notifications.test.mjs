import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/platform/systemNotifications.ts','utf8').replace("import { Capacitor, registerPlugin } from '@capacitor/core';",'const Capacitor=globalThis.__platform;const registerPlugin=()=>globalThis.__android;');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const sent=[];let permissions=0,tenant='tenant-a';
globalThis.__platform={getPlatform:()=>globalThis.__device};globalThis.__device='android';
globalThis.__android={requestPermissions:async()=>{permissions++;return {granted:true};},show:async value=>{sent.push(value);},addListener:async()=>({remove:async()=>{}})};
globalThis.window=new EventTarget();globalThis.sessionStorage={getItem:()=>tenant};globalThis.localStorage={getItem:()=>null};
window.bankSetuDesktop={notify:async value=>{sent.push(value);}};
const {notifySystem}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const event={key:'sync-failure',title:'Sync needs attention',body:'Local changes remain safe.',page:'sync-backup',category:'sync'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Android permission and tenant-scoped cooldown suppress repeated native alerts without a server history',async()=>{
 notifySystem(event);notifySystem(event);await tick();assert.equal(permissions,1);assert.equal(sent.length,1);
 tenant='tenant-b';notifySystem(event);await tick();assert.equal(sent.length,2);assert.equal(sent[1].body,event.body);
});
test('Windows native notifications use the bridge; user setting disables delivery',async()=>{
 globalThis.__device='electron';tenant='tenant-c';notifySystem(event);await tick();assert.equal(sent.length,3);
 localStorage.getItem=()=> 'off';notifySystem({...event,key:'another'});await tick();assert.equal(sent.length,3);
});
test('Android background delivery uses a high-priority data message handled by the native service',()=>{
 const worker=fs.readFileSync('cloudflare/worker.js','utf8');
 const registration=fs.readFileSync('android/app/src/main/java/in/banksetu/android/BankSetuPushRegistration.java','utf8');
 const refreshWorker=fs.readFileSync('android/app/src/main/java/in/banksetu/android/BankSetuPushRefreshWorker.java','utf8');
 assert.doesNotMatch(worker,/notification:\{title:event\.title,body:event\.body\}/);
 assert.match(worker,/data:\{page:event\.page/);
 assert.match(worker,/android:\{priority:"HIGH"/);
 assert.match(worker,/category:"support",page:"support"/);
 assert.match(worker,/ttl:"604800s"/);
 assert.match(worker,/PUSH_RETENTION_MS = 30 \* 86400000/);
 assert.match(registration,/enqueueUniquePeriodicWork/);
 assert.match(registration,/7,TimeUnit\.DAYS/);
 assert.match(refreshWorker,/FirebaseMessaging\.getInstance\(\)\.getToken/);
 assert.match(refreshWorker,/refreshBlocking/);
});
test('support push cannot be bypassed and only Master exposes complete conversation deletion',()=>{
 const rules=fs.readFileSync('firestore.rules','utf8');
 const support=fs.readFileSync('src/SupportCenter.tsx','utf8');
 const registration=fs.readFileSync('src/platform/androidPush.ts','utf8');
 assert.match(rules,/supportConversations[\s\S]*?allow create: if false;[\s\S]*?match \/messages[\s\S]*?allow create: if false;/);
 assert.match(support,/support-conversation-delete/);
 assert.doesNotMatch(support,/support-media-delete/);
 assert.match(support,/isMaster&&activeConversation&&<button[^>]+support-delete-conversation/);
 assert.match(registration,/`master:\$\{uid\}`/);
});
