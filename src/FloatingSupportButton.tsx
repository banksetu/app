import { useCallback, useEffect, useRef, useState } from 'react';
const storageKey='bankSetuSupportPositionV2';
type Position={x:number;y:number};
const margin=8;
const returnDelayMs=5000;
function safeBottom(){
  const configuredSafeBottom=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'))||0;
  return window.innerWidth<700?2:12+configuredSafeBottom;
}
function home(size=54,height=window.innerHeight):Position{
  return {x:Math.max(margin,window.innerWidth-size-(window.innerWidth<700?2:12)),y:Math.max(margin,height-size-safeBottom())};
}
function clamp(position:Position,size=54,height=window.innerHeight):Position{
  return {x:Math.max(margin,Math.min(position.x,window.innerWidth-size-margin)),y:Math.max(margin,Math.min(position.y,height-size-safeBottom()))};
}
function editingText(){
  const active=document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || active instanceof HTMLElement && active.isContentEditable;
}
export default function FloatingSupportButton({unread,open}:{unread:number;open:()=>void}){
  const [position,setPosition]=useState<Position|null>(null);
  const button=useRef<HTMLButtonElement>(null);
  const drag=useRef<{pointer:number;startX:number;startY:number;x:number;y:number;moved:boolean}|null>(null);
  const preventClick=useRef(false);
  const homeHeight=useRef(0);
  const returnTimer=useRef<number|null>(null);
  const clearReturn=useCallback(()=>{if(returnTimer.current!==null){window.clearTimeout(returnTimer.current);returnTimer.current=null;}},[]);
  const currentHomeHeight=useCallback(()=>{
    const height=window.innerHeight;
    const visualHeight=window.visualViewport?.height||height;
    const keyboardOpen=editingText()&&homeHeight.current>0&&(homeHeight.current-height>120||homeHeight.current-visualHeight>120);
    if(!keyboardOpen)homeHeight.current=height;
    return homeHeight.current||height;
  },[]);
  const snapHome=useCallback(()=>{
    clearReturn();
    setPosition(home(button.current?.offsetWidth||54,currentHomeHeight()));
  },[clearReturn,currentHomeHeight]);
  const returnHomeLater=useCallback(()=>{
    clearReturn();returnTimer.current=window.setTimeout(snapHome,returnDelayMs);
  },[clearReturn,snapHome]);
  useEffect(()=>{
    homeHeight.current=window.innerHeight;
    try{localStorage.removeItem(storageKey);}catch{/* Legacy position is optional. */}
    const frame=window.requestAnimationFrame(snapHome);
    window.addEventListener('resize',snapHome);
    window.addEventListener('orientationchange',snapHome);
    window.visualViewport?.addEventListener('resize',snapHome);
    return()=>{window.cancelAnimationFrame(frame);clearReturn();window.removeEventListener('resize',snapHome);window.removeEventListener('orientationchange',snapHome);window.visualViewport?.removeEventListener('resize',snapHome);};
  },[clearReturn,snapHome]);
  const onDown=(event:React.PointerEvent<HTMLButtonElement>)=>{
    if(event.button!==0)return;
    clearReturn();
    const rect=event.currentTarget.getBoundingClientRect();
    drag.current={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:rect.left,y:rect.top,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const active=drag.current;if(!active||active.pointer!==event.pointerId)return;
    if(Math.hypot(event.clientX-active.startX,event.clientY-active.startY)>5)active.moved=true;
    if(active.moved){event.preventDefault();setPosition(clamp({x:active.x+event.clientX-active.startX,y:active.y+event.clientY-active.startY},event.currentTarget.offsetWidth,currentHomeHeight()));}
  };
  const onUp=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const active=drag.current;if(!active||active.pointer!==event.pointerId)return;
    if(active.moved){preventClick.current=true;const next=clamp({x:active.x+event.clientX-active.startX,y:active.y+event.clientY-active.startY},event.currentTarget.offsetWidth,currentHomeHeight());setPosition(next);returnHomeLater();}
    drag.current=null;
  };
  const cancelDrag=()=>{const moved=drag.current?.moved===true;drag.current=null;if(moved)returnHomeLater();};
  return <button ref={button} type="button" className="banksetu-floating-support" style={position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined} aria-label={unread?`Open Support Center, ${unread} unread`:'Open Support Center'} title="Support Center · drag to move · returns automatically" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={cancelDrag} onClick={()=>{if(preventClick.current){preventClick.current=false;return;}open();}}><svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 13v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="12" width="4" height="7" rx="2"/><rect x="18" y="12" width="4" height="7" rx="2"/><path d="M20 19a6 6 0 0 1-6 3h-2"/><rect x="10" y="20" width="4" height="2" rx="1"/></svg>{unread>0&&<b className="banksetu-support-badge">{unread>99?'99+':unread}</b>}</button>;
}
