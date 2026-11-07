import {Capacitor,registerPlugin} from '@capacitor/core';
import type {Appearance} from '../core/appearance';
const native=registerPlugin<{setAppearance(options:{mode:Appearance}):Promise<void>}>('BankSetuPrint');
export async function setNativeAppearance(mode:Appearance){
 const nativeMode=mode==='glass'?'dark':mode;
 if(Capacitor.getPlatform()==='android')await native.setAppearance({mode:nativeMode});
 else await (window as Window&{bankSetuDesktop?:{setAppearance?:(mode:'light'|'dark')=>Promise<void>}}).bankSetuDesktop?.setAppearance?.(nativeMode);
}
