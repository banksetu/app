import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useSyncStatus } from "./core/useSyncStatus";

type Kind = "success" | "error" | "progress" | "warning";
type Notice = { id: number; type: Kind; title: string; message: string };
const colors: Record<Kind,string> = {success:"#10b975",error:"#ed3048",progress:"#1888ed",warning:"#d79315"};
let nextId = 0;

// A notification can be dragged right by mouse, pen or touch. Left/up gestures
// never dismiss it, and the explicit close button remains available.
export function shouldDismissNotificationSwipe(dx:number,dy:number,width:number){
  return dx>=Math.max(76,Math.min(126,width*.27)) && Math.abs(dx)>Math.abs(dy)*1.35;
}
function SwipeNotice({item,onDismiss}:{item:Notice;onDismiss:(id:number)=>void}){
  const pointer=useRef<{id:number;x:number;y:number}|null>(null);
  const [dx,setDx]=useState(0);
  const reset=()=>{pointer.current=null;setDx(0);};
  const down=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0 || (event.target as HTMLElement).closest("button,a,input,select,textarea"))return;
    pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(pointer.current?.id!==event.pointerId)return;
    const x=event.clientX-pointer.current.x,y=event.clientY-pointer.current.y;
    setDx(x>10&&x>Math.abs(y)*1.3?x:0);
  };
  const end=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(pointer.current?.id!==event.pointerId)return;
    const x=event.clientX-pointer.current.x,y=event.clientY-pointer.current.y;
    const dismiss=shouldDismissNotificationSwipe(x,y,event.currentTarget.getBoundingClientRect().width);
    reset();
    if(dismiss)onDismiss(item.id);
  };
  return <div role={item.type==="error"?"alert":"status"}
      className="banksetu-notice" data-swipeable="right"
      onPointerDown={down} onPointerMove={move} onPointerUp={end}
      onPointerCancel={reset} onLostPointerCapture={reset}
      style={{borderLeftColor:colors[item.type],
        transform:dx>0?`translate3d(${dx}px,0,0)`:undefined,
        opacity:dx>0?Math.max(.36,1-dx/360):undefined,
        transition:dx>0?"none":undefined}}>
    <span className="banksetu-notice-icon" style={{background:colors[item.type]}}>{item.type==="success"?"✓":item.type==="error"?"×":item.type==="progress"?"↑":"!"}</span>
    <div><strong>{item.title}</strong><div>{item.message}</div></div>
    <button type="button" aria-label="Dismiss notification" onClick={()=>onDismiss(item.id)}>×</button>
  </div>;
}

export default function SlideNotifications() {
  const [notices,setNotices] = useState<Notice[]>([]);
  const timers=useRef(new Map<number,number>());
  const sync = useSyncStatus();
  const dismiss=(id:number)=>{
    const pending=timers.current.get(id);
    if(pending!==undefined)window.clearTimeout(pending);
    timers.current.delete(id);
    setNotices(previous=>previous.filter(item=>item.id!==id));
  };
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as Event & {detail?:Omit<Notice,"id">}).detail;
      if (!detail?.title || !detail.message || !colors[detail.type]) return;
      const id=++nextId;
      setNotices(previous => [...previous.slice(-3),{...detail,id}]);
      const timer=window.setTimeout(()=>{
        timers.current.delete(id);
        setNotices(previous=>previous.filter(item=>item.id!==id));
      },6500);
      timers.current.set(id,timer);
    };
    window.addEventListener("banksetu-notification",receive);
    return () => {
      window.removeEventListener("banksetu-notification",receive);
      for(const id of timers.current.values())window.clearTimeout(id);
      timers.current.clear();
    };
  },[]);
  useEffect(() => {
    if (!sync.error) return;
    const event = new Event("banksetu-notification") as Event & {detail:Omit<Notice,"id">};
    event.detail={type:"error",title:"Sync needs attention",message:sync.error};
    window.dispatchEvent(event);
  },[sync.error]);
  return <div className="banksetu-notices" aria-live="polite">
    {notices.map(item => <SwipeNotice key={item.id} item={item} onDismiss={dismiss}/>)}
    <style>{`.banksetu-notices{position:fixed;right:18px;top:80px;z-index:6000;display:grid;gap:10px;width:min(340px,calc(100vw - 24px));max-height:calc(100dvh - 96px);overflow-y:auto;pointer-events:none}.banksetu-notice{pointer-events:auto;touch-action:pan-y;user-select:none;cursor:grab;display:flex;align-items:flex-start;gap:12px;background:#fff;color:#203342;border-left:6px solid;border-radius:10px;box-shadow:0 12px 36px #17232b3b;padding:14px;animation:banksetu-slide .35s cubic-bezier(.18,.75,.2,1);transition:transform .28s ease,opacity .28s ease}.banksetu-notice-icon{color:#fff;border-radius:50%;width:29px;height:29px;flex:none;display:grid;place-items:center;font-weight:900}.banksetu-notice strong{display:block;margin-bottom:3px}.banksetu-notice div div{font-size:13px;line-height:1.4}.banksetu-notice button{touch-action:manipulation;cursor:pointer;margin-left:auto;border:0;background:transparent;color:#576370;font-size:21px;cursor:pointer}@keyframes banksetu-slide{from{opacity:0;transform:translateX(45px)}to{opacity:1;transform:translateX(0)}}@media(max-width:600px){.banksetu-notices{right:8px;top:max(56px,calc(env(safe-area-inset-top,0px) + 8px));width:min(292px,calc(100vw - 18px));max-height:calc(100dvh - 72px);gap:6px}.banksetu-notice{gap:8px;border-left-width:4px;border-radius:9px;padding:9px 10px;box-shadow:0 9px 25px #17232b47}.banksetu-notice-icon{width:23px;height:23px;font-size:12px}.banksetu-notice strong{margin-bottom:2px;font-size:12px;line-height:1.25}.banksetu-notice div div{font-size:11px;line-height:1.3}.banksetu-notice button{font-size:18px;line-height:1;padding:0 2px}}`}</style>
  </div>;
}
