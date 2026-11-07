/** Restricted line extraction from local Tesseract v7 OCR block output.
 * This module never fetches data or emits customer values outside the editor.
 */
export type OCRCandidate={rawValue:string;confidence:number;boundingBox:{x:number;y:number;width:number;height:number}};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const rows=(v:unknown)=>Array.isArray(v)?v:[];
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
export function extractTesseractLines(blocks:unknown,maxLines=250):OCRCandidate[]{
  const max=Number.isFinite(maxLines)?Math.max(0,Math.min(250,Math.trunc(maxLines))):250;
  if(max===0)return [];
  const result:OCRCandidate[]=[];
  for(const block of rows(blocks)){
    if(!record(block))continue;
    for(const paragraph of rows(block.paragraphs)){
      if(!record(paragraph))continue;
      for(const line of rows(paragraph.lines)){
        if(!record(line)||!record(line.bbox))continue;
        const text=typeof line.text==="string"?line.text.trim().replace(/\s+/g," "):"";
        if(!text||text.length>180)continue;
        const {x0,y0,x1,y1}=line.bbox;
        if(![x0,y0,x1,y1].every(finite)||Number(x1)<=Number(x0)||Number(y1)<=Number(y0))continue;
        const confidence=finite(line.confidence)?Math.max(0,Math.min(100,line.confidence)) : 0;
        result.push({rawValue:text,confidence,
          boundingBox:{x:x0 as number,y:y0 as number,width:(x1 as number)-(x0 as number),height:(y1 as number)-(y0 as number)}
        });
        if(result.length>=max)return result;
      }
    }
  }
  return result;
}
