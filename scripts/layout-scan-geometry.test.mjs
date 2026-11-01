import test from "node:test";
import assert from "node:assert/strict";
import { estimatePassbookBounds, estimatePassbookFold, mapScannedPageToPassbook } from "../src/layoutScanGeometry.ts";

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

test("A4 crop repositions coordinate origins and leaves other PDF pages alone", () => {
  const bounds={left:20,top:15,right:160,bottom:105,widthMm:147,heightMm:178.2,confidence:"low",reason:"ruler required"};
  const parts=[
    {page:1,x:31.5,y:44.55,width:40,height:5,label:"Account No"},
    {page:2,x:31.5,y:44.55,width:40,height:5,label:"Page 2"}
  ];
  const mapped=mapScannedPageToPassbook(bounds,200,150,210,297,parts);
  assert.equal(mapped.elements[0].x,10.5);
  assert.ok(Math.abs(mapped.elements[0].y-14.85)<=0.11,"rounding is at 0.1 mm precision");
  assert.deepEqual(mapped.elements[1],parts[1]);
  assert.equal(parts[0].x,31.5,"original importer data is untouched");
});

test("invalid scanner crop is never applied", () => {
  const b={left:100,top:50,right:50,bottom:90,widthMm:20,heightMm:50,confidence:"low",reason:""};
  assert.throws(()=>mapScannedPageToPassbook(b,200,150,210,297,[]));
});

test("non-finite and unsafe scanner frames cannot estimate passbook dimensions", () => {
  const scan=pixels(200,100,[25,15,145,85]);
  assert.equal(estimatePassbookBounds(scan,200,100,Number.NaN,297),null);
  assert.equal(estimatePassbookBounds(scan,200,100,210,Number.POSITIVE_INFINITY),null);
  assert.equal(estimatePassbookBounds(scan,200.5,100,210,297),null);
  assert.equal(estimatePassbookBounds(scan,Number.POSITIVE_INFINITY,100,210,297),null);
});

test("non-finite manual crop geometry is blocked before shifting customer fields", () => {
  const valid={left:20,top:15,right:160,bottom:105,widthMm:147,heightMm:178.2,confidence:"low",reason:"reference"};
  const parts=[{page:1,x:31,y:40,width:20,height:5}];
  for (const invalid of [
    {...valid,left:Number.NaN},
    {...valid,right:Number.POSITIVE_INFINITY},
    {...valid,widthMm:0},
    {...valid,heightMm:Number.NaN},
  ]) {
    assert.throws(()=>mapScannedPageToPassbook(invalid,200,150,210,297,parts));
  }
  assert.equal(parts[0].x,31);
});

test("fold-gap estimator proposes a reviewable midpoint when two printed halves are separated",()=>{
  const width=200,height=180,scan=pixels(width,height,null);
  const ink=(x0,y0,x1,y1)=>{
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const p=(y*width+x)*4;
      scan[p]=70;scan[p+1]=70;scan[p+2]=70;scan[p+3]=255;
    }
  };
  ink(20,15,180,78);
  ink(20,101,180,165);
  const bounds={left:20,top:15,right:180,bottom:165,widthMm:190,heightMm:175,confidence:"low",reason:"test"};
  const proposal=estimatePassbookFold(scan,width,height,bounds);
  assert.ok(proposal,"expected an unverified fold gap");
  assert.ok(proposal.foldMm>70&&proposal.foldMm<105);
  assert.equal(proposal.confidence,"low");
});

test("completely blank A4 paper never invents a fold",()=>{
  const bounds={left:10,top:10,right:190,bottom:170,widthMm:190,heightMm:175,confidence:"low",reason:"test"};
  assert.equal(estimatePassbookFold(pixels(200,180,null),200,180,bounds),null);
});

test("manual crop conversion rejects invalid numeric frames and stays non-mutating",()=>{
  const bounds={left:10,top:10,right:190,bottom:170,widthMm:180,heightMm:180,confidence:"low",reason:"test"};
  const data=[{x:10,y:30,width:20,height:5}];
  assert.throws(()=>mapScannedPageToPassbook({...bounds,left:NaN},200,180,210,297,data));
  assert.deepEqual(data,[{x:10,y:30,width:20,height:5}]);
});
