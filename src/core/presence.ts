import {auth} from "../firebase";
import {callBankSetuWorker} from '../workerApi';
export function startPresence(){
 const heartbeat=()=>{const uid=auth.currentUser?.uid;if(!uid||!navigator.onLine||document.visibilityState!=='visible')return;const key=`banksetu-presence:${uid}`;let last=0;try{last=Number(localStorage.getItem(key)||0);}catch{/* storage may be restricted */}if(Date.now()-last<5*60000)return;void callBankSetuWorker('/presence-heartbeat',{active:true}).then(()=>{try{localStorage.setItem(key,String(Date.now()));}catch{/* heartbeat is best effort */}}).catch(()=>undefined);};
 heartbeat();const timer=setInterval(heartbeat,5*60000);
 window.addEventListener('online',heartbeat);document.addEventListener('visibilitychange',heartbeat);
 return()=>{clearInterval(timer);window.removeEventListener('online',heartbeat);document.removeEventListener('visibilitychange',heartbeat);};
}
