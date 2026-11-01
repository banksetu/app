import {OPS} from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Reconstructs simple editable vector lines/rectangles from digital PDFs.
 * Unsupported curves, clipping, images, transparencies and font outlines are
 * intentionally ignored rather than faking an exact match to the bank sample.
 * Every extracted element remains a draft requiring original-reference review.
 */
type Matrix=[number,number,number,number,number,number];
type Point=[number,number];
export type VectorPrimitive={
  kind:"line"|"rectangle";x:number;y:number;width:number;height:number;
  rotation:number;color:string;background:string;borderWidth:number;
};
type PdfViewportLike={width:number;height:number;convertToViewportPoint:(x:number,y:number)=>number[]};
type PdfOperators={fnArray:number[];argsArray:unknown[][]};
const identity:Matrix=[1,0,0,1,0,0];
const clamp=(x:number)=>Math.max(0,Math.min(255,Math.round(x<=1?x*255:x)));
const color=(v:unknown[])=>{
 const [r,g,b]=v.map(x=>Number(x));
 return "#"+[clamp(r),clamp(g),clamp(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const multiply=(m:Matrix,n:Matrix):Matrix=>[
  m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],
  m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],
  m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5],
];
const transform=(m:Matrix,x:number,y:number):Point=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const round=(x:number)=>Math.round(x*10)/10;
export function collectEditableVectorShapes(
  operations:PdfOperators,viewport:PdfViewportLike,pageWidthMm:number,pageHeightMm:number,
  maxShapes=120,
):VectorPrimitive[]{
  if(pageWidthMm<=0||pageHeightMm<=0||!viewport.width||!viewport.height)return [];
  let matrix:Matrix=[...identity],stroke="#111111",fill="#ffffff",width=1;
  const state:Array<{matrix:Matrix;stroke:string;fill:string;width:number}>=[];
  let pending:VectorPrimitive[]=[];
  const results:VectorPrimitive[]=[];
  const toMm=(point:Point):Point=>{
    const pixel=viewport.convertToViewportPoint(...point);
    return [round(pixel[0]/viewport.width*pageWidthMm),round(pixel[1]/viewport.height*pageHeightMm)];
  };
  const accept=(item:VectorPrimitive)=>{
    if(item.width>=1&&item.height>=.2&&
      item.width<=pageWidthMm+.5&&item.height<=pageHeightMm+.5&&
      results.length<maxShapes)results.push(item);
  };
  for(let i=0;i<Math.min(operations.fnArray.length,12000);i++){
    const op=operations.fnArray[i],args=operations.argsArray[i]||[];
    if(op===OPS.save){state.push({matrix:[...matrix],stroke,fill,width});continue;}
    if(op===OPS.restore){const prev=state.pop();if(prev){matrix=prev.matrix;stroke=prev.stroke;fill=prev.fill;width=prev.width;}continue;}
    if(op===OPS.transform&&args.length===6&&args.every(x=>Number.isFinite(Number(x)))){
      matrix=multiply(matrix,args.map(Number) as Matrix);continue;
    }
    if(op===OPS.setStrokeRGBColor){stroke=color(args);continue;}
    if(op===OPS.setFillRGBColor){fill=color(args);continue;}
    if(op===OPS.setLineWidth){width=Math.abs(Number(args[0]))||1;continue;}
    if(op===OPS.constructPath){
      const commands=Array.isArray(args[0])?args[0] as number[]:[];
      const coords=Array.isArray(args[1])?args[1] as number[]:[];
      let cursor=0,starting:Point|null=null,prev:Point|null=null;
      for(const command of commands){
        if(command===OPS.rectangle && cursor+3<coords.length){
          const px=Number(coords[cursor++]),py=Number(coords[cursor++]),w=Number(coords[cursor++]),h=Number(coords[cursor++]);
          const p1=toMm(transform(matrix,px,py)),p2=toMm(transform(matrix,px+w,py+h));
          pending.push({kind:"rectangle",x:round(Math.min(p1[0],p2[0])),y:round(Math.min(p1[1],p2[1])),
            width:round(Math.abs(p2[0]-p1[0])),height:round(Math.abs(p2[1]-p1[1])),rotation:0,
            color:stroke,background:"transparent",borderWidth:round(width/72*25.4)});
          continue;
        }
        if(command===OPS.moveTo && cursor+1<coords.length){
          const x=Number(coords[cursor++]),y=Number(coords[cursor++]);
          prev=transform(matrix,x,y);starting=prev;continue;
        }
        if(command===OPS.lineTo && cursor+1<coords.length){
          const x=Number(coords[cursor++]),y=Number(coords[cursor++]);
          const next=transform(matrix,x,y);
          if(prev){
            const a=toMm(prev),b=toMm(next);
            const dx=b[0]-a[0],dy=b[1]-a[1];
            if(Math.abs(dx)<.8 || Math.abs(dy)<.8){
              pending.push({kind:"line",x:round(Math.min(a[0],b[0])),y:round(Math.min(a[1],b[1])),width:round(Math.max(1,Math.abs(dx)||Math.abs(dy))),
                height:.5,rotation:Math.abs(dx)<.8?90:0,color:stroke,background:"transparent",borderWidth:round(width/72*25.4)});
            }
          }prev=next;continue;
        }
        if(command===OPS.closePath){prev=starting;continue;}
        // Skip unrecognized curves. They cannot be safely edited as a line.
        if(command===OPS.curveTo)cursor+=6;
        else if(command===OPS.curveTo2||command===OPS.curveTo3)cursor+=4;
      }
    }
    if([OPS.stroke,OPS.closeStroke,OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(op)){
      const filled=[OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(op);
      for(const shape of pending){
        if(results.length>=maxShapes)break;
        accept({...shape,color:stroke,background:filled&&shape.kind==="rectangle"?fill:"transparent"});
      }
      pending=[];
    }else if(op===OPS.endPath){pending=[];}
    if(results.length>=maxShapes)break;
  }
  return results;
}
