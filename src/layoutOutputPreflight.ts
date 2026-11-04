import {typographyCompression} from "./layoutTypography.ts";
import {isLayoutLayerPrintable,type LayoutOutputLayer,type LayoutOutputMode} from "./layoutOutputPolicy.ts";

/** Review only — preflight refuses known-clipped customer text instead of
 * silently shrinking pre-approved physical positions or modifying customer data.
 */
export type PreflightPart=LayoutOutputLayer&{
  id:string;label:string;fieldKey:string;page?:number;
  x:number;y:number;width:number;height:number;size:number;letterSpacing?:number;fontCompression?:number;
};
export type PreflightReport={errors:string[];warnings:string[]};
export function preflightLayoutOutput(
  elements:PreflightPart[],paper:{widthMm:number;heightMm:number;pageCount?:number},
  output:LayoutOutputMode,bankName:string,getText:(part:PreflightPart)=>string,
):PreflightReport{
  const errors:string[]=[],warnings:string[]=[];
  if(![paper.widthMm,paper.heightMm].every(v=>Number.isFinite(v)&&v>=50&&v<=500)){
    errors.push("Invalid physical page dimensions.");return {errors,warnings};
  }
  const pages=paper.pageCount??1;
  if(!Number.isSafeInteger(pages)||pages<1||pages>10){errors.push("Invalid page count.");return {errors,warnings};}
  const seen=new Set<string>();
  for(const part of elements){
    if(!isLayoutLayerPrintable(part,output,bankName))continue;
    const name=part.fieldKey||part.label||part.id;
    if(seen.has(part.id)){errors.push("Duplicate layout layer ID: "+name);continue;}
    seen.add(part.id);
    if(![part.x,part.y,part.width,part.height,part.size].every(Number.isFinite)||
       part.x<0||part.y<0||part.width<=0||part.height<=0||
       part.x+part.width>paper.widthMm+.25||part.y+part.height>paper.heightMm+.25){
      errors.push("Layout item outside measured paper: "+name);continue;
    }
    if(!Number.isSafeInteger(part.page??1)||(part.page??1)<1||(part.page??1)>pages){
      errors.push("Layout item on invalid page: "+name);continue;
    }
    if(part.kind!=="text"&&part.kind!=="field")continue;
    const text=getText(part);
    if(!text.trim()){
      if(["customer","bank","dotmatrix"].includes(part.origin))
        errors.push("Missing required customer/bank value: "+name);
      continue;
    }
    // Conservative offline diagnostic, NOT an authoritative print simulation.
    // A real font/driver can wrap differently; the UI must show a paper proof.
    const fontMm=Math.max(1,part.size*.2646);
    const glyphMm=(fontMm*.57+Math.max(0,part.letterSpacing??0)*.2646)*typographyCompression(part.fontCompression);
    const estimatedChars=Math.max(1,Math.floor(part.width/glyphMm));
    const estimatedLines=text.split(/\r?\n/).reduce((count,line)=>{
      return count+Math.max(1,Math.ceil(Array.from(line).length/estimatedChars));
    },0);
    const room=Math.max(1,Math.floor(part.height/(fontMm*1.18)));
    if(estimatedLines>room)errors.push("Text may be clipped on the physical passbook: "+name+
      " ("+estimatedLines+" estimated lines, "+room+" lines of space).");
    else if(estimatedLines===room)warnings.push("Tight text fit; inspect real print: "+name);
  }
  return {errors,warnings};
}
