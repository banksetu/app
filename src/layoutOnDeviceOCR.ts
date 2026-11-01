/**
 * Optional offline OCR using the browser's native TextDetector (when present).
 * No network, uploads or remote model calls. This API is experimental; callers
 * must always offer the full manual editor if the platform does not support it.
 */
export type OpticalText = { rawValue:string; boundingBox:{ x:number;y:number;width:number;height:number } };
type TextDetectorLike = { detect:(image:HTMLCanvasElement)=>Promise<OpticalText[]> };
type TextDetectorFactory = new ()=>TextDetectorLike;
export type OpticalRegion = { label:string;x:number;y:number;width:number;height:number };

export function mapOpticalTextToMillimeters(
  items:OpticalText[],
  canvasWidth:number,
  canvasHeight:number,
  pageWidthMm:number,
  pageHeightMm:number,
):OpticalRegion[] {
  if (![canvasWidth,canvasHeight,pageWidthMm,pageHeightMm].every(v=>Number.isFinite(v)&&v>0)) return [];
  const result:OpticalRegion[]=[];
  for(const item of items.slice(0,250)){
    const label=String(item.rawValue||"").trim().replace(/\s+/g," ");
    const box=item.boundingBox;
    if (!label || label.length>180 || !box ||
        ![box.x,box.y,box.width,box.height].every(v=>Number.isFinite(v)) ||
        box.width<=0 || box.height<=0) continue;
    const mm=(value:number)=>Math.round(value*10)/10;
    result.push({
      label,
      x:mm(Math.max(0,box.x)/canvasWidth*pageWidthMm),
      y:mm(Math.max(0,box.y)/canvasHeight*pageHeightMm),
      width:mm(Math.max(2,box.width/canvasWidth*pageWidthMm)),
      height:mm(Math.max(2,box.height/canvasHeight*pageHeightMm)),
    });
  }
  return result;
}

export async function detectOfflineOpticalText(
  canvas:HTMLCanvasElement,
  pageWidthMm:number,
  pageHeightMm:number,
):Promise<{supported:boolean;items:OpticalRegion[];warning:string}> {
  if (typeof window==="undefined") return {supported:false,items:[],warning:"Browser native OCR is unavailable."};
  const factory=(window as unknown as {TextDetector?:TextDetectorFactory}).TextDetector;
  if (typeof factory!=="function") return {
    supported:false,items:[],
    warning:"This device does not support offline TextDetector. Use manual text and field tools; no PDF data was uploaded to an external OCR service.",
  };
  try {
    const detector=new factory();
    const items=mapOpticalTextToMillimeters(await detector.detect(canvas),canvas.width,canvas.height,pageWidthMm,pageHeightMm);
    return {supported:true,items,warning:items.length?"On-device OCR suggestions must be inspected against the original scan.":"No readable text found; manual editing remains available."};
  }catch{
    return {supported:true,items:[],warning:"Local text recognition failed; use manual field editing."};
  }
}
