import {customerRepository} from "./core/customerRepository";
import {identity} from "./core/localData";
import {auth} from "./firebase";
import {listLayoutSlots,putLayoutSlot,type LayoutMode,type LocalLayoutSlot} from "./layoutLocalState.ts";
/** Identity always uses BANK SETU's verified signed-in workspace; a manual
 * caller cannot pass another tenant ID to read a different local cache.
 */
export function currentLayoutScope(){
  const scope=identity(),uid=auth.currentUser?.uid||"";
  const tenantId=sessionStorage.getItem("bankSetuTenantId")||"";
  if(!uid||!tenantId||!scope.startsWith(uid+":")||!scope.includes(":"+tenantId+":"))
    throw Error("The bank layout workspace identity is not verified.");
  return {scope,tenantId,uid};
}
export async function readLocalLayouts(bankName:string,mode:LayoutMode){
  const {scope,tenantId}=currentLayoutScope();
  return listLayoutSlots(await customerRepository.read(scope),tenantId,bankName,mode);
}
export async function saveLocalLayout(bankName:string,mode:LayoutMode,slotId:string,draft:unknown,expectedRevision?:number){
  const {scope,tenantId}=currentLayoutScope();
  let saved:LocalLayoutSlot|undefined;
  await customerRepository.transact(scope,state=>{
    saved=putLayoutSlot(state,tenantId,bankName,mode,slotId,draft,expectedRevision);
  });
  return saved!;
}
