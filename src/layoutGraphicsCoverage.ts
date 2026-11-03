import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Cautious source-PDF graphic diagnostics.
 * Rebuilding lines and rectangles is not equivalent to copying complex
 * images, patterns, masks or paths. Do not invent vector objects from pixels.
 */
export type GraphicsCoverage = {
  rasterImages:number; gradients:number; transparency:number;
  clipping:number; complexPaths:number; warnings:string[];
};
const known=(values:(number|undefined)[])=>new Set(values.filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)));
const imageOps=known([
  OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintJpegXObject,
  OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObjectRepeat, OPS.paintInlineImageXObjectGroup,
]);
const clippingOps=known([OPS.clip,OPS.eoClip]);
const complexPaths=known([OPS.curveTo,OPS.curveTo2,OPS.curveTo3]);
export function analyzePdfGraphicsCoverage(
  operations:{fnArray:number[];argsArray:unknown[][]},
  maxScan=12000,
):GraphicsCoverage{
  const counts={rasterImages:0,gradients:0,transparency:0,clipping:0,complexPaths:0};
  const limit=Number.isSafeInteger(maxScan)&&maxScan>0?Math.min(maxScan,20000):12000;
  const count=Math.min(operations.fnArray.length,limit);
  for(let i=0;i<count;i++){
    const code=operations.fnArray[i];
    if(imageOps.has(code))counts.rasterImages++;
    if(code===OPS.shadingFill)counts.gradients++;
    if(code===OPS.setGState)counts.transparency++;
    if(clippingOps.has(code))counts.clipping++;
    if(code===OPS.constructPath){
      const commands=Array.isArray(operations.argsArray[i]?.[0])?operations.argsArray[i][0] as number[]:[];
      if(commands.some(item=>complexPaths.has(item)))counts.complexPaths++;
    }
  }
  const warnings:string[]=[];
  if(counts.rasterImages)warnings.push(counts.rasterImages+" raster-image/mask object(s) require editable manual reconstruction; do not paste source page as a Quick template.");
  if(counts.gradients)warnings.push(counts.gradients+" gradient/shading operation(s) require source comparison.");
  if(counts.transparency)warnings.push(counts.transparency+" graphics-state operation(s) may include opacity/blend modes that cannot be reproduced exactly.");
  if(counts.clipping)warnings.push(counts.clipping+" clipping operation(s) need manual verification.");
  if(counts.complexPaths)warnings.push(counts.complexPaths+" curved path(s) are represented only by editable stroke approximations; filled contours need tracing.");
  if(operations.fnArray.length>limit)warnings.push("Graphics operator analysis was capped; source may have additional artwork.");
  return {...counts,warnings};
}
