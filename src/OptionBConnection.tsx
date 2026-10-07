import "./OptionBConnection.css";
import { enrollOfflineSession } from "./core/offlineSession";
import { sendEmailVerification } from "firebase/auth";
import { auth, FIREBASE_WEB_API_KEY } from "./firebase";
import { useState } from "react";
import { callBankSetuWorker } from "./workerApi";
import { setTenantApiUrl, setTenantWorkspaceReady } from "./tenantApi";
const SERVICE_EMAIL = "bank-setu-drive-sync@banksetu-69e2f.iam.gserviceaccount.com";
export default function OptionBConnection({tenantId, disabled}: {tenantId: string; disabled: boolean}) {
  const [downloading,setDownloading]=useState(false);
  const [setupDownloaded,setSetupDownloaded]=useState(false);
  const [sheetLink,setSheetLink]=useState("");const [folderLink,setFolderLink]=useState("");const [bridgeUrl,setBridgeUrl]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const downloadSetup=async()=>{
    setMessage("");setDownloading(true);
    try {
      const sheet=sheetLink.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
      const folder=folderLink.match(/^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{20,})/);
      if(!sheet||!folder||!tenantId)throw new Error("पहले अपनी Sheet और folder के valid links डालें।");
      const response=await fetch("/client-bridge/Code.gs",{cache:"no-store"});if(!response.ok)throw new Error("Setup source is unavailable. Rebuild the app before client setup.");
      const source=await response.text();
      if(!source.includes("function syncCustomerOperation")||!source.includes("SYNC_DELETIONS_SHEET")||!source.includes("rowDeleted:true"))throw new Error("Client setup source is outdated. Refresh the app and download again.");
      const properties={BANKSETU_FIREBASE_API_KEY:FIREBASE_WEB_API_KEY,BANKSETU_CLIENT_TENANT_ID:tenantId,BANKSETU_CLIENT_SPREADSHEET_ID:sheet[1],BANKSETU_CLIENT_FOLDER_ID:folder[1]};
      const setup=`\n\n// Run this function once in your own Google account.\nfunction setupBankSetuClient() {\n  PropertiesService.getScriptProperties().setProperties(${JSON.stringify(properties)});\n  initializeClientWorkspace();\n}\n`;
      const url=URL.createObjectURL(new Blob([source,setup],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="BankSetuClientSetup.gs";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setSetupDownloaded(true);
      setMessage("Setup file तैयार है। अपनी Sheet → Extensions → Apps Script में file का पूरा text लगाएँ। setupBankSetuClient Run/authorize करें, फिर Web app deploy करें और /exec URL यहाँ रखें।");
    }catch(error){setMessage(error instanceof Error?error.message:"Setup download failed.");}finally{setDownloading(false);}
  };
  const connect=async()=>{
    setBusy(true);setMessage("");
    try {
      if(!setupDownloaded && sessionStorage.getItem("bankSetuConnectionMode")!=="option-b") {
        await downloadSetup();
        return;
      }
      await callBankSetuWorker("/connect-option-b",{sheetLink,folderLink,bridgeUrl});
      const config=await callBankSetuWorker<{dataApiReady:boolean;apiUrl:string;connectionId:string}>("/get-google-setup",{});
      if (!config.dataApiReady) throw new Error("Connection saved, but the upload bridge is not ready. Ask your administrator to verify it.");
      sessionStorage.setItem("bankSetuOfflineUntil", String(Date.now()+8*60*60*1000));
        sessionStorage.setItem("bankSetuConnectionMode","option-b");sessionStorage.setItem("bankSetuConnectionId",config.connectionId);sessionStorage.setItem("bankSetuBridgeUrl",config.apiUrl);
      setTenantApiUrl(config.apiUrl);setTenantWorkspaceReady(true);await enrollOfflineSession();window.dispatchEvent(new Event("banksetu-sync-change"));setMessage("कनेक्शन तैयार है। Resource permissions और bridge binding सत्यापित हैं। पहली photo/PDF upload को Sync Now के बाद जाँचें।");
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
      <div className="option-b-setup-download">
        <strong>पहली बार जरूरी: Client setup file</strong>
        <p>दोनों links भरने के बाद file डाउनलोड करें। इसे अपनी Google Sheet के Apps Script में लगाकर authorize करेंगे।</p>
        <button className="option-b-download-button" type="button" disabled={busy||downloading} onClick={()=>void downloadSetup()}>{downloading?"Setup file तैयार हो रही है…":"Download latest client setup"}</button>
      </div>
      {disabled&&<p role="status">Setup file अभी डाउनलोड कर सकते हैं। Test &amp; Connect चालू करने के लिए नीचे bank/branch details भरकर Save bank details करें। Workspace inactive हो तो Master से activate करवाएँ।</p>}
      <label>Client-owned upload bridge URL<input required type="url" value={bridgeUrl} onChange={event=>setBridgeUrl(event.target.value)} style={inputStyle}/></label>
      <button disabled={disabled||busy||downloading} type="submit" style={{padding:12,borderRadius:8,border:0,background:"#63e2c4",color:"#06242a",fontWeight:700}}>{busy?"Checking permissions…":"Test & Connect"}</button>
    </form>
    {message&&<p role="status" style={{overflowWrap:"anywhere"}}>{message}</p>}
    {sessionStorage.getItem("bankSetuConnectionMode")==="option-b"&&<button type="button" onClick={()=>window.location.reload()}>Open workspace</button>}
  </div>;
}
const inputStyle={display:"block",width:"100%",padding:10,marginTop:5,borderRadius:8,border:"1px solid #37646c",background:"#0b2630",color:"#eef7f7"};
