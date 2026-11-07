/**
 * License-free document-ribbon editing operations.
 * Work ONLY on private draft objects. No system clipboard, Microsoft APIs,
 * customer-repository reads, external upload, or printer calls.
 */
export type RibbonCase = "upper"|"lower"|"title"|"sentence";
export type RibbonObject = {
  id:string;kind:string;origin:string;label:string;x:number;y:number;
  width:number;height:number;z:number;page?:number;locked?:boolean;
  groupId?:string;value?:string;
};
export function wordCase(text:string,mode:RibbonCase):string {
  if(mode==="upper") return text.toLocaleUpperCase();
  if(mode==="lower") return text.toLocaleLowerCase();
  if(mode==="title")return text.toLocaleLowerCase().replace(/\p{L}[\p{L}\p{M}]*/gu,
    word=>word.slice(0,1).toLocaleUpperCase()+word.slice(1));
  return text.toLocaleLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu,
    (_,prefix:string,letter:string)=>prefix+letter.toLocaleUpperCase());
}
export function changeStaticTextCase<T extends RibbonObject>(parts:T[],ids:readonly string[],mode:RibbonCase):{parts:T[];changed:number}{
  const selected=new Set(ids);let changed=0;
  const next=parts.map(p=>{
    if(!selected.has(p.id)||p.kind!=="text"||p.origin!=="static"||p.locked)return p;
    const label=wordCase(p.label,mode);if(label===p.label)return p;
    changed++;return {...p,label};
  });
  return {parts:next,changed};
}
/** Dynamic field previews are never copied into a layout draft clipboard. */
export function copyRibbonObjects<T extends RibbonObject>(parts:T[],ids:readonly string[]):T[]{
  const selected=new Set(ids);
  return parts.filter(p=>selected.has(p.id)).map(p=>({
    ...p,value:(p.origin==="bank"||p.origin==="customer")?"":p.value
  }));
}
export function pasteRibbonObjects<T extends RibbonObject>(
  parts:T[],clipboard:T[],paper:{widthMm:number;heightMm:number;page:number},
  newId:()=>string,offsetMm=3
):{parts:T[];inserted:T[]}{
  if(!clipboard.length)throw new Error("Copy one or more objects before pasting.");
  if(parts.length+clipboard.length>300)throw new Error("This layout has reached the 300-object safety limit.");
  if(!Number.isFinite(offsetMm)||offsetMm<0)throw new Error("Invalid paste offset.");
  const maxZ=Math.max(0,...parts.map(p=>p.z));
  const inserted=clipboard.map((p,index)=>{
    if(p.width>paper.widthMm||p.height>paper.heightMm||p.width<=0||p.height<=0)
      throw new Error("Copied object is too large for this measured page.");
    const x=Math.max(0,Math.min(paper.widthMm-p.width,p.x+offsetMm));
    const y=Math.max(0,Math.min(paper.heightMm-p.height,p.y+offsetMm));
    return {...p,id:newId(),x,y,page:paper.page,z:maxZ+index+1,
      locked:false,groupId:undefined,value:(p.origin==="bank"||p.origin==="customer")?"":p.value};
  });
  if(new Set(inserted.map(p=>p.id)).size!==inserted.length||
     inserted.some(p=>parts.some(old=>old.id===p.id)))throw new Error("Duplicate object identity detected.");
  return {parts:[...parts,...inserted],inserted};
}
