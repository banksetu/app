import {OPS} from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Reconstructs editable PDF strokes, cubic curves (as bounded line segments),
 * and axis-aligned rectangles from digital PDFs. Clipping, images, transparency
 * and font outlines still require manual comparison with the original sample.
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
const clamp=(x:number)=>!Number.isFinite(x)?0:Math.max(0,Math.min(255,Math.round(x<=1?x*255:x)));
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
  if(![pageWidthMm,pageHeightMm,viewport.width,viewport.height].every(n=>Number.isFinite(n)&&n>0)||!Number.isSafeInteger(maxShapes)||maxShapes<1)return [];
  let matrix:Matrix=[...identity],stroke="#111111",fill="#ffffff",width=1;
  const state:Array<{matrix:Matrix;stroke:string;fill:string;width:number}>=[];
  let pending:VectorPrimitive[]=[];
  const results:VectorPrimitive[]=[];
  const toMm=(point:Point):Point=>{
    const pixel=viewport.convertToViewportPoint(...point);
    return [round(pixel[0]/viewport.width*pageWidthMm),round(pixel[1]/viewport.height*pageHeightMm)];
  };
  const accept=(item:VectorPrimitive)=>{
    if([item.x,item.y,item.width,item.height,item.rotation,item.borderWidth].every(Number.isFinite)&&item.width>=1&&item.height>=.2&&
      item.width<=pageWidthMm+.5&&item.height<=pageHeightMm+.5&&
      results.length<maxShapes)results.push(item);
  };
  const queueLine=(a:Point,b:Point)=>{
    const start=toMm(a),end=toMm(b);
    const dx=end[0]-start[0],dy=end[1]-start[1],distance=Math.hypot(dx,dy);
    if(!Number.isFinite(distance)||distance<1||pending.length>maxShapes*12)return;
    pending.push({kind:"line",x:start[0],y:start[1],width:round(distance),
      height:.5,rotation:round(Math.atan2(dy,dx)*180/Math.PI),
      color:stroke,background:"transparent",borderWidth:round(width/72*25.4)});
  };
  const curveTo=(a:Point,b:Point,c:Point,d:Point)=>{
    // At most eight straight editable strokes per cubic, even for a large PDF.
    let last=a;
    for(let step=1;step<=8;step++){
      const t=step/8,u=1-t;
      const current:Point=[
        u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],
        u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]
      ];
      queueLine(last,current);last=current;
    }
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
          if(![px,py,w,h].every(Number.isFinite))continue;
          const points:Point[]=[
            transform(matrix,px,py),transform(matrix,px+w,py),
            transform(matrix,px+w,py+h),transform(matrix,px,py+h)
          ];
          const mm=points.map(toMm);
          const horizontal=Math.abs(mm[0][1]-mm[1][1])<.5 && Math.abs(mm[1][0]-mm[2][0])<.5;
          if(horizontal){
            const xs=mm.map(v=>v[0]),ys=mm.map(v=>v[1]);
            pending.push({kind:"rectangle",x:round(Math.min(...xs)),y:round(Math.min(...ys)),
              width:round(Math.max(...xs)-Math.min(...xs)),height:round(Math.max(...ys)-Math.min(...ys)),rotation:0,
              color:stroke,background:"transparent",borderWidth:round(width/72*25.4)});
          }else{
            // Sheared/rotated rectangle is not an axis-aligned rectangle.
            // Preserve stroke as editable edges; never fake a filled shape.
            for(let j=0;j<4;j++)queueLine(points[j],points[(j+1)%4]);
          }
          continue;
        }
        if(command===OPS.moveTo && cursor+1<coords.length){
          const x=Number(coords[cursor++]),y=Number(coords[cursor++]);
          prev=transform(matrix,x,y);starting=prev;continue;
        }
        if(command===OPS.lineTo && cursor+1<coords.length){
          const x=Number(coords[cursor++]),y=Number(coords[cursor++]);
          if(![x,y].every(Number.isFinite)){prev=null;continue;}
          const next=transform(matrix,x,y);
          if(prev)queueLine(prev,next);
          prev=next;continue;
        }
        if(command===OPS.closePath){
          if(prev&&starting)queueLine(prev,starting);
          prev=starting;continue;
        }
        if(command===OPS.curveTo && cursor+5<coords.length && prev){
          const raw=coords.slice(cursor,cursor+6);cursor+=6;
          if(!raw.every(Number.isFinite)){prev=null;continue;}
          const a=transform(matrix,raw[0],raw[1]);
          const b=transform(matrix,raw[2],raw[3]);
          const next=transform(matrix,raw[4],raw[5]);
          curveTo(prev,a,b,next);prev=next;continue;
        }
        if((command===OPS.curveTo2||command===OPS.curveTo3)&&cursor+3<coords.length && prev){
          const raw=coords.slice(cursor,cursor+4);cursor+=4;
          if(!raw.every(Number.isFinite)){prev=null;continue;}
          const control=transform(matrix,raw[0],raw[1]);
          const next=transform(matrix,raw[2],raw[3]);
          curveTo(prev,command===OPS.curveTo2?prev:control,command===OPS.curveTo2?control:next,next);
          prev=next;continue;
        }
        // Malformed or unsupported commands are discarded, never approximated as verified.
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
