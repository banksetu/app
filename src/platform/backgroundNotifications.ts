import { auth } from '../firebase';
type Bridge={backgroundStatus():Promise<{enabled:boolean;intervalMinutes:number}>;bindBackground(value:{uid:string;tenantId:string;refreshToken:string;worker:string}):Promise<{enabled:boolean}>;clearBackground():Promise<unknown>};
export const backgroundBridge=()=> (window as Window&{bankSetuDesktop?:Bridge}).bankSetuDesktop;
export async function enableBackgroundNotifications(){
  const user=auth.currentUser,tenantId=sessionStorage.getItem('bankSetuTenantId');
  const worker=String(import.meta.env.VITE_BANKSETU_WORKER_URL||'').replace(/\/+$/,'');
  if(!user||!tenantId||!worker)throw Error('Sign in to a tenant before enabling background notifications.');
  await backgroundBridge()?.bindBackground({uid:user.uid,tenantId,refreshToken:user.refreshToken,worker});
  if(auth.currentUser?.uid!==user.uid)await backgroundBridge()?.clearBackground();
}
export async function clearBackgroundNotifications(){await backgroundBridge()?.clearBackground();}
