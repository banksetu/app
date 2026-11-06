/** Physical passbook geometry in millimetres. No printer or customer dependencies.
 * Existing drafts without pageSetup remain compatible with their original
 * width/height/foldMm/printStartMm coordinates.
 */
export type FoldAxis="horizontal"|"vertical"|"none";
export type PageSetup={
  foldAxis:FoldAxis;
  marginTopMm:number;marginBottomMm:number;marginLeftMm:number;marginRightMm:number;
};
export type MeasuredPage={
  widthMm:number;heightMm:number;foldMm:number;printStartMm:number;pageSetup?:PageSetup;
};
export type PaperPreset={id:string;name:string;widthMm:number;heightMm:number;foldMm:number;printStartMm:number;foldAxis:FoldAxis};
export const PAPER_PRESETS:readonly PaperPreset[]=[
  {id:"passbook-190",name:"Passbook 190 × 175 mm (sample)",widthMm:190,heightMm:175,foldMm:87.5,printStartMm:100,foldAxis:"horizontal"},
  {id:"passbook-206",name:"Passbook 206 × 175 mm (sample)",widthMm:206,heightMm:175,foldMm:87.5,printStartMm:117,foldAxis:"horizontal"},
  {id:"passbook-173",name:"Passbook 190 × 173 mm (sample)",widthMm:190,heightMm:173,foldMm:86.5,printStartMm:101.5,foldAxis:"horizontal"},
  {id:"a4-portrait",name:"A4 Portrait 210 × 297 mm",widthMm:210,heightMm:297,foldMm:0,printStartMm:0,foldAxis:"none"},
  {id:"a4-landscape",name:"A4 Landscape 297 × 210 mm",widthMm:297,heightMm:210,foldMm:0,printStartMm:0,foldAxis:"none"},
  {id:"a5-portrait",name:"A5 Portrait 148 × 210 mm",widthMm:148,heightMm:210,foldMm:0,printStartMm:0,foldAxis:"none"},
  {id:"a5-landscape",name:"A5 Landscape 210 × 148 mm",widthMm:210,heightMm:148,foldMm:0,printStartMm:0,foldAxis:"none"}
];
export function defaultPageSetup():PageSetup{
  return {foldAxis:"horizontal",marginTopMm:8,marginBottomMm:8,marginLeftMm:8,marginRightMm:8};
}
export function pageSetupFor(paper:MeasuredPage):PageSetup{
  if(!paper.pageSetup)return {...defaultPageSetup(),foldAxis:paper.foldMm>0?"horizontal":"none"};
  return paper.pageSetup;
}
export function geometryErrors(paper:MeasuredPage):string[]{
  const errors:string[]=[];
  const w=paper.widthMm,h=paper.heightMm,s=pageSetupFor(paper);
  const finite=(n:number)=>typeof n==="number"&&Number.isFinite(n);
  if(!finite(w)||!finite(h)||w<50||h<50||w>500||h>500){
    errors.push("Physical width and height must be 50–500 mm.");return errors;
  }
  if(!["none","horizontal","vertical"].includes(s.foldAxis))
    errors.push("Choose a supported fold direction.");
  for(const [label,value] of [["Left margin",s.marginLeftMm],["Right margin",s.marginRightMm],
    ["Top margin",s.marginTopMm],["Bottom margin",s.marginBottomMm]] as const){
    if(!finite(value)||value<0||value>120)errors.push(label+" must be 0–120 mm.");
  }
  if(s.marginLeftMm+s.marginRightMm>=w||s.marginTopMm+s.marginBottomMm>=h)
    errors.push("Margins must leave a printable content region.");
  const limit=s.foldAxis==="vertical"?w:h;
  if(!finite(paper.foldMm)||paper.foldMm<0||paper.foldMm>limit)
    errors.push("Fold position falls outside the physical passbook.");
  if(!finite(paper.printStartMm)||paper.printStartMm<0||paper.printStartMm>limit)
    errors.push("Print start falls outside the physical passbook.");
  if(s.foldAxis==="none"&&paper.foldMm!==0)
    errors.push("A flat document cannot have a fold line.");
  if(s.foldAxis!=="none"&&paper.foldMm>0&&paper.printStartMm>0&&
      paper.printStartMm<paper.foldMm)
    errors.push("Data print start must not precede the chosen fold line.");
  return errors;
}
export function pageMeasurements(paper:MeasuredPage){
  const s=pageSetupFor(paper);
  const foldDistance=s.foldAxis==="none"?0:paper.foldMm;
  const total=s.foldAxis==="vertical"?paper.widthMm:paper.heightMm;
  return {
    foldAxis:s.foldAxis,
    firstHalfMm:foldDistance,
    secondHalfMm:s.foldAxis==="none"?0:Math.max(0,total-foldDistance),
    printStartFromFoldMm:s.foldAxis==="none"?paper.printStartMm:paper.printStartMm-paper.foldMm,
    printableAfterStartMm:Math.max(0,total-paper.printStartMm),
    contentWidthMm:Math.max(0,paper.widthMm-s.marginLeftMm-s.marginRightMm),
    contentHeightMm:Math.max(0,paper.heightMm-s.marginTopMm-s.marginBottomMm),
  };
}
export function presetGeometry(presetId:string):MeasuredPage|undefined{
  const preset=PAPER_PRESETS.find(p=>p.id===presetId);
  if(!preset)return;
  return {
    widthMm:preset.widthMm,heightMm:preset.heightMm,foldMm:preset.foldMm,
    printStartMm:preset.printStartMm,
    pageSetup:{...defaultPageSetup(),foldAxis:preset.foldAxis}
  };
}
