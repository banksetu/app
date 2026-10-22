import {confirmAction} from './uiDialogs';
import { useState } from 'react';
import { markCustomersAfsmSent } from './core/afsm';
export type AfsmBatch={scope:string;ids:string[];operationId:string};
export default function AfsmConfirmation({batch,onSaved}:{batch:AfsmBatch;onSaved?:()=>void}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(''),[done,setDone]=useState(false);
 async function confirm(resend:boolean){
  if(!await confirmAction(resend?'Re-send these customers and explicitly replace their AFSM dates with today?':'Confirm that the forms for these customers were printed/prepared and sent to the branch? Previously sent dates will be preserved.'))return;
  setBusy(true);setResult('');try{const count=await markCustomersAfsmSent(batch.scope,batch.ids,batch.operationId,resend);setResult(`${count} customer(s) saved locally. Cloud sync is pending; check Sync & Backup for completion.`);setDone(true);onSaved?.();}catch(error){setResult(error instanceof Error?error.message:'Local save failed.');}finally{setBusy(false);}
 }
 return <div style={{marginTop:12}}><p>Preview, download and print cancellation do not change AFSM status. Confirm only after preparing the forms.</p><button disabled={busy||done} onClick={()=>void confirm(false)}>Confirm Printed &amp; Sent to Branch</button>{!done&&<button disabled={busy} onClick={()=>void confirm(true)}>Re-send / Update AFSM Date</button>}<p role="status">{result}</p></div>;
}
