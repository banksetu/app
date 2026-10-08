import { useEffect, useState } from "react";
import { useSyncStatus } from "./core/useSyncStatus";

type Kind = "success" | "error" | "progress" | "warning";
type Notice = { id: number; type: Kind; title: string; message: string };
const colors: Record<Kind,string> = {success:"#10b975",error:"#ed3048",progress:"#1888ed",warning:"#d79315"};
let nextId = 0;

export default function SlideNotifications() {
  const [notices,setNotices] = useState<Notice[]>([]);
  const sync = useSyncStatus();
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as Event & {detail?:Omit<Notice,"id">}).detail;
      if (!detail?.title || !detail.message || !colors[detail.type]) return;
      const id=++nextId;
      setNotices(previous => [...previous.slice(-3),{...detail,id}]);
      setTimeout(() => setNotices(previous => previous.filter(item => item.id !== id)),6500);
    };
    window.addEventListener("banksetu-notification",receive);
    return () => window.removeEventListener("banksetu-notification",receive);
  },[]);
  useEffect(() => {
    if (!sync.error) return;
    const event = new Event("banksetu-notification") as Event & {detail:Omit<Notice,"id">};
    event.detail={type:"error",title:"Sync needs attention",message:sync.error};
    window.dispatchEvent(event);
  },[sync.error]);
  return <div className="banksetu-notices" aria-live="polite">
    {notices.map(item => <div key={item.id} role={item.type==="error"?"alert":"status"} className="banksetu-notice" style={{borderLeftColor:colors[item.type]}}>
      <span className="banksetu-notice-icon" style={{background:colors[item.type]}}>{item.type==="success"?"✓":item.type==="error"?"×":item.type==="progress"?"↑":"!"}</span>
      <div><strong>{item.title}</strong><div>{item.message}</div></div>
      <button type="button" aria-label="Dismiss notification" onClick={() => setNotices(previous => previous.filter(row => row.id !== item.id))}>×</button>
    </div>)}
    <style>{`.banksetu-notices{position:fixed;right:18px;top:80px;z-index:5000;display:grid;gap:10px;width:min(340px,calc(100vw - 24px));pointer-events:none}.banksetu-notice{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;background:#fff;color:#203342;border-left:6px solid;border-radius:10px;box-shadow:0 12px 36px #17232b3b;padding:14px;animation:banksetu-slide .26s ease-out}.banksetu-notice-icon{color:#fff;border-radius:50%;width:29px;height:29px;flex:none;display:grid;place-items:center;font-weight:900}.banksetu-notice strong{display:block;margin-bottom:3px}.banksetu-notice div div{font-size:13px;line-height:1.4}.banksetu-notice button{margin-left:auto;border:0;background:transparent;color:#576370;font-size:21px;cursor:pointer}@keyframes banksetu-slide{from{opacity:0;transform:translateX(45px)}to{opacity:1;transform:translateX(0)}}@media(max-width:600px){.banksetu-notices{right:12px;top:60px}}`}</style>
  </div>;
}
