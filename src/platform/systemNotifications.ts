import { Capacitor, registerPlugin } from '@capacitor/core';

type Category = 'update'|'sync'|'network'|'license'|'support';
export type SystemNotice = { key:string; title:string; body:string; page:'dashboard'|'sync-backup'|'license-management'|'support'; category:Category; cooldownMs?:number };
const android = registerPlugin<{ requestPermissions():Promise<{granted:boolean}>; show(options:{id:number;title:string;body:string;page:string;category:Category}):Promise<void>; getPendingTap():Promise<{page?:string}>; addListener(name:'notificationOpened',listener:(event:{page:string})=>void):Promise<{remove():Promise<void>}> }>('BankSetuNotifications');
const timestamps=new Map<string,number>();
let nextId=1;
let androidPermission:boolean|undefined;
const destinations=new Set(['dashboard','sync-backup','license-management','support']);
export function notifySystem(event:SystemNotice){
  if(typeof window==='undefined')return;
  try{if(localStorage.getItem('bankSetuSystemNotifications')==='off')return;}catch{ /* Optional local setting. */ }
  const scope=sessionStorage.getItem('bankSetuTenantId')||sessionStorage.getItem('bankSetuAccountRole')||'signed-out';
  const key=`${scope}:${event.key}`;
  const now=Date.now();if(now-(timestamps.get(key)||0)<(event.cooldownMs??30*60_000))return;
  timestamps.set(key,now);
  if(timestamps.size>100){for(const [old,at] of timestamps)if(now-at>24*60*60_000)timestamps.delete(old);if(timestamps.size>100)timestamps.delete(timestamps.keys().next().value!);}
  if(Capacitor.getPlatform()==='android'){
    if(androidPermission===false)return;
    void (androidPermission===true?Promise.resolve({granted:true}):android.requestPermissions()).then(value=>{androidPermission=value.granted;if(value.granted)return android.show({id:nextId++%100000,title:event.title,body:event.body,page:event.page,category:event.category});}).catch(()=>undefined);
  }else{
    const desktop=(window as Window & {bankSetuDesktop?:{notify:(value:SystemNotice)=>Promise<void>}}).bankSetuDesktop;
    void desktop?.notify(event).catch(()=>undefined);
  }
}
export function startNotificationNavigation(){
  const open=(page:string)=>{if(destinations.has(page)){sessionStorage.setItem('bankSetuPendingNotificationPage',page);window.dispatchEvent(new CustomEvent('banksetu-open-page',{detail:{page}}));}};
  const desktop=(window as Window & {bankSetuDesktop?:{onNotificationOpen?:(callback:(page:string)=>void)=>()=>void}}).bankSetuDesktop;
  const stop=desktop?.onNotificationOpen?.(open);
  let listener:{remove():Promise<void>}|undefined;
  if(Capacitor.getPlatform()==='android'){
    void android.addListener('notificationOpened',event=>open(event.page)).then(value=>{listener=value;}).catch(()=>undefined);
    void android.getPendingTap().then(event=>{if(event.page)open(event.page);}).catch(()=>undefined);
  }
  return ()=>{stop?.();void listener?.remove();};
}
