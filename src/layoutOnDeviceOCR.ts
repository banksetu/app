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
    // OCR coordinates can extend outside the scanned canvas, especially after rotation
    // or near a crop edge. Clip in pixel space before converting into page millimeters.
    // Never save a suggestion outside the editable document boundary.
    const left=Math.max(0,Math.min(canvasWidth,box.x));
    const top=Math.max(0,Math.min(canvasHeight,box.y));
    const right=Math.max(0,Math.min(canvasWidth,box.x+box.width));
    const bottom=Math.max(0,Math.min(canvasHeight,box.y+box.height));
    if (right<=left || bottom<=top) continue;
    const mm=(value:number)=>Math.round(value*10)/10;
    result.push({
      label,
      x:mm(left/canvasWidth*pageWidthMm),
      y:mm(top/canvasHeight*pageHeightMm),
      width:mm((right-left)/canvasWidth*pageWidthMm),
      height:mm((bottom-top)/canvasHeight*pageHeightMm),
    });
  }
  return result;
}

/** Map boxes found on a rotated page back into the source scan. Angles are
 * clockwise, measured in quarter turns, and never change saved source pixels.
 */
export function rotateOpticalTextBoxesToOriginal(
  items:OpticalText[],width:number,height:number,quarterTurns:0|1|2|3,
):OpticalText[]{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return [];
  return items.map(item=>{
    const b=item.boundingBox;
    if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite))return item;
    let box=b;
    if(quarterTurns===1)box={x:b.y,y:height-b.x-b.width,width:b.height,height:b.width};
    if(quarterTurns===2)box={x:width-b.x-b.width,y:height-b.y-b.height,width:b.width,height:b.height};
    if(quarterTurns===3)box={x:width-b.y-b.height,y:b.x,width:b.height,height:b.width};
    return {...item,boundingBox:box};
  });
}

/** Native OCR stays strictly on device. To avoid five expensive passes on large
 * documents, rotated probes are only attempted on small single-page previews,
 * and only when the first read was empty.
 */
export async function detectOfflineOpticalText(
  canvas:HTMLCanvasElement,
  pageWidthMm:number,
  pageHeightMm:number,
):Promise<{supported:boolean;items:OpticalRegion[];warning:string}> {
  if(typeof window==="undefined")return {supported:false,items:[],warning:"Browser native OCR is unavailable."};
  const factory=(window as unknown as {TextDetector?:TextDetectorFactory}).TextDetector;
  if(typeof factory!=="function")return {
    supported:false,items:[],
    warning:"This device does not support offline TextDetector. Use manual text and field tools; no PDF data was uploaded to an external OCR service.",
  };
  try{
    if(!canvas.width||!canvas.height)return {supported:true,items:[],warning:"Invalid scanned page dimensions."};
    const detector=new factory();
    const original=await detector.detect(canvas);
    if(original.length){
      const items=mapOpticalTextToMillimeters(original,canvas.width,canvas.height,pageWidthMm,pageHeightMm);
      return {supported:true,items,warning:"On-device OCR suggestions require manual review against the scan."};
    }
    if(typeof document==="undefined"||canvas.width*canvas.height>2400000)
      return {supported:true,items:[],warning:"No text detected. Large scans require manual review or an OCR-equipped device."};
    // Retry with a high-contrast grayscale canvas for faint dot-matrix print.
    const enhanced=document.createElement("canvas");
    enhanced.width=canvas.width;enhanced.height=canvas.height;
    const context=enhanced.getContext("2d",{willReadFrequently:true});
    if(context){
      context.drawImage(canvas,0,0);
      const pixels=context.getImageData(0,0,enhanced.width,enhanced.height);
      for(let i=0;i<pixels.data.length;i+=4){
        const gray=Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);
        const value=gray<185?0:255;
        pixels.data[i]=value;pixels.data[i+1]=value;pixels.data[i+2]=value;
      }
      context.putImageData(pixels,0,0);
      const afterContrast=await detector.detect(enhanced);
      if(afterContrast.length){
        enhanced.width=0;enhanced.height=0;
        return {supported:true,
          items:mapOpticalTextToMillimeters(afterContrast,canvas.width,canvas.height,pageWidthMm,pageHeightMm),
          warning:"Enhanced-contrast OCR found possible text. Recheck thin letters and small Hindi characters manually."};
      }
    }
    enhanced.width=0;enhanced.height=0;
    // Some bank scans are upside down or side-on. Retry only on the reduced
    // preview, without changing the physical page measurements.
    for(const turns of [2,1,3] as const){
      const rotated=document.createElement("canvas");
      rotated.width=turns===2?canvas.width:canvas.height;
      rotated.height=turns===2?canvas.height:canvas.width;
      const ctx=rotated.getContext("2d");
      if(!ctx)continue;
      if(turns===2){ctx.translate(canvas.width,canvas.height);ctx.rotate(Math.PI);}
      else if(turns===1){ctx.translate(canvas.height,0);ctx.rotate(Math.PI/2);}
      else {ctx.translate(0,canvas.width);ctx.rotate(-Math.PI/2);}
      ctx.drawImage(canvas,0,0);
      const found=await detector.detect(rotated);
      rotated.width=0;rotated.height=0;
      if(!found.length)continue;
      const mapped=rotateOpticalTextBoxesToOriginal(found,canvas.width,canvas.height,turns);
      return {supported:true,
        items:mapOpticalTextToMillimeters(mapped,canvas.width,canvas.height,pageWidthMm,pageHeightMm),
        warning:"Rotated scan OCR found possible text. Verify orientation and every suggested label before saving."};
    }
    return {supported:true,items:[],warning:"Native OCR found no reliable text after limited offline contrast and rotation checks. Manual editing remains available."};
  }catch{
    return {supported:true,items:[],warning:"Local text recognition failed. The original scan remains private; use manual field editing."};
  }
}
