/** A UI-only lab exists solely in Vite development sessions launched in GitHub Codespaces.
 * Never treat this as a Windows/PR2 runtime or a client authorization.
 * The server-side Vite define is false in every production, Android and CI build.
 */
declare const __BANKSETU_CODESPACES_LAYOUT_PREVIEW__:boolean;
export function codespacesLayoutPreviewAvailable(){
  return import.meta.env.DEV && __BANKSETU_CODESPACES_LAYOUT_PREVIEW__===true;
}
export function previewLayoutKey(mode:"passbook"|"accountOpening",bankName:string,slotId:string){
  if(!["passbook","accountOpening"].includes(mode)||
    !/^layout-[1-6]$/.test(slotId)||!bankName||bankName.length>120)
    throw Error("Invalid isolated layout preview scope.");
  return "banksetu:codespaces:synthetic-layout-preview:v1:"+
    JSON.stringify([mode,bankName.normalize("NFKC").trim().toLowerCase(),slotId]);
}
