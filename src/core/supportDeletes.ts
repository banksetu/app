import {auth} from '../firebase';
import {callBankSetuWorker} from '../workerApi';
export type PendingSupportDelete={clientUid:string;messageId:string};
const valid=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(value);
const key=(uid:string,tenant:string)=>`bankSetuSupportDeletes:${encodeURIComponent(uid)}:${encodeURIComponent(tenant)}`;
const flights=new Map<string,Promise<void>>();
export function pendingSupportDeletes(uid:string,tenant:string):PendingSupportDelete[]{
 try{const value=JSON.parse(localStorage.getItem(key(uid,tenant))||'[]');return Array.isArray(value)?value.filter(item=>valid(item?.clientUid)&&valid(item?.messageId)).slice(0,50):[];}catch{return [];}
}
function save(uid:string,tenant:string,items:PendingSupportDelete[]){localStorage.setItem(key(uid,tenant),JSON.stringify(items));window.dispatchEvent(new Event('banksetu-support-deletes'));}
export function queueSupportDelete(uid:string,tenant:string,item:PendingSupportDelete){
 if(!uid||auth.currentUser?.uid!==uid||!valid(item.clientUid)||!valid(item.messageId))throw Error('Support session changed.');
 const items=pendingSupportDeletes(uid,tenant);if(items.some(old=>old.clientUid===item.clientUid&&old.messageId===item.messageId))return;
 if(items.length>=50)throw Error('Finish pending support deletions before adding more.');save(uid,tenant,[...items,item]);
}
export function flushSupportDeletes(uid:string,tenant:string):Promise<void>{
 const scope=key(uid,tenant),existing=flights.get(scope);if(existing)return existing;
 const run=(async()=>{
  for(let count=0;count<50;count++){
   const item=pendingSupportDeletes(uid,tenant)[0];if(!item)return;
   if(auth.currentUser?.uid!==uid||navigator.onLine===false)return;
   await callBankSetuWorker('/support-media-delete',item);
   const current=pendingSupportDeletes(uid,tenant);save(uid,tenant,current.filter(old=>old.clientUid!==item.clientUid||old.messageId!==item.messageId));
  }
 })().finally(()=>flights.delete(scope));flights.set(scope,run);return run;
}
export function startSupportDeleteQueue(uid:string,tenant:string){
 const resume=()=>{if(uid)void flushSupportDeletes(uid,tenant).catch(()=>undefined);};
 window.addEventListener('online',resume);resume();return()=>window.removeEventListener('online',resume);
}
