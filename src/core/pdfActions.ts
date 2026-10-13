import { requireLicensedWrite } from './licenseAccess';
import { isAndroid, printAndroidPdf } from '../platform/android/runtime';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
const bridge=()=> (window as Window & {bankSetuDesktop?:{saveCustomerPdf?:(base64:string)=>Promise<unknown>;openCustomerPdf?:(base64:string)=>Promise<unknown>}}).bankSetuDesktop;
const base64=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read PDF.'));reader.readAsDataURL(blob);});
export async function saveAfsmPdf(blob:Blob){
 await requireLicensedWrite();
 if(isAndroid()){const file=await Filesystem.writeFile({path:'BankSetu-AFSM.pdf',data:await base64(blob),directory:Directory.Cache});await Share.share({title:'AFSM',files:[file.uri]});}
 else if(bridge()?.saveCustomerPdf)await bridge()!.saveCustomerPdf!(await base64(blob));
 else {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='BankSetu-AFSM.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
}
export async function printAfsmPdf(blob:Blob){
 await requireLicensedWrite();
 if(isAndroid())await printAndroidPdf(await base64(blob));
 else if(bridge()?.openCustomerPdf)await bridge()!.openCustomerPdf!(await base64(blob));
 else {const url=URL.createObjectURL(blob);const tab=window.open(url,'_blank');if(!tab){URL.revokeObjectURL(url);throw Error('Allow PDF popups or download the PDF to print.');}setTimeout(()=>URL.revokeObjectURL(url),300000);}
}
