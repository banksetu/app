import {useEffect,useState} from "react";
import {getConnectionHealth,getLocalStatus,localModeEnabled} from "./localData";
const idle={syncing:false,pending:0,error:"",online:true};
export function useSyncStatus(){
 const [status,setStatus]=useState(idle);
 useEffect(()=>{
  let disposed=false,revision=0;
  const refresh=async()=>{
   const request=++revision;const health=getConnectionHealth();
   try{
    const local=localModeEnabled()&&sessionStorage.getItem("bankSetuWorkspaceReady")==="true"?await getLocalStatus():null;
    if(!disposed&&request===revision)setStatus({syncing:health.online&&!!local?.syncing,pending:local?.pending||0,error:health.error||local?.error||"",online:health.online});
   }catch(error){if(!disposed&&request===revision)setStatus({...idle,online:health.online,error:health.error||(error instanceof Error?error.message:String(error))});}
  };
  const changed=()=>{void refresh();};
  for(const event of ["banksetu-sync-change","banksetu-workspace-change","online","offline"])window.addEventListener(event,changed);
  changed();return()=>{disposed=true;for(const event of ["banksetu-sync-change","banksetu-workspace-change","online","offline"])window.removeEventListener(event,changed);};
 },[]);
 return status;
}
