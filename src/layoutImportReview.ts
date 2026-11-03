/** Deterministic import clean-up for mixed raster/digital PDF pages.
 * Never infer customer values or silently decide whether paper is preprinted.
 * Only discard an OCR guess when the same text and nearly identical bounds
 * are already provided by the original PDF text layer.
 */
export type ReviewableImportedPart={
  id:string;kind:string;label:string;page?:number;needsReview?:boolean;
  x:number;y:number;width:number;height:number;
};
const canonical=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en");
export function reconcileImportedText<T extends ReviewableImportedPart>(
  items:T[],
):{elements:T[];duplicateOcrCount:number}{
  const digital=items.filter(p=>p.kind==="text"&&!p.needsReview&&p.label.trim());
  let duplicateOcrCount=0;
  const elements=items.filter(p=>{
    if(p.kind!=="text"||p.needsReview!==true||!p.label.trim())return true;
    if(![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0)return true;
    const matches=digital.some(q=>{
      if((p.page??1)!==(q.page??1)||canonical(p.label)!==canonical(q.label))return false;
      if(![q.x,q.y,q.width,q.height].every(Number.isFinite)||q.width<=0||q.height<=0)return false;
      const w=Math.min(p.x+p.width,q.x+q.width)-Math.max(p.x,q.x);
      const h=Math.min(p.y+p.height,q.y+q.height)-Math.max(p.y,q.y);
      return w>0&&h>0&&w*h/Math.min(p.width*p.height,q.width*q.height)>.65;
    });
    if(matches)duplicateOcrCount++;
    return !matches;
  });
  return {elements,duplicateOcrCount};
}

/** Only the import's text layer is eligible for overlap proposals.
 * PDF vector frames, photos, bank logos and ellipse shapes are never labels.
 */
export function textForOverlapReview<T extends ReviewableImportedPart>(items:T[]):T[]{
  return items.filter(item=>(item.kind==="text"||item.kind==="field")&&
    item.label.trim().length>0&&
    [item.x,item.y,item.width,item.height].every(Number.isFinite)&&
    item.width>0&&item.height>0);
}
