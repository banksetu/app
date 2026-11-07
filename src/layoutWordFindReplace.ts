/** Word-style Find/Replace for editable generic labels only.
 * Never modifies dynamic fields, customer data, bank mappings or approval state.
 */
export type FindPart={kind:string;origin:string;label:string;page?:number;locked?:boolean};
export function findEditableLabels<T extends FindPart>(parts:readonly T[],term:string,page?:number):number[]{
 const search=term.trim();
 if(!search||search.length>200)return [];
 return parts.flatMap((part,i)=>part.kind==="text"&&part.origin==="static"&&
   (page===undefined||(part.page??1)===page)&&part.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())?[i]:[]);
}
export function replaceEditableLabels<T extends FindPart>(
 parts:readonly T[],term:string,replacement:string,page?:number,
):{parts:T[];changed:number}{
 const search=term.trim();
 if(!search||search.length>200||replacement.length>500)throw Error("Find or replacement length is invalid.");
 const matches=findEditableLabels(parts,search,page);
 if(matches.some(i=>parts[i].locked))throw Error("Unlock matched text objects before replacing.");
 let changed=0;
 const next=parts.map(part=>{
   if(part.kind!=="text"||part.origin!=="static"||
     (page!==undefined&&(part.page??1)!==page))return part;
   const needle=search.toLocaleLowerCase();let offset=0,out="";
   const source=part.label,lower=source.toLocaleLowerCase();
   while(true){
     const i=lower.indexOf(needle,offset);
     if(i<0)break;
     out+=source.slice(offset,i)+replacement;
     offset=i+search.length;changed++;
   }
   return offset?{...part,label:out+source.slice(offset)}:part;
 });
 return {parts:next,changed};
}
