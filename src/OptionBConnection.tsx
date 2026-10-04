import { sendEmailVerification } from "firebase/auth";
import { auth } from "./firebase";
import { useState } from "react";
import { callBankSetuWorker } from "./workerApi";
import { setTenantApiUrl, setTenantWorkspaceReady } from "./tenantApi";
const SERVICE_EMAIL = "bank-setu-drive-sync@banksetu-69e2f.iam.gserviceaccount.com";
export default function OptionBConnection({tenantId, disabled}: {tenantId: string; disabled: boolean}) {
  const [sheetLink,setSheetLink]=useState("");const [folderLink,setFolderLink]=useState("");const [bridgeUrl,setBridgeUrl]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const connect=async()=>{
    setBusy(true);setMessage("");
    try {
      await callBankSetuWorker("/connect-option-b",{sheetLink,folderLink,bridgeUrl});
      const config=await callBankSetuWorker<{dataApiReady:boolean;apiUrl:string;connectionId:string}>("/get-google-setup",{});
      if (!config.dataApiReady) throw new Error("Connection saved, but the upload bridge is not ready. Ask your administrator to verify it.");
      sessionStorage.setItem("bankSetuOfflineUntil", String(Date.now()+8*60*60*1000));
        sessionStorage.setItem("bankSetuConnectionMode","option-b");sessionStorage.setItem("bankSetuConnectionId",config.connectionId);sessionStorage.setItem("bankSetuBridgeUrl",config.apiUrl);
      setTenantApiUrl(config.apiUrl);setTenantWorkspaceReady(true);window.dispatchEvent(new Event("banksetu-sync-change"));setMessage("कनेक्शन तैयार है। Resource permissions और bridge binding सत्यापित हैं। पहली photo/PDF upload को Sync Now के बाद जाँचें।");
    } catch(error) {setMessage(error instanceof Error?error.message:"Connection failed.");}finally{setBusy(false);}
  };
  return <div style={{border:"1px solid #37646c",borderRadius:10,padding:16,marginTop:16}}>
    <h3 style={{color:"#eef7f7"}}>Google Sheet / Drive — Option B</h3>
    <p style={{lineHeight:1.6}}>पहली बार आपके अपने Google account में upload bridge authorize और deploy होना जरूरी है। उसके बाद app का connection दो steps में होगा। Bank Setu login email और Google resource owner email एक होने चाहिए।</p>
    <p><strong>1. Share:</strong> अपनी Sheet को Drive folder में रखें। दोनों पर नीचे वाले email को Editor access दें।</p>
    <code style={{display:"block",overflowWrap:"anywhere",color:"#8de3c8"}}>{SERVICE_EMAIL}</code>
    <p><strong>2. Connect:</strong> दोनों links और पहले से तैयार upload bridge का URL डालें, फिर Test &amp; Connect दबाएँ।</p>
    {auth.currentUser&&!auth.currentUser.emailVerified&&<p role="status">पहले login email verify करें। <button type="button" onClick={()=>{void sendEmailVerification(auth.currentUser!).then(()=>setMessage("Verification email भेज दिया। Link खोलने के बाद app में फिर login करें।")).catch(error=>setMessage(error.message));}}>Send verification email</button></p>}
    <p style={{fontSize:12}}>Bridge tenant ID: <code>{tenantId}</code></p>
    <form onSubmit={event=>{event.preventDefault();void connect();}} style={{display:"grid",gap:10}}>
      <label>Google Sheet link<input required type="url" value={sheetLink} onChange={event=>setSheetLink(event.target.value)} style={inputStyle}/></label>
      <label>Google Drive folder link<input required type="url" value={folderLink} onChange={event=>setFolderLink(event.target.value)} style={inputStyle}/></label>
      <label>Client-owned upload bridge URL<input required type="url" value={bridgeUrl} onChange={event=>setBridgeUrl(event.target.value)} style={inputStyle}/></label>
      <button disabled={disabled||busy} type="submit" style={{padding:12,borderRadius:8,border:0,background:"#63e2c4",color:"#06242a",fontWeight:700}}>{busy?"Checking permissions…":"Test & Connect"}</button>
    </form>
    {message&&<p role="status" style={{overflowWrap:"anywhere"}}>{message}</p>}
    {sessionStorage.getItem("bankSetuConnectionMode")==="option-b"&&<button type="button" onClick={()=>window.location.reload()}>Open workspace</button>}
  </div>;
}
const inputStyle={display:"block",width:"100%",padding:10,marginTop:5,borderRadius:8,border:"1px solid #37646c",background:"#0b2630",color:"#eef7f7"};
