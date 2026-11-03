/** Non-destructive audit of a draft bank layout.
 * Passing this audit does not substitute for original PDF comparison or
 * physical Epson PLQ / PR2 printing acceptance.
 */
export type AuditItem={severity:"error"|"warning";message:string;elementId?:string};
type AuditPart={
  id:string;kind:string;origin:string;fieldKey:string;label:string;imageData?:string;
  page?:number;x:number;y:number;width:number;height:number;
  dotMatrix:boolean;preprinted:boolean;quick:boolean;needsReview?:boolean;
  letterSpacing?:number;fontCompression?:number;
};
type AuditDraft={
  mode:string;bankName:string;widthMm:number;heightMm:number;
  foldMm:number;printStartMm:number;pageCount?:number;sourceArtworkStatus?:"clean"|"needsReview"|"reviewed";elements:AuditPart[];
};
export function auditPassbookTemplate(draft:AuditDraft):AuditItem[]{
  const issues:AuditItem[]=[];
  const error=(message:string,elementId?:string)=>issues.push({severity:"error",message,elementId});
  const warning=(message:string,elementId?:string)=>issues.push({severity:"warning",message,elementId});
  if(!draft.bankName?.trim())error("Select the bank in Bank Information.");
  if(draft.sourceArtworkStatus==="needsReview")error("PDF raster or complex artwork requires manual recreation and explicit review.");
  if(!["passbook","accountOpening"].includes(draft.mode))error("Unknown layout mode.");
  if(!Number.isFinite(draft.widthMm)||!Number.isFinite(draft.heightMm)||draft.widthMm<50||draft.heightMm<50||draft.widthMm>500||draft.heightMm>500)error("Enter valid physical page width and height.");
  if(!Number.isFinite(draft.foldMm)||!Number.isFinite(draft.printStartMm)||draft.foldMm<0||draft.foldMm>draft.heightMm||draft.printStartMm<0||draft.printStartMm>draft.heightMm)error("Fold line and print-start must be within page bounds.");
  if(draft.mode==="passbook"&&draft.foldMm>0&&draft.printStartMm<draft.foldMm)warning("Print start precedes the fold line; verify physical passbook fold.");
  const pageCount=draft.pageCount??1;
  if(!Number.isSafeInteger(pageCount)||pageCount<1||pageCount>10)error("The layout must have between one and ten valid pages.");
  if(!draft.elements.length)error("The editor has no elements.");
  if(draft.elements.length>300)error("Layout exceeds the 300-element review limit.");
  const ids=new Set<string>();
  let printable=0;
  for(const item of draft.elements.slice(0,500)){
    if(!item.id?.trim())error("Each element needs a valid unique ID.",item.id);
    if(item.needsReview===true)error("Unreadable scan/OCR line needs manual correction and review.",item.id);
    if(item.fontCompression!==undefined&&(!Number.isFinite(item.fontCompression)||item.fontCompression<50||item.fontCompression>100))error("Font compression must be between 50% and 100%.",item.id);
    if(item.letterSpacing!==undefined&&(!Number.isFinite(item.letterSpacing)||item.letterSpacing< -5||item.letterSpacing>30))error("Invalid letter spacing in saved layout.",item.id);
    if(ids.has(item.id))error("Duplicate element ID detected.",item.id);
    ids.add(item.id);
    if(![item.x,item.y,item.width,item.height].every(Number.isFinite)||item.width<=0||item.height<=0)error("Invalid element coordinates.",item.id);
    else if(item.x<0||item.y<0||item.x+item.width>draft.widthMm+.5||item.y+item.height>draft.heightMm+.5)warning("Element crosses the physical page boundary.",item.id);
    if(!Number.isSafeInteger(item.page??1)||(item.page??1)>pageCount||(item.page??1)<1)error("Element page index is out of range.",item.id);
    if(["customer","bank","dotmatrix"].includes(item.origin)&&!item.fieldKey?.trim())error("Dynamic field requires an explicit Customer or Bank Information mapping.",item.id);
    if(item.kind==="image" && (item.imageData || item.fieldKey!=="bankLogo" || item.origin!=="bank"))
      error("Shared template graphics must be editable vector shapes or a Bank Logo field. Local bitmap images cannot be shared as customer-free templates.",item.id);
    if(item.preprinted&&item.dotMatrix)warning("Already-printed content is marked for dot-matrix output; verify values-only rule.",item.id);
    if(item.dotMatrix&&["image","photo","rectangle","ellipse","line"].includes(item.kind))
      error("Direct PR2/Olivetti prints text labels and values only; graphics and photo boxes must be disabled.",item.id);
    if(item.dotMatrix&&!item.preprinted)printable++;
    if(draft.mode==="passbook"&&/union bank/i.test(draft.bankName)&&item.dotMatrix&&!item.preprinted&&["static","preprinted"].includes(item.origin))
      error("Union Bank passbooks print values only, not static labels.",item.id);
    if(!item.quick&&!item.dotMatrix)warning("Element is hidden from both output modes.",item.id);
  }
  if(draft.mode==="passbook"&&!printable)error("No printable dot-matrix customer fields exist.");
  if(!draft.elements.some(item=>item.quick))error("No Quick Passbook elements are visible.");
  return issues.slice(0,200);
}
