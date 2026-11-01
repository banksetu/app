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
  if (!width || !height || pixels.length < width * height * 4 || paperWidthMm <= 0 || paperHeightMm <= 0) return null;
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
