import { useEffect, useRef, useState } from 'react';
const storageKey='bankSetuSupportPositionV2';
type Position={x:number;y:number};
const margin=8;
function clamp(position:Position,size=54):Position{
  const configuredSafeBottom=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'))||0;
  const safeBottom=Math.max(window.innerWidth<700?16:12,configuredSafeBottom);
  return {x:Math.max(margin,Math.min(position.x,window.innerWidth-size-margin)),y:Math.max(margin,Math.min(position.y,window.innerHeight-size-safeBottom))};
}
export default function FloatingSupportButton({unread,open}:{unread:number;open:()=>void}){
  const [position,setPosition]=useState<Position|null>(()=>{try{const value=JSON.parse(localStorage.getItem(storageKey)||'null');return value&&Number.isFinite(value.x)&&Number.isFinite(value.y)?value:null;}catch{return null;}});
  const button=useRef<HTMLButtonElement>(null);
  const drag=useRef<{pointer:number;startX:number;startY:number;x:number;y:number;moved:boolean}|null>(null);
  const preventClick=useRef(false);
  useEffect(()=>{
    const resize=()=>setPosition(current=>current?clamp(current,button.current?.offsetWidth||54):null);
    resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[]);
  const onDown=(event:React.PointerEvent<HTMLButtonElement>)=>{
    if(event.button!==0)return;
    const rect=event.currentTarget.getBoundingClientRect();
    drag.current={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:rect.left,y:rect.top,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const active=drag.current;if(!active||active.pointer!==event.pointerId)return;
    if(Math.hypot(event.clientX-active.startX,event.clientY-active.startY)>5)active.moved=true;
    if(active.moved){event.preventDefault();setPosition(clamp({x:active.x+event.clientX-active.startX,y:active.y+event.clientY-active.startY},event.currentTarget.offsetWidth));}
  };
  const onUp=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const active=drag.current;if(!active||active.pointer!==event.pointerId)return;
    if(active.moved){preventClick.current=true;const next=clamp({x:active.x+event.clientX-active.startX,y:active.y+event.clientY-active.startY},event.currentTarget.offsetWidth);setPosition(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Local preference is optional. */}}
    drag.current=null;
  };
  return <button ref={button} type="button" className="banksetu-floating-support" style={position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined} aria-label={unread?`Open Support Center, ${unread} unread`:'Open Support Center'} title="Support Center · drag to move" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>{drag.current=null;}} onClick={()=>{if(preventClick.current){preventClick.current=false;return;}open();}}><svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 13v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="12" width="4" height="7" rx="2"/><rect x="18" y="12" width="4" height="7" rx="2"/><path d="M20 19a6 6 0 0 1-6 3h-2"/><rect x="10" y="20" width="4" height="2" rx="1"/></svg>{unread>0&&<b className="banksetu-support-badge">{unread>99?'99+':unread}</b>}</button>;
}
