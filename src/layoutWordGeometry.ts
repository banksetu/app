/** Customer-free, measured layout geometry for the Windows Word-style designer. */
export type WordPart={id:string;page?:number;x:number;y:number;width:number;height:number;size?:number;locked?:boolean;groupId?:string};
export type WordPaper={widthMm:number;heightMm:number};
export type WordAction=
 | {kind:"align";direction:"left"|"right"|"center"|"top"|"bottom"|"middle"|"baseline";target:"page"|"selection"}
 | {kind:"size";dimension:"width"|"height"|"both"}
 | {kind:"distribute";axis:"horizontal"|"vertical";gapMm?:number};
const round=(n:number)=>Math.round(n*100)/100;
function select<T extends WordPart>(parts:readonly T[],ids:readonly string[]):T[]{
 const keys=new Set(ids),chosen=parts.filter(p=>keys.has(p.id));
 if(!chosen.length)throw Error("Select one or more layout objects.");
 if(chosen.some(p=>(p.page??1)!==(chosen[0].page??1)))throw Error("Select objects from only one page.");
 if(chosen.some(p=>p.locked===true))throw Error("Unlock the selected objects before changing their geometry.");
 return chosen;
}
function checkPaper(p:WordPaper){
 if(![p.widthMm,p.heightMm].every(n=>Number.isFinite(n)&&n>=50&&n<=500))throw Error("Invalid measured paper size.");
}
function bounds<T extends WordPart>(parts:readonly T[],paper:WordPaper){
 for(const p of parts)if(![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0||
   p.x<-.005||p.y<-.005||p.x+p.width>paper.widthMm+.005||p.y+p.height>paper.heightMm+.005)
   throw Error("Alignment would place "+p.id+" outside the measured page.");
}
export function wordTransform<T extends WordPart>(
 parts:readonly T[],ids:readonly string[],paper:WordPaper,action:WordAction,anchorId?:string,
):T[]{
 checkPaper(paper);
 const chosen=select(parts,ids),anchor=chosen.find(p=>p.id===anchorId)??chosen[0];
 const updates=new Map<string,Partial<T>>();
 const update=(p:T,props:Partial<T>)=>updates.set(p.id,{...updates.get(p.id),...props});
 if(action.kind==="align"){
  const a=action.target==="selection"?anchor:null;
  for(const p of chosen){
   let x=p.x,y=p.y;
   switch(action.direction){
    case "left":x=a?a.x:0;break;
    case "right":x=(a?a.x+a.width:paper.widthMm)-p.width;break;
    case "center":x=(a?a.x+a.width/2:paper.widthMm/2)-p.width/2;break;
    case "top":y=a?a.y:0;break;
    case "bottom":y=(a?a.y+a.height:paper.heightMm)-p.height;break;
    case "middle":y=(a?a.y+a.height/2:paper.heightMm/2)-p.height/2;break;
    case "baseline":
     if(!a)throw Error("Baseline alignment requires a selected reference.");
     y=a.y+((a.size??11)-(p.size??11))*25.4/96*.82;break;
   }
   update(p,{x:round(x),y:round(y)} as Partial<T>);
  }
 }else if(action.kind==="size"){
  if(chosen.length<2)throw Error("Select at least two objects for equal size.");
  for(const p of chosen)update(p,{
   ...(action.dimension!=="height"?{width:anchor.width}:{}),
   ...(action.dimension!=="width"?{height:anchor.height}:{})
  } as Partial<T>);
 }else{
  if(chosen.length<(action.gapMm===undefined?3:2))throw Error("Select more objects to distribute spacing.");
  const horizontal=action.axis==="horizontal",sorted=[...chosen].sort((a,b)=>horizontal?a.x-b.x:a.y-b.y);
  const first=horizontal?sorted[0].x:sorted[0].y;
  const last=sorted[sorted.length-1];
  const end=horizontal?last.x+last.width:last.y+last.height;
  const total=sorted.reduce((n,p)=>n+(horizontal?p.width:p.height),0);
  const gap=action.gapMm??(end-first-total)/(sorted.length-1);
  if(!Number.isFinite(gap)||gap<0||gap>500)throw Error("Selected objects overlap or gap is invalid.");
  let cursor=first;
  for(const p of sorted){
   update(p,horizontal?{x:round(cursor)} as Partial<T>:{y:round(cursor)} as Partial<T>);
   cursor+=(horizontal?p.width:p.height)+gap;
  }
 }
 const changed=parts.map(p=>updates.has(p.id)?{...p,...updates.get(p.id)}:p);
 bounds(changed.filter(p=>updates.has(p.id)),paper);
 return changed;
}
export function wordNudge<T extends WordPart>(
 parts:readonly T[],ids:readonly string[],paper:WordPaper,dx:number,dy:number,
):T[]{
 checkPaper(paper);
 const chosen=select(parts,ids);
 if(![dx,dy].every(Number.isFinite))throw Error("Invalid movement.");
 const deltaX=Math.max(Math.max(...chosen.map(p=>-p.x)),Math.min(dx,Math.min(...chosen.map(p=>paper.widthMm-p.x-p.width))));
 const deltaY=Math.max(Math.max(...chosen.map(p=>-p.y)),Math.min(dy,Math.min(...chosen.map(p=>paper.heightMm-p.y-p.height))));
 const keys=new Set(chosen.map(p=>p.id));
 const changed=parts.map(p=>keys.has(p.id)?{...p,x:round(p.x+deltaX),y:round(p.y+deltaY)}:p);
 bounds(changed.filter(p=>keys.has(p.id)),paper);
 return changed;
}
export function wordGroup<T extends WordPart>(parts:readonly T[],ids:readonly string[],groupId:string|null):T[]{
 const chosen=select(parts,ids);
 if(groupId!==null&&!/^group-[a-z0-9-]{1,64}$/i.test(groupId))throw Error("Invalid group ID.");
 const keys=new Set(chosen.map(p=>p.id));
 return parts.map(p=>keys.has(p.id)?{...p,groupId:groupId||undefined}:p);
}
export function wordGroupIds<T extends WordPart>(parts:readonly T[],part:T):string[]{
 return part.groupId?
  parts.filter(p=>p.groupId===part.groupId&&(p.page??1)===(part.page??1)).map(p=>p.id):[part.id];
}
