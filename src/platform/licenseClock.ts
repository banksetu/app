import {Capacitor,registerPlugin} from '@capacitor/core';

const AndroidClock=registerPlugin<{observe(options:{uid:string;time:number}):Promise<{trusted:number}>;verify(options:{uid:string;time:number}):Promise<void>}>('BankSetuLicenseClock');
export async function observeTrustedLicenseTime(uid:string,time:number){
  if(Capacitor.getPlatform()==='android')await AndroidClock.observe({uid,time});
}
export async function verifyTrustedLicenseTime(uid:string,time=Date.now()){
  if(Capacitor.getPlatform()==='android')await AndroidClock.verify({uid,time});
}
