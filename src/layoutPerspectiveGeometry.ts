/** Optional planar four-corner rectification for an A4 scan.
 * Never assumes passbook proportions, a fold direction or a bank-specific page.
 * A severely warped sheet requires manual review even after correction.
 */
export type PerspectivePoint={x:number;y:number};
export type PerspectiveQuad=[PerspectivePoint,PerspectivePoint,PerspectivePoint,PerspectivePoint]; // TL,TR,BR,BL
const finite=(n:number)=>Number.isFinite(n);
export function createPerspectiveMap(quad:PerspectiveQuad,frameWidth:number,frameHeight:number){
  if(![frameWidth,frameHeight].every(n=>finite(n)&&n>0))throw Error("Invalid scanner size.");
  const p=quad;
  if(!p||p.length!==4||p.some(q=>!q||![q.x,q.y].every(finite)||
      q.x<0||q.y<0||q.x>frameWidth||q.y>frameHeight))
    throw Error("The four selected passbook corners must be inside the scanner page.");
  let direction=0;
  for(let i=0;i<4;i++){
    const a=p[i],b=p[(i+1)%4],c=p[(i+2)%4];
    const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if(Math.abs(cross)<1e-6||direction&&cross*direction<=0)
      throw Error("Perspective corners must be a non-crossing convex passbook.");
    direction=direction||cross;
  }
  const area=Math.abs(p.reduce((sum,v,i)=>sum+v.x*p[(i+1)%4].y-p[(i+1)%4].x*v.y,0)/2);
  if(area<frameWidth*frameHeight*.004)throw Error("Perspective crop is too small.");
  const [tl,tr,br,bl]=p;
  const dx1=tr.x-br.x,dy1=tr.y-br.y;
  const dx2=bl.x-br.x,dy2=bl.y-br.y;
  const dx3=tl.x-tr.x+br.x-bl.x,dy3=tl.y-tr.y+br.y-bl.y;
  const den=dx1*dy2-dx2*dy1;
  let g=0,h=0;
  if(Math.abs(dx3)+Math.abs(dy3)>1e-6){
    if(Math.abs(den)<1e-8)throw Error("Cannot rectify nearly parallel perspective corners.");
    g=(dx3*dy2-dx2*dy3)/den;
    h=(dx1*dy3-dx3*dy1)/den;
  }
  const a=tr.x-tl.x+g*tr.x,b=bl.x-tl.x+h*bl.x,c=tl.x;
  const d=tr.y-tl.y+g*tr.y,e=bl.y-tl.y+h*bl.y,f=tl.y;
  const toSource=(u:number,v:number):PerspectivePoint=>{
    const denominator=g*u+h*v+1;
    if(!finite(denominator)||Math.abs(denominator)<1e-9)throw Error("Invalid perspective projection.");
    return {x:(a*u+b*v+c)/denominator,y:(d*u+e*v+f)/denominator};
  };
  const toNormalized=(x:number,y:number):PerspectivePoint=>{
    const aa=a-g*x,bb=b-h*x,cc=d-g*y,dd=e-h*y;
    const determinant=aa*dd-bb*cc;
    if(!finite(determinant)||Math.abs(determinant)<1e-9)
      throw Error("Perspective inversion failed.");
    return {
      x:((x-c)*dd-bb*(y-f))/determinant,
      y:(aa*(y-f)-(x-c)*cc)/determinant
    };
  };
  // Reject near-singular transforms before any draft element is changed.
  for(const q of p){
    const uv=toNormalized(q.x,q.y);
    if(!finite(uv.x)||!finite(uv.y))throw Error("Invalid perspective corners.");
  }
  return {toSource,toNormalized};
}

/** Reconstruct a temporary local reference only. No customer pixels are saved
 * to the shared template. Output is capped for low-end Android devices.
 */
export function rectifyPerspectivePixels(
  rgba:Uint8ClampedArray,sourceWidth:number,sourceHeight:number,
  quad:PerspectiveQuad,targetWidth:number,targetHeight:number,
  clockwiseRotation:0|90|180|270=0,fineRotationDeg=0,
):Uint8ClampedArray{
  if(![sourceWidth,sourceHeight,targetWidth,targetHeight].every(Number.isSafeInteger)||
    Math.min(sourceWidth,sourceHeight,targetWidth,targetHeight)<1||
    sourceWidth*sourceHeight*4>rgba.length||
    targetWidth*targetHeight>2200000||
    ![0,90,180,270].includes(clockwiseRotation)||
    !finite(fineRotationDeg)||Math.abs(fineRotationDeg)>8)
    throw Error("Invalid or oversized perspective reference.");
  const transform=createPerspectiveMap(quad,sourceWidth,sourceHeight);
  const result=new Uint8ClampedArray(targetWidth*targetHeight*4);
  const rad=fineRotationDeg*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  for(let y=0;y<targetHeight;y++){
    for(let x=0;x<targetWidth;x++){
      const cx=x+.5-targetWidth/2,cy=y+.5-targetHeight/2;
      // Invert the optional fine rotation within the oriented output surface.
      let u=(targetWidth/2+cx*cos+cy*sin)/targetWidth;
      let v=(targetHeight/2-cx*sin+cy*cos)/targetHeight;
      if(clockwiseRotation===90){const oldU=u;u=v;v=1-oldU;}
      else if(clockwiseRotation===180){u=1-u;v=1-v;}
      else if(clockwiseRotation===270){const oldU=u;u=1-v;v=oldU;}
      const pos=transform.toSource(u,v);
      const sx=Math.floor(pos.x),sy=Math.floor(pos.y);
      const offset=(y*targetWidth+x)*4;
      if(sx<0||sy<0||sx>=sourceWidth||sy>=sourceHeight){
        result[offset]=255;result[offset+1]=255;result[offset+2]=255;result[offset+3]=255;
      }else{
        const k=(sy*sourceWidth+sx)*4;
        result[offset]=rgba[k];result[offset+1]=rgba[k+1];result[offset+2]=rgba[k+2];result[offset+3]=rgba[k+3];
      }
    }
  }
  return result;
}
