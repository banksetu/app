import {Capacitor,registerPlugin} from '@capacitor/core';
import type {Appearance} from '../core/appearance';
const native=registerPlugin<{setAppearance(options:{mode:Appearance}):Promise<void>}>('BankSetuPrint');
export async function setNativeAppearance(mode:Appearance){
 if(Capacitor.getPlatform()==='android')await native.setAppearance({mode});
 else await (window as Window&{bankSetuDesktop?:{setAppearance?:(mode:Appearance)=>Promise<void>}}).bankSetuDesktop?.setAppearance?.(mode);
}
