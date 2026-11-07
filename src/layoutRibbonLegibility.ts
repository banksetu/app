/** Offline, non-destructive print legibility checks for a bank passbook layout.
 * Advisory only. Never substitutes for physical printer calibration or WCAG audit.
 * No customer values, network traffic, passwords or external services.
 */
export type LegiblePart={
 id:string;kind:string;origin?:string;label:string;size?:number;
 color?:string;background?:string;opacity?:number;quick?:boolean;dotMatrix?:boolean;
 fieldKey?:string;needsReview?:boolean;page?:number;height?:number
};
export type LegibilityFinding={id:string;page:number;severity:"warning"|"error";message:string};
function colorLuminance(hex:string){
 if(!/^#[0-9a-fA-F]{6}$/.test(hex))return null;
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
export function contrastRatio(foreground:string,background:string):number|null{
 const a=colorLuminance(foreground),b=colorLuminance(background);
 if(a===null||b===null)return null;
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
export function reviewPassbookLegibility(parts:readonly LegiblePart[],output:"quick"|"dotmatrix"):LegibilityFinding[]{
 const findings:LegibilityFinding[]=[];
 for(const p of parts){
  if(output==="quick"&&!p.quick || output==="dotmatrix"&&!p.dotMatrix)continue;
  const page=p.page||1;
  const add=(severity:"warning"|"error",message:string)=>findings.push({id:p.id,page,severity,message});
  if(p.needsReview)add("error","Unreviewed OCR or unreadable scanned text");
  if(p.kind!=="text"&&p.kind!=="field")continue;
  if(typeof p.size==="number"&&p.size<9)add("warning","Small text may be hard to read on passbook paper");
  if(typeof p.height==="number"&&p.height<4)add("warning","Text box has less than 4 mm height");
  if(p.kind==="field"&&!p.fieldKey?.trim())add("error","Unmapped dynamic field");
  // Contrast for Quick graphics only; actual Epson dot-matrix output needs real paper proof.
  if(output==="quick"&&p.color){
   const bg=p.background&&p.background!=="transparent"?p.background:"#ffffff";
   const ratio=contrastRatio(p.color,bg);
   if(ratio!==null&&ratio<4.5)add("warning","Low text/background contrast (under 4.5:1)");
  }
 }
 return findings;
}
