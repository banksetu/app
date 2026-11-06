/** Bank-independent per-object typography.
 * "Font compression" changes glyph width, NOT physical paper width.
 * Tracking is in CSS px (96 dpi) and stays separate from font size.
 * All defaults are backward compatible with approved layouts.
 */
export const FONT_COMPRESSION_MIN=50;
export const FONT_COMPRESSION_MAX=100;
export const TRACKING_MM_PER_CSS_PX=25.4/96;
export type LayoutTypography={letterSpacing?:number;fontCompression?:number;lineHeight?:number};
export function typographyCompression(value?:number):number{
  return typeof value==="number"&&Number.isFinite(value)&&
    value>=FONT_COMPRESSION_MIN&&value<=FONT_COMPRESSION_MAX?value/100:1;
}
export function typographyIsValid(value:LayoutTypography):boolean{
  return (value.fontCompression===undefined||(
    typeof value.fontCompression==="number"&&Number.isFinite(value.fontCompression)&&
    value.fontCompression>=FONT_COMPRESSION_MIN&&value.fontCompression<=FONT_COMPRESSION_MAX))&&
    (value.letterSpacing===undefined||(
      typeof value.letterSpacing==="number"&&Number.isFinite(value.letterSpacing)&&
      value.letterSpacing>=-5&&value.letterSpacing<=30))&&
    (value.lineHeight===undefined||(
      typeof value.lineHeight==="number"&&Number.isFinite(value.lineHeight)&&
      value.lineHeight>=.8&&value.lineHeight<=3));
}
export function trackingMm(value:LayoutTypography):number{
  return (value.letterSpacing??0)*TRACKING_MM_PER_CSS_PX;
}
/** Wrap text, not the whole editable/print rectangle, so hit targets, grips,
 * paper coordinates, photos and borders are NEVER horizontally distorted.
 * Expanded untransformed width prevents premature wrapping of compressed text.
 */
export function compressedTextStyle(value:LayoutTypography,zoom=1):{
  display:"block";width:string;minHeight:string;transform:string;
  transformOrigin:"left top";letterSpacing:string;whiteSpace:"pre-wrap";
  overflowWrap:"anywhere";lineHeight:number;
}{
  const scale=typographyCompression(value.fontCompression);
  return {display:"block",width:(100/scale)+"%",minHeight:"100%",
    transform:"scaleX("+scale+")",transformOrigin:"left top",
    letterSpacing:((value.letterSpacing??0)*zoom)+"px",
    whiteSpace:"pre-wrap",overflowWrap:"anywhere",lineHeight:value.lineHeight??1.18};
}
