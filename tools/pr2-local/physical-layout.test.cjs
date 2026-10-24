const test=require('node:test'),assert=require('node:assert/strict');
const {rasterBandsPhysical}=require('../../desktop/pr2-protocol.cjs');
const settings={profile:'epson-plq20-pr2-v1',verticalResolution:216,offsetX:0,offsetY:0};
function rectangle(width,height=32,left=0,right=width-1){
 const stride=Math.ceil(width/8),bits=Buffer.alloc(stride*height);
 for(let y=8;y<height;y++)for(let x=left;x<=right;x++)bits[y*stride+(x>>3)]|=128>>(x&7);
 return {width,height,dpi:180,bits:bits.toString('base64')};
}
function verticalLines(width,columns,height=32){
 const stride=Math.ceil(width/8),bits=Buffer.alloc(stride*height);
 for(let y=8;y<height;y++)for(const x of columns)bits[y*stride+(x>>3)]|=128>>(x&7);
 return {width,height,dpi:180,bits:bits.toString('base64')};
}
const close=(actual,expected,tolerance=.001)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const xPosition=band=>Number(/\x1b\|A(\d{3})/.exec(band.toString('latin1'))[1]);
function printedColumns(band){
 const marker=/\x1b1C(\d{4})000/.exec(band.toString('latin1')),width=Number(marker[1]),start=marker.index+10,end=band.length-5,raw=[];
 for(let i=start;i<end;i++){raw.push(band[i]);if(band[i]===27&&band[i+1]===27)i++;}
 assert.equal(raw.length,width*3);let count=0;
 for(let x=0;x<width;x++)if(raw[x*3]||raw[x*3+1]||raw[x*3+2])count++;
 return count;
}

test('180 dpi source is converted to the PR2 120 dpi grid without changing physical width',()=>{
 const plan=rasterBandsPhysical(rectangle(180),settings);
 assert.equal(plan.density.sourceDpi,180);assert.equal(plan.density.horizontalDpi,120);
 close(plan.physical.sourceWidthMm,25.4);close(plan.physical.outputWidthMm,25.4);
 assert.equal(plan.transport,'physical-120dpi-horizontal-24-dot-bands');
});

test('70 percent compressed artwork remains 70 percent after PR2 conversion',()=>{
 const normal=rasterBandsPhysical(rectangle(180),settings);
 const compressed=rasterBandsPhysical(rectangle(126),settings);
 close(compressed.physical.sourceWidthMm/normal.physical.sourceWidthMm,.7);
 close(compressed.physical.outputWidthMm/normal.physical.outputWidthMm,.7);
});

test('different bank layout widths retain their own physical dimensions',()=>{
 const small=rasterBandsPhysical(rectangle(900),settings);
 const large=rasterBandsPhysical(rectangle(1400),settings);
 close(small.physical.sourceWidthMm,127);close(small.physical.outputWidthMm,127);
 close(large.physical.sourceWidthMm,197.5555555556);close(large.physical.outputWidthMm,197.4853333333,0.22);
 assert.ok(large.physical.outputWidthMm>small.physical.outputWidthMm);
});

test('alignment is a bounded whole-layout translation and never a font scale',()=>{
 const raster=rectangle(300,32,90,269);
 const base=rasterBandsPhysical(raster,settings),shifted=rasterBandsPhysical(raster,{...settings,offsetX:2});
 assert.equal(base.physical.sourceWidthMm,shifted.physical.sourceWidthMm);
 assert.equal(base.physical.outputWidthMm,shifted.physical.outputWidthMm);
 assert.equal(xPosition(shifted.bands[0])-xPosition(base.bands[0]),Math.round(2*120/25.4));
 assert.throws(()=>rasterBandsPhysical(raster,{...settings,offsetX:11}),/bounded calibration/);
});

test('one thin source column never becomes multiple bold native columns',()=>{
 const plan=rasterBandsPhysical(rectangle(20,32,0,0),settings);
 assert.equal(plan.bands.length,1);
 assert.ok(plan.physical.outputWidthMm<=25.4/120+.0001);
});

test('equal one-pixel stems survive every 180-to-120 grid phase with equal weight',()=>{
 const plan=rasterBandsPhysical(verticalLines(12,[0,3,6,9]),settings);
 assert.equal(plan.bands.length,1);
 assert.equal(printedColumns(plan.bands[0]),4);
});

test('separate thin stems do not disappear from account or customer rows',()=>{
 const plan=rasterBandsPhysical(verticalLines(12,[1,4,7,10]),settings);
 assert.equal(printedColumns(plan.bands[0]),4);
});

test('out-of-range artwork is rejected instead of fitted, cropped or silently scaled',()=>{
 const tooWide=rectangle(1736);
 assert.throws(()=>rasterBandsPhysical(tooWide,{...settings,offsetX:1}),/outside/);
});
