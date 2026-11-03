/**
 * Conservative A4 scanner estimator. This is a proposal, never an automatic
 * source of truth: white passbooks can be indistinguishable from white scanner
 * paper, and printer "fit to page" may invalidate the scale.
 */
export type ScanBounds = {
  left: number; top: number; right: number; bottom: number;
  widthMm: number; heightMm: number; confidence: "low" | "medium";
  reason: string;
  foldHint?: FoldHint;
  skewHint?: SkewHint;
};
export type SkewHint={angleDeg:number;confidence:"low";reason:string};

/** Estimate a possible small tilt from BOTH visible outer paper edges.
 * Labels/text alone are not sufficient evidence of the physical boundary.
 * The hint never changes a draft automatically.
 */
export function estimatePassbookSkew(
  pixels:Uint8ClampedArray,width:number,height:number,
  bounds:Pick<ScanBounds,"left"|"top"|"right"|"bottom">,
):SkewHint|null{
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<40||height<40||
    pixels.length<width*height*4||
    ![bounds.left,bounds.top,bounds.right,bounds.bottom].every(Number.isFinite))return null;
  const left=Math.max(0,Math.ceil(bounds.left)),right=Math.min(width,Math.floor(bounds.right));
  const top=Math.max(0,Math.ceil(bounds.top)),bottom=Math.min(height,Math.floor(bounds.bottom));
  const spanX=right-left,spanY=bottom-top;
  if(spanX<40||spanY<40)return null;
  const samples:Array<{y:number;left:number;right:number}>=[];
  const step=Math.max(1,Math.floor(spanX/400));
  for(let row=1;row<=19;row++){
    const y=Math.floor(top+spanY*row/20);
    let min=-1,max=-1;
    for(let x=left;x<right;x+=step){
      const k=(y*width+x)*4;
      const ink=pixels[k+3]>64&&Math.max(255-pixels[k],255-pixels[k+1],255-pixels[k+2])>27;
      if(ink){if(min<0)min=x;max=x;}
    }
    if(min>=0&&max-min>spanX*.60)samples.push({y,left:min,right:max});
  }
  if(samples.length<14)return null;
  const fit=(which:"left"|"right")=>{
    const avgY=samples.reduce((acc,p)=>acc+p.y,0)/samples.length;
    const avgX=samples.reduce((acc,p)=>acc+p[which],0)/samples.length;
    let num=0,den=0;
    for(const p of samples){num+=(p.y-avgY)*(p[which]-avgX);den+=(p.y-avgY)**2;}
    const slope=den?num/den:0;
    const rmse=Math.sqrt(samples.reduce((acc,p)=>acc+(p[which]-avgX-slope*(p.y-avgY))**2,0)/samples.length);
    return {slope,rmse};
  };
  const l=fit("left"),r=fit("right");
  if(Math.abs(l.slope-r.slope)>.035||Math.max(l.rmse,r.rmse)>Math.max(2,spanX*.025))return null;
  const angleDeg=Math.atan((l.slope+r.slope)/2)*180/Math.PI;
  if(!Number.isFinite(angleDeg)||Math.abs(angleDeg)<.45||Math.abs(angleDeg)>8)return null;
  return {angleDeg:Math.round(angleDeg*10)/10,confidence:"low",
    reason:"Visible paper edges suggest a small scan tilt. Verify before optionally correcting it."};
}

export type FoldHint={foldMm:number;pageY:number;confidence:"low";reason:string};

/** Suggest the quiet strip between the two printed passbook halves.
 * This is NOT proof of the physical fold; preprinted artwork and scanner
 * borders can also contain white bands. Never auto-approve a printer profile.
 */
export function estimatePassbookFold(
  pixels:Uint8ClampedArray,width:number,height:number,bounds:ScanBounds,
):FoldHint|null {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<20||height<20||
     pixels.length<width*height*4||
     ![bounds.left,bounds.top,bounds.right,bounds.bottom,bounds.heightMm].every(Number.isFinite)||
     bounds.heightMm<=0)return null;
  const left=Math.max(0,Math.ceil(bounds.left)),right=Math.min(width,Math.floor(bounds.right));
  const top=Math.max(0,Math.ceil(bounds.top)),bottom=Math.min(height,Math.floor(bounds.bottom));
  const h=bottom-top,w=right-left;
  if(h<50||w<30)return null;
  const xStep=Math.max(1,Math.ceil(w/300)),yStep=Math.max(1,Math.ceil(h/650));
  const density:Array<{y:number;ink:number}>=[];
  for(let y=top;y<bottom;y+=yStep){
    let dark=0,total=0;
    for(let x=left;x<right;x+=xStep){
      const p=(y*width+x)*4;
      if(pixels[p+3]<64)continue;
      total++;
      if(Math.min(pixels[p],pixels[p+1],pixels[p+2])<190)dark++;
    }
    density.push({y,ink:total?dark/total:0});
  }
  if(density.length<30)return null;
  const count=density.length;
  // Require printed material on BOTH sides, not a single logo or empty paper.
  const active=(a:number,b:number)=>density.slice(a,b).filter(v=>v.ink>.035).length;
  if(active(0,Math.floor(count*.3))<3||active(Math.ceil(count*.7),count)<3)return null;
  let best:{start:number;end:number;score:number}|null=null;
  let run=-1;
  const inspect=(end:number)=>{
    if(run<0)return;
    const len=end-run,mid=(run+end)/2;
    if(len>=Math.max(2,Math.floor(count*.018))&&len<=count*.23){
      const score=len-count*.14*Math.abs(mid/count-.5);
      if(!best||score>best.score)best={start:run,end,score};
    }
    run=-1;
  };
  for(let i=0;i<count;i++){
    const withinMiddle=i>=count*.3&&i<count*.7;
    if(withinMiddle&&density[i].ink<.012){if(run<0)run=i;}
    else inspect(i);
  }
  inspect(count);
  if(!best)return null;
  const selected: {start:number;end:number;score:number}=best;
  const pageY=Math.min(bottom,top+(selected.start+selected.end)/2*yStep);
  const foldMm=Math.round((pageY-bounds.top)/(bounds.bottom-bounds.top)*bounds.heightMm*10)/10;
  if(foldMm<=0||foldMm>=bounds.heightMm)return null;
  return {foldMm,pageY:Math.round(pageY),confidence:"low",
    reason:"Quiet gap between two printed halves; confirm the physical crease with a ruler."};
}

export function estimatePassbookBounds(pixels: Uint8ClampedArray, width: number, height: number, paperWidthMm: number, paperHeightMm: number): ScanBounds | null {
  // Reject invalid frames before allocating row/column accumulators. A malformed
  // scan must never propagate NaN dimensions or crash the layout editor.
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width<=0 || height<=0 || !Number.isSafeInteger(width*height*4) ||
      !Number.isFinite(paperWidthMm) || !Number.isFinite(paperHeightMm) ||
      paperWidthMm<=0 || paperHeightMm<=0 ||
      pixels.length < width*height*4) return null;
  // Sample sparsely: keep large scanned images responsive on low-end mobiles.
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 700));
  const rows = new Uint32Array(Math.ceil(height / step));
  const cols = new Uint32Array(Math.ceil(width / step));
  const background = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    // Only mark substantial contrast; small scanner grain is not a boundary.
    return Math.max(255 - pixels[p], 255 - pixels[p + 1], 255 - pixels[p + 2]) > 27 && pixels[p + 3] > 64;
  };
  for (let y = 0, row = 0; y < height; y += step, row++) {
    for (let x = 0, col = 0; x < width; x += step, col++) {
      if (background(x, y)) { rows[row]++; cols[col]++; }
    }
  }
  const sampledWidth = cols.length, sampledHeight = rows.length;
  // A straight edge or tinted paper produces sustained evidence on rows/cols.
  // Text-only content may also qualify; confidence deliberately stays low.
  const rowMin = Math.max(3, Math.floor(sampledWidth * .09));
  const colMin = Math.max(3, Math.floor(sampledHeight * .09));
  const activeRows: number[] = [], activeCols: number[] = [];
  for (let i = 0; i < rows.length; i++) if (rows[i] >= rowMin) activeRows.push(i);
  for (let i = 0; i < cols.length; i++) if (cols[i] >= colMin) activeCols.push(i);
  if (activeRows.length < sampledHeight * .06 || activeCols.length < sampledWidth * .06) return null;
  // If contrast covers every scanner edge, it cannot establish the book's
  // physical outline. Require manual crop rather than accepting the whole A4.
  if(activeRows[0]<=1&&activeRows[activeRows.length-1]>=rows.length-2&&
     activeCols[0]<=1&&activeCols[activeCols.length-1]>=cols.length-2)return null;
  const left = Math.max(0, activeCols[0] * step);
  const right = Math.min(width, (activeCols[activeCols.length - 1] + 1) * step);
  const top = Math.max(0, activeRows[0] * step);
  const bottom = Math.min(height, (activeRows[activeRows.length - 1] + 1) * step);
  if (right - left < width * .2 || bottom - top < height * .15) return null;
  const widthMm = Math.round((right - left) / width * paperWidthMm * 10) / 10;
  const heightMm = Math.round((bottom - top) / height * paperHeightMm * 10) / 10;
  const corners = [
    [left, top], [right - step, top], [left, bottom - step], [right - step, bottom - step],
  ];
  const cornerHits = corners.filter(([x, y]) => background(Math.floor(x), Math.floor(y))).length;
  return {
    left, top, right, bottom, widthMm, heightMm,
    foldHint:estimatePassbookFold(pixels,width,height,{left,top,right,bottom,widthMm,heightMm,confidence:"low",reason:"estimate"}) ?? undefined,
    skewHint:estimatePassbookSkew(pixels,width,height,{left,top,right,bottom}) ?? undefined,
    confidence: cornerHits >= 3 ? "medium" : "low",
    reason: cornerHits >= 3
      ? "Outer contrast visible near corners. Verify against the real passbook before applying."
      : "Likely content bounds only; blank margins may belong to the passbook. Measure manually before applying.",
  };
}

/** Optional manual ruler measurements override scanner pixel scaling without
 * changing the selected ROI. Works for landscape, tall and square passbooks:
 * neither paper shape nor any bank's template is assumed.
 * The caller must review/crop the actual passbook boundary first.
 */
export function calibrateScanBounds(
  bounds:ScanBounds,
  measurements:{widthMm?:number|null;heightMm?:number|null;foldMm?:number|null},
):ScanBounds {
  const widthMm=measurements.widthMm??bounds.widthMm;
  const heightMm=measurements.heightMm??bounds.heightMm;
  if(![widthMm,heightMm].every(n=>Number.isFinite(n)&&n>=10&&n<=500) ||
     ![bounds.left,bounds.top,bounds.right,bounds.bottom].every(Number.isFinite) ||
     bounds.right<=bounds.left||bounds.bottom<=bounds.top)
    throw Error("Invalid manual passbook dimensions or scanner crop.");
  const originalFold=bounds.foldHint;
  const foldMm=measurements.foldMm??(originalFold?originalFold.foldMm/bounds.heightMm*heightMm:null);
  if(foldMm!==null&&(!Number.isFinite(foldMm)||foldMm<0||foldMm>heightMm))
    throw Error("Fold measurement must be within the physical passbook height.");
  return {...bounds,widthMm,heightMm,
    foldHint:foldMm===null?undefined:{
      foldMm:Math.round(foldMm*10)/10,
      pageY:originalFold?.pageY??Math.round(bounds.top+
        (bounds.bottom-bounds.top)*foldMm/heightMm),
      confidence:"low",reason:measurements.foldMm!==undefined&&measurements.foldMm!==null
        ?"Manually entered fold location; print start must be calibrated independently."
        :"Automatically suggested quiet gap, rescaled to the supplied passbook height."
    },
    confidence:"low",
    reason:measurements.widthMm!=null||measurements.heightMm!=null
      ?"Manual physical size combined with selected scanner ROI. Check borders and print start."
      :bounds.reason
  };
}

/** Shift A4 positions into the measured passbook's own physical coordinate system.
 * Do not silently remove elements even when the scan estimator puts them outside
 * the tentative crop; they may be real border text requiring manual review.
 */
export function mapScannedPageToPassbook<T extends { x:number;y:number;width:number;height:number;page?:number;rotation?:number }>(
  bounds:ScanBounds,
  scannerWidth:number,
  scannerHeight:number,
  scannerPaperWidthMm:number,
  scannerPaperHeightMm:number,
  elements:T[],
  clockwiseRotation:0|90|180|270=0,
): { elements:T[]; outsideCount:number } {
  if (![scannerWidth,scannerHeight,scannerPaperWidthMm,scannerPaperHeightMm].every(n=>Number.isFinite(n)&&n>0) ||
    ![bounds.left,bounds.top,bounds.right,bounds.bottom,bounds.widthMm,bounds.heightMm].every(Number.isFinite) ||
    bounds.widthMm<=0 || bounds.heightMm<=0 ||
    bounds.left<0 || bounds.top<0 || bounds.right>scannerWidth || bounds.bottom>scannerHeight ||
    bounds.right<=bounds.left || bounds.bottom<=bounds.top) throw Error("Invalid scanner coordinate frame.");
  if(![0,90,180,270].includes(clockwiseRotation))
    throw Error("Unsupported scan orientation.");
  const leftMm=bounds.left/scannerWidth*scannerPaperWidthMm;
  const topMm=bounds.top/scannerHeight*scannerPaperHeightMm;
  const sourceWidthMm=(bounds.right-bounds.left)/scannerWidth*scannerPaperWidthMm;
  const sourceHeightMm=(bounds.bottom-bounds.top)/scannerHeight*scannerPaperHeightMm;
  if(![sourceWidthMm,sourceHeightMm].every(n=>Number.isFinite(n)&&n>0))
    throw Error("Invalid calibrated scan scale.");
  const round=(n:number)=>Math.round(n*10)/10;
  let outsideCount=0;
  const converted=elements.map(part=>{
    if ((part.page??1)!==1) return part;
    if(![part.x,part.y,part.width,part.height].every(Number.isFinite))
      throw Error("Invalid element geometry during scan calibration.");
    // Normalized object bounding box in the selected source crop.
    let nx=(part.x-leftMm)/sourceWidthMm,ny=(part.y-topMm)/sourceHeightMm;
    let nw=part.width/sourceWidthMm,nh=part.height/sourceHeightMm;
    if(clockwiseRotation===90){
      [nx,ny,nw,nh]=[1-(ny+nh),nx,nh,nw];
    }else if(clockwiseRotation===180){
      [nx,ny]=[1-(nx+nw),1-(ny+nh)];
    }else if(clockwiseRotation===270){
      [nx,ny,nw,nh]=[ny,1-(nx+nw),nh,nw];
    }
    const x=round(nx*bounds.widthMm),y=round(ny*bounds.heightMm);
    const width=round(nw*bounds.widthMm),height=round(nh*bounds.heightMm);
    if(x<0||y<0||x+width>bounds.widthMm+.5||y+height>bounds.heightMm+.5)outsideCount++;
    return {...part,x,y,width,height,
      ...(typeof part.rotation==="number" ? {rotation:(part.rotation+clockwiseRotation)%360}: {})
    } as T;
  });
  return {elements:converted,outsideCount};
}
