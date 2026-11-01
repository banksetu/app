import test from "node:test";
import assert from "node:assert/strict";
import { estimatePassbookBounds } from "../src/layoutScanGeometry.ts";

function pixels(width, height, region) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    const onPaper = region && x >= region[0] && x < region[2] && y >= region[1] && y < region[3];
    data[p] = onPaper ? 226 : 255;
    data[p + 1] = onPaper ? 224 : 255;
    data[p + 2] = onPaper ? 214 : 255;
    data[p + 3] = 255;
  }
  return data;
}

test("A4 scanner background is not assumed to be the physical passbook", () => {
  const geometry = estimatePassbookBounds(pixels(200,100,[25,15,145,85]),200,100,210,297);
  assert.ok(geometry);
  assert.ok(Math.abs(geometry.widthMm - 126) < 3);
  assert.ok(Math.abs(geometry.heightMm - 207.9) < 5);
  assert.equal(geometry.reason.includes("Verify") || geometry.reason.includes("Measure"), true);
});

test("No reliable bounds from a completely white scanned page", () => {
  assert.equal(estimatePassbookBounds(pixels(200,100,null),200,100,210,297),null);
});

test("Malformed and zero-size scanner output is rejected", () => {
  assert.equal(estimatePassbookBounds(new Uint8ClampedArray(),0,0,210,297),null);
});
