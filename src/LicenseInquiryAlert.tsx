import {useCallback,useEffect,useRef,useState} from "react";
import ModalPortal from "./ModalPortal";
import {callBankSetuWorker} from "./workerApi";
import {notifySystem} from "./platform/systemNotifications";

type InquirySummary={id:string;name:string;bankName:string;requestedPlan:string;createdAt:string};
type InquiryStatus={count:number;truncated:boolean;latest:InquirySummary[];checkedAt:string};

export default function LicenseInquiryAlert({enabled,onCount,openLicense}:{enabled:boolean;onCount:(count:number)=>void;openLicense:()=>void}){
  const [status,setStatus]=useState<InquiryStatus|null>(null);
  const [visible,setVisible]=useState(false);
  const signature=useRef<string|null>(null);
  const refresh=useCallback(async()=>{
    if(!enabled)return;
    const next=await callBankSetuWorker<InquiryStatus>("/license-admin-inquiry-status",{});
    onCount(next.count);setStatus(next);
    const nextSignature=next.latest.map(item=>item.id).sort().join(",");
    if(next.count>0&&(signature.current===null||signature.current!==nextSignature)){
      const message=`${next.truncated?"At least ":""}${next.count} license inquiry request(s) are waiting for review.`;
      setVisible(true);
      notifySystem({key:`license-inquiries:${nextSignature}`,title:"New license inquiry",body:message,page:"license-management",category:"license",cooldownMs:60_000});
      window.dispatchEvent(new CustomEvent("banksetu-notification",{detail:{type:"warning",title:"New license inquiry",message}}));
    }
    signature.current=nextSignature;
  },[enabled,onCount]);
  useEffect(()=>{
    if(!enabled)return;
    const initial=window.setTimeout(()=>void refresh().catch(()=>undefined),0);
    const timer=window.setInterval(()=>void refresh().catch(()=>undefined),5*60_000);
    const focus=()=>void refresh().catch(()=>undefined);
    window.addEventListener("focus",focus);
    return()=>{window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener("focus",focus);};
  },[enabled,onCount,refresh]);
  if(!enabled||!visible||!status?.count)return null;
  return <ModalPortal><div className="license-inquiry-alert-backdrop" role="presentation"><section className="license-inquiry-alert" role="alertdialog" aria-modal="true" aria-label="Pending license inquiries">
    <button type="button" className="license-inquiry-alert-close" aria-label="Close" onClick={()=>setVisible(false)}>×</button>
    <div className="license-inquiry-alert-icon" aria-hidden="true">!</div>
    <p>LICENSE INQUIRY</p><h2>{status.truncated?"At least ":""}{status.count} request{status.count===1?"":"s"} waiting</h2>
    <ul>{status.latest.map(item=><li key={item.id}><strong>{item.name}</strong><span>{item.bankName||"Bank not supplied"} · {item.requestedPlan||"undecided"}</span></li>)}</ul>
    <div className="license-inquiry-alert-actions"><button type="button" onClick={()=>{setVisible(false);openLicense();}}>Open License Requests</button><button type="button" className="secondary" onClick={()=>setVisible(false)}>Review later</button></div>
  </section><style>{`.license-inquiry-alert-backdrop{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:18px;background:#071b2bd9;backdrop-filter:blur(7px)}.license-inquiry-alert{position:relative;width:min(560px,100%);max-height:calc(100dvh - 36px);overflow:auto;border-radius:24px;padding:30px;background:linear-gradient(145deg,#fff,#edf8ff);color:#102d43;box-shadow:0 28px 90px #0008;border:2px solid #5fc4ee;text-align:center}.license-inquiry-alert-icon{width:74px;height:74px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;background:#ef9b18;color:#fff;font-size:48px;font-weight:900;box-shadow:0 10px 28px #ef9b1855}.license-inquiry-alert p{margin:0;color:#1675a8;font-weight:900;letter-spacing:.14em}.license-inquiry-alert h2{margin:8px 0 18px;font-size:clamp(26px,5vw,38px)}.license-inquiry-alert ul{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:9px;text-align:left}.license-inquiry-alert li{display:flex;justify-content:space-between;gap:14px;padding:12px 14px;border-radius:12px;background:#fff;border:1px solid #d7eaf4}.license-inquiry-alert li span{color:#547080;text-align:right}.license-inquiry-alert-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}.license-inquiry-alert-actions button{border:0;border-radius:11px;padding:13px 18px;background:#087bb7;color:#fff;font:700 15px system-ui;cursor:pointer}.license-inquiry-alert-actions .secondary{background:#dfeaf0;color:#284b5e}.license-inquiry-alert-close{position:absolute;right:14px;top:10px;border:0;background:transparent;color:#4e6978;font-size:30px;cursor:pointer}@media(max-width:540px){.license-inquiry-alert{padding:25px 16px}.license-inquiry-alert li{display:block}.license-inquiry-alert li span{display:block;text-align:left;margin-top:3px}}`}</style></div></ModalPortal>;
}
