/**
 * Conservative A4 scanner estimator. This is a proposal, never an automatic
 * source of truth: white passbooks can be indistinguishable from white scanner
 * paper, and printer "fit to page" may invalidate the scale.
 */
export type ScanBounds = {
  left: number; top: number; right: number; bottom: number;
  widthMm: number; heightMm: number; confidence: "low" | "medium";
  reason: string;
};
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
    confidence: cornerHits >= 3 ? "medium" : "low",
    reason: cornerHits >= 3
      ? "Outer contrast visible near corners. Verify against the real passbook before applying."
      : "Likely content bounds only; blank margins may belong to the passbook. Measure manually before applying.",
  };
}

/** Shift A4 positions into the measured passbook's own physical coordinate system.
 * Do not silently remove elements even when the scan estimator puts them outside
 * the tentative crop; they may be real border text requiring manual review.
 */
export function mapScannedPageToPassbook<T extends { x:number;y:number;width:number;height:number;page?:number }>(
  bounds:ScanBounds,
  scannerWidth:number,
  scannerHeight:number,
  scannerPaperWidthMm:number,
  scannerPaperHeightMm:number,
  elements:T[],
): { elements:T[]; outsideCount:number } {
  if (![scannerWidth,scannerHeight,scannerPaperWidthMm,scannerPaperHeightMm].every(n=>Number.isFinite(n)&&n>0) ||
    ![bounds.left,bounds.top,bounds.right,bounds.bottom,bounds.widthMm,bounds.heightMm].every(Number.isFinite) ||
    bounds.widthMm<=0 || bounds.heightMm<=0 ||
    bounds.left<0 || bounds.top<0 || bounds.right>scannerWidth || bounds.bottom>scannerHeight ||
    bounds.right<=bounds.left || bounds.bottom<=bounds.top) throw Error("Invalid scanner coordinate frame.");
  const leftMm=bounds.left/scannerWidth*scannerPaperWidthMm;
  const topMm=bounds.top/scannerHeight*scannerPaperHeightMm;
  const round=(n:number)=>Math.round(n*10)/10;
  let outsideCount=0;
  const converted=elements.map(part=>{
    if ((part.page||1)!==1) return part;
    const x=round(part.x-leftMm),y=round(part.y-topMm);
    if(x<0||y<0||x+part.width>bounds.widthMm+.5||y+part.height>bounds.heightMm+.5)outsideCount++;
    return {...part,x,y};
  });
  return {elements:converted,outsideCount};
}
