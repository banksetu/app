/** Pure rightward swipe gate. Vertical scrolling and accidental clicks stay safe. */
export function shouldDismissNotificationSwipe(dx:number,dy:number,width:number){
  return dx>=Math.max(76,Math.min(126,width*.27)) && Math.abs(dx)>Math.abs(dy)*1.35;
}
