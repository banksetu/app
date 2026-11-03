/** Defensive validation of local, tenant-scoped JSON drafts.
 * This must never mutate customer records or change published template formats.
 * Validation is intentionally tolerant of older valid drafts with optional metadata.
 */
export function validatePersistedLayoutDraft(value:unknown,mode:string,bankName:string):boolean{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const d=value as Record<string,unknown>;
  if(d.version!==1||d.mode!==mode||d.bankName!==bankName)return false;
  const width=Number(d.widthMm),height=Number(d.heightMm);
  if(![width,height].every(Number.isFinite)||width<50||height<50||width>500||height>500)return false;
  if(![d.foldMm,d.printStartMm].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=height))return false;
  if(d.pageCount!==undefined&&(!Number.isSafeInteger(d.pageCount)||Number(d.pageCount)<1||Number(d.pageCount)>10))return false;
  if(!Array.isArray(d.elements)||d.elements.length>500)return false;
  const ids=new Set<string>();
  const count=Number(d.pageCount??1);
  for(const item of d.elements){
    if(!item||typeof item!=="object"||Array.isArray(item))return false;
    const p=item as Record<string,unknown>;
    if(typeof p.id!=="string"||!p.id.trim()||p.id.length>128||ids.has(p.id))return false;
    ids.add(p.id);
    if(typeof p.label!=="string"||p.label.length>500)return false;
    if(typeof p.kind!=="string"||!["text","field","rectangle","line","photo","image","ellipse"].includes(p.kind))return false;
    if(![p.x,p.y,p.width,p.height].every(v=>typeof v==="number"&&Number.isFinite(v)))return false;
    if(Number(p.width)<=0||Number(p.height)<=0)return false;
    if(p.page!==undefined&&(!Number.isSafeInteger(p.page)||Number(p.page)<1||Number(p.page)>count))return false;
    if(p.rotation!==undefined&&(typeof p.rotation!=="number"||!Number.isFinite(p.rotation)))return false;
    if(p.fontCompression!==undefined&&(typeof p.fontCompression!=="number"||!Number.isFinite(p.fontCompression)||p.fontCompression<50||p.fontCompression>100))return false;
    if(p.letterSpacing!==undefined&&(typeof p.letterSpacing!=="number"||!Number.isFinite(p.letterSpacing)||p.letterSpacing< -5||p.letterSpacing>30))return false;
  }
  return true;
}
