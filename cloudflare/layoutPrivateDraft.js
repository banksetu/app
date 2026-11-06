import {layoutManifestId,validCloudSlot} from "./layoutCloudSync.js";
const KINDS=new Set(["text","field","rectangle","line","photo","image","ellipse"]);
const ORIGINS=new Set(["static","customer","bank","preprinted","dotmatrix"]);
const HEX=/^[a-f0-9]{64}$/;
const MAX_PLAIN=165*1024;
const finite=(x,min,max)=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
const str=(v,max)=>typeof v==="string"&&v.length<=max;
export function privateLayoutDraftPath(tenantId,bankKey,mode,slotId){
  return "/tenantLayoutPrivateDrafts/"+layoutManifestId(tenantId,bankKey,mode)+"--"+validCloudSlot(slotId);
}
/** Validate unfinished editable drafts without treating them as Master-approved.
 * Source PDFs, previews, customer record objects, auth tokens, or unknown
 * metadata cannot be smuggled into a private draft document.
 */
export function validatePrivateLayoutDraft(raw,bankName,mode){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Draft must be a layout object.");
  const keys=["version","mode","bankName","pageCount","widthMm","heightMm","foldMm","printStartMm","sourceArtworkStatus","elements"];
  if(Object.keys(raw).some(k=>!keys.includes(k)))throw Error("Unexpected private draft metadata.");
  if(raw.version!==1||raw.mode!==mode||raw.bankName!==bankName||
     !finite(raw.widthMm,50,500)||!finite(raw.heightMm,50,500)||
     !finite(raw.foldMm,0,raw.heightMm)||!finite(raw.printStartMm,0,raw.heightMm)||
     !Number.isSafeInteger(raw.pageCount??1)||(raw.pageCount??1)<1||(raw.pageCount??1)>10||
     (mode==="passbook"&&(raw.pageCount??1)!==1)||
     ![undefined,"clean","needsReview","reviewed"].includes(raw.sourceArtworkStatus)||
     !Array.isArray(raw.elements)||raw.elements.length>300)
     throw Error("Invalid paper dimensions, bank, mode or elements.");
  const allowed=new Set(["id","kind","origin","label","fieldKey","value","defaultValue","x","y","width","height","z","page",
    "rotation","font","size","bold","italic","underline","align","color","background","borderColor","borderWidth","letterSpacing",
    "fontCompression","lineHeight","locked","groupId","opacity","quick","dotMatrix","preprinted","needsReview","imageData"]);
  const ids=new Set();
  for(const p of raw.elements){
    if(!p||typeof p!=="object"||Array.isArray(p)||Object.keys(p).some(k=>!allowed.has(k))||
       !str(p.id,90)||!p.id||ids.has(p.id)||!KINDS.has(p.kind)||!ORIGINS.has(p.origin)||
       !str(p.label,5000)||!str(p.fieldKey,100)||!str(p.value,1000)||!str(p.defaultValue,1000)||
       !str(p.font,100)||!str(p.color,40)||!str(p.background,60)||!str(p.borderColor,40)||
       !finite(p.x,0,500)||!finite(p.y,0,500)||!finite(p.width,0.01,500)||!finite(p.height,0.01,500)||
       p.x+p.width>raw.widthMm+0.05||p.y+p.height>raw.heightMm+0.05||
       !finite(p.z,0,100000)||!finite(p.rotation,-360,360)||!finite(p.size,2,100)||
       !finite(p.borderWidth,0,30)||!finite(p.letterSpacing,0,30)||
       !finite(p.opacity,0,1)||!finite(p.fontCompression??100,50,100)||!finite(p.lineHeight??1.18,.4,4)||
       ![true,false].includes(p.quick)||![true,false].includes(p.dotMatrix)||
       ![true,false].includes(p.preprinted)||
       ![true,false].includes(p.bold)||![true,false].includes(p.italic)||
       ![true,false].includes(p.underline)||
       !["left","center","right","justify"].includes(p.align)||
       !Number.isSafeInteger(p.page??1)||(p.page??1)<1||(p.page??1)>(raw.pageCount??1)||
       (p.groupId!==undefined&&!str(p.groupId,90))||
       (p.locked!==undefined&&typeof p.locked!=="boolean")||
       (p.needsReview!==undefined&&typeof p.needsReview!=="boolean")||
       (p.imageData!==undefined&&(!str(p.imageData,120000)||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.imageData))))
      throw Error("Invalid or unsafe editable draft element.");
    ids.add(p.id);
  }
  const bytes=new TextEncoder().encode(JSON.stringify(raw)).length;
  if(bytes>MAX_PLAIN)throw Error("Private draft exceeds compact cloud quota.");
  return structuredClone(raw);
}
export function privateDraftRevision(raw,tenantId,bankKey,mode,slotId){
  if(!raw)return 0;
  if(raw.tenantId!==tenantId||raw.bankKey!==bankKey||raw.mode!==mode||raw.slotId!==slotId||
    !Number.isSafeInteger(raw.revision)||raw.revision<1||!HEX.test(raw.hash)||
    !Number.isSafeInteger(raw.size)||raw.size<1||raw.size>95*1024||
    raw.encoding!=="gzip-base64"||!str(raw.payload,132*1024))
    throw Error("Private draft belongs to another workspace or is corrupt.");
  return raw.revision;
}
