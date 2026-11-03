import {validatePersistedLayoutDraft} from "./layoutDraftValidation";
/** A strict outgoing whitelist prevents uploading local OCR/customer text
 * values, image scans, credentials or arbitrary custom metadata. Server's
 * independent sanitizeLayoutTemplate is the mandatory second validation.
 */
export function makeGenericLayoutUpload(draft:Record<string,unknown>):Record<string,unknown>{
  const bankName=String(draft.bankName||""),mode=String(draft.mode||"");
  if(!validatePersistedLayoutDraft(draft,mode,bankName))
    throw Error("The local layout contains invalid physical measurements.");
  if(draft.sourceArtworkStatus==="needsReview")
    throw Error("Review unsupported scanned graphics before syncing a generic template.");
  const validOrigins=new Set(["static","customer","bank","preprinted","dotmatrix"]);
  const fields=["id","kind","page","origin","label","fieldKey","x","y","width",
    "height","z","rotation","size","align","letterSpacing","fontCompression",
    "opacity","borderWidth","bold","italic","underline","font","color",
    "background","borderColor","quick","dotMatrix","preprinted","needsReview"];
  const elements=(draft.elements as Record<string,unknown>[]).map(item=>{
    const safe:Record<string,unknown>={};
    for(const key of fields)if(item[key]!==undefined)safe[key]=item[key];
    if(!validOrigins.has(String(item.origin)))throw Error("Unsupported layout text source.");
    const label=String(item.label||"");
    if(/\b[A-Z]{5}\d{4}[A-Z]\b|\b\d[\d -]{9,19}\d\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(label))
      throw Error("A scanned personal identifier must be removed from reusable layout labels.");
    // Only generic account type/mode defaults are permitted. Never send a
    // customer's name, real account value or photo as cloud design contents.
    safe.defaultValue=["accountType","mode","operatingMode"].includes(String(item.fieldKey))&&
      /^(saving|savings|current|self|singly|jointly)$/i.test(String(item.defaultValue||""))
      ?String(item.defaultValue):"";
    safe.value="";
    return safe;
  });
  return {version:1,bankName,mode,pageCount:draft.pageCount||1,
    widthMm:draft.widthMm,heightMm:draft.heightMm,foldMm:draft.foldMm,
    printStartMm:draft.printStartMm,elements};
}
