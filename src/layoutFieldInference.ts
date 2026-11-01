/** Conservative label recognition. No customer value is read or inferred here. */
export type LayoutSource = "customer" | "bank";
export type LabelSuggestion = {
  label: string; fieldKey: string; source: LayoutSource;
  preprinted: boolean; confidence: "medium" | "high";
};
const aliases: Array<[string,LayoutSource,RegExp]> = [
  ["accountNo","customer",/^(?:a\/c|ac|account)\s*(?:no\.?|number)\s*[:=.-]*$/i],
  ["customerName","customer",/^(?:account\s*holder(?:'s)?\s*name|name\s*(?:of\s*(?:account\s*)?holder)?|customer\s*name)\s*[:=.-]*$/i],
  ["customerId","customer",/^(?:cif(?:\s*id|\s*no)?|customer\s*id)\s*[:=.-]*$/i],
  ["fullAddress","customer",/^(?:customer\s*address|name\s*and\s*address\s*of\s*account\s*holders?|address)\s*[:=.-]*$/i],
  ["accountOpeningDate","customer",/^(?:date\s*of\s*opening|account\s*opening\s*date|opening\s*date|open\s*date)\s*[:=.-]*$/i],
  ["nominee","customer",/^(?:nominee(?:\s*name)?|nomination)\s*[:=.-]*$/i],
  ["branchName","bank",/^(?:branch(?:\s*name)?)\s*[:=.-]*$/i],
  ["branchAddress","bank",/^(?:branch\s*address(?:\s*(?:&|and)\s*(?:tel|telephone)\s*no\.?)?)\s*[:=.-]*$/i],
  ["ifsc","bank",/^(?:ifsc(?:\s*code)?)\s*[:=.-]*$/i],
  ["micr","bank",/^(?:micr(?:\s*code)?)\s*[:=.-]*$/i],
  ["branchCode","bank",/^(?:branch\s*code)\s*[:=.-]*$/i],
  ["GSTIN","bank",/^(?:gstin|gst\s*in)\s*[:=.-]*$/i],
  ["accountType","customer",/^(?:account\s*type|type\s*of\s*account)\s*[:=.-]*$/i],
  ["operatingMode","customer",/^(?:operating\s*(?:mode|instructions?)|operation)\s*[:=.-]*$/i],
  ["mode","customer",/^(?:mode\s*of\s*operation)\s*[:=.-]*$/i],
];
export function suggestPassbookLabel(raw: string): LabelSuggestion | null {
  const label=String(raw||"").trim().replace(/\s+/g," ");
  if (!label || label.length>110) return null;
  for(const [fieldKey,source,pattern] of aliases) {
    if(pattern.test(label))
      return {label,fieldKey,source,preprinted:true,confidence:"high"};
  }
  // Do not classify lines containing names, account numbers or free-form data.
  return null;
}

export type AnalyzedTextPart = {
  label:string; x:number; y:number; width:number; height:number; page?:number; id?:string;
};
export type TextCollision = { firstId:string; secondId:string; page:number; intersectionMm:number; reason:string };
/** Spatial broadphase indexed by page/5mm row to avoid quadratic PDF scan work. */
export function findOverlappingPassbookText(parts:AnalyzedTextPart[], cap=150):TextCollision[] {
  const rows = new Map<string,number[]>();
  const found:TextCollision[]=[];
  const indexed = parts.slice(0,700);
  const safeCap=Number.isFinite(cap)?Math.max(0,Math.floor(cap)):150;
  if(safeCap===0)return [];
  for(let index=0;index<indexed.length;index++){
    const part=indexed[index]; if(![part.x,part.y,part.width,part.height].every(Number.isFinite) || part.width<=0 || part.height<=0)continue;
    const pg=part.page||1;
    const start=Math.floor((part.y-2)/5),end=Math.floor((part.y+Math.max(2,part.height)+2)/5);
    const candidate=new Set<number>();
    for(let row=start;row<=end && row<start+120;row++){
      const key=pg+":"+row;
      for(const other of rows.get(key)||[])candidate.add(other);
    }
    for(const otherIndex of candidate){
      const prev=indexed[otherIndex];
      if((prev.page||1)!==pg)continue;
      const overlapX=Math.min(prev.x+prev.width,part.x+part.width)-Math.max(prev.x,part.x);
      const overlapY=Math.min(prev.y+Math.max(2,prev.height),part.y+Math.max(2,part.height))-Math.max(prev.y,part.y);
      if(overlapX>1 && overlapY>0.6){
        found.push({firstId:prev.id||String(otherIndex),secondId:part.id||String(index),page:pg,intersectionMm:Math.round(overlapX*10)/10,reason:"Possible preprinted label and overprinted data; user must verify"});
        if(found.length>=safeCap)return found;
      }
    }
    for(let row=start;row<=end && row<start+120;row++){
      const key=pg+":"+row;
      if(!rows.has(key))rows.set(key,[]);
      rows.get(key)!.push(index);
    }
  }
  return found;
}
