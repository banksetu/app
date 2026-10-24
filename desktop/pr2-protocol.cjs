'use strict';
// Epson NPD0841-00 Rev A, sheets 43, 51, 54, 58–66, 73, 76–79, 83.
// Protocol profiles are deliberately independent from bank/customer templates.
const PROFILES=Object.freeze({
  'epson-plq20-pr2-v1':Object.freeze({id:'epson-plq20-pr2-v1',name:'Epson PLQ-20 / PLQ-20M · PR2',model:/\bPLQ[- ]?20(?:M)?\b/i,dpi:180,horizontalGraphicsDpi:120,verticalGraphicsDpi:180,maxWidthMm:245,maxHeightMm:297,hardwareVerified:false}),
});
// Passbooks must return through the front slot. PR2 ESC O is front output;
// FF outputs from the rear and is not the Direct Printer Send behavior wanted.
const C={start:Buffer.from([27,110]),identity:Buffer.from([27,90]),status:Buffer.from([27,106]),paper:Buffer.from([27,32,66]),end:Buffer.from([27,50]),waitPrint:Buffer.from([27,125,87]),eject:Buffer.from([27,79])};
const esc=text=>Buffer.concat([Buffer.from([27]),Buffer.from(text,'ascii')]);
function digits(n,width){if(!Number.isInteger(n)||n<0||n>=10**width)throw Error('Printer coordinate is out of range.');return String(n).padStart(width,'0');}
function status(frame,{allowNoPaper=false}={}){
 if(frame.length!==3||frame[0]!==27||frame[1]!==114)throw Error('Unrecognized PR2 status response.');
 const x=frame[2];
 if(x===0x50)return {ready:true};
 if((x&0xf0)===0x30){if(x&1)throw Error('Paper jam. Clear the printer manually; this job will not be resent.');if(x&4)throw Error('Printer cover is open.');if(x&8)throw Error('Printer rejected a PR2 command. Check the configured emulation/profile.');if(x&2){if(allowNoPaper)return {ready:false,noDocument:true};throw Error('Printer reports no document.');}}
 if((x&0xf0)===0x50)throw Error(x&4?'Printer is offline or its cover is open.':'Printer reached the paper margin; check printer-side calibration.');
 throw Error('Printer reports an error or unsupported status; no automatic reset is sent.');
}
function paper(frame){if(frame.length!==6||!frame.subarray(0,3).equals(Buffer.from([27,66,53]))||frame[4]!==27||frame[5]!==90||frame[3]<64||frame[3]>67)throw Error('Paper detection is unavailable: invalid PR2 response.');return ['absent','released','aligned','inserted'][frame[3]-64];}
function validateRaster(r){
 if(!r||r.dpi!==180||!Number.isInteger(r.width)||!Number.isInteger(r.height)||r.width<1||r.width>1736||r.height<1||r.height>2105||typeof r.bits!=='string'||r.bits.length>650000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.bits))throw Error('Invalid passbook raster.');
 const bits=Buffer.from(r.bits,'base64'),stride=Math.ceil(r.width/8);if(bits.length!==stride*r.height)throw Error('Passbook raster length mismatch.');
 return {bits,stride};
}
function rasterJob(r,settings){
 const {bits,stride}=validateRaster(r),profile=PROFILES[settings.profile];if(!profile)throw Error('This model has no documented graphics profile.');
 if(![216,240].includes(settings.verticalResolution)||![settings.offsetX,settings.offsetY].every(n=>Number.isFinite(n)&&Math.abs(n)<=10))throw Error('Confirm the printer vertical resolution and bounded calibration.');
 const ink=(x,y)=>y<r.height&&(bits[y*stride+(x>>3)]&(128>>(x&7)));
 let left=r.width,right=-1,top=r.height,bottom=-1;
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)if(ink(x,y)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)throw Error('The active passbook layout is blank.');
 const xMm=left*25.4/180+settings.offsetX,yMm=top*25.4/180+settings.offsetY;
 if(xMm<0||yMm<1||right*25.4/180+settings.offsetX>profile.maxWidthMm||bottom*25.4/180+settings.offsetY>profile.maxHeightMm)throw Error('Layout falls outside the supported printer area; no font or scaling was changed.');
 const width=right-left+1;
 // ESC L 000 feeds an aligned document normally. No reset, clamp, mode switch or forced eject.
 const chunks=[esc('L000'),esc('/1'+digits(Math.round(yMm*settings.verticalResolution/25.4),4)),esc('|A'+digits(Math.round(xMm*120/25.4),3)),Buffer.from([13]),esc('!G1'),esc('1C'+digits(width,4)+'000')];
 for(let y=top;y<=bottom;y+=24){
  const bytes=[];
  for(let x=left;x<=right;x++)for(let block=0;block<3;block++){
   let byte=0;for(let bit=0;bit<8;bit++)if(ink(x,y+block*8+bit))byte|=1<<bit;
   bytes.push(byte);if(byte===27)bytes.push(27); // PR2 image escape doubling, NOT ESC/P bit order.
  }
  chunks.push(Buffer.from(bytes));
  if(y+24<=bottom)chunks.push(Buffer.from([27,13,27,10]));
 }
 chunks.push(C.end);return chunks;
}
// Large approved layouts are sent as independent 24-dot BIM blocks. Each
// block has absolute X/Y coordinates, exits BIM with ESC 2, then queues the
// documented PR2 `ESC } W` print-completion barrier. Pixel positions are not
// scaled or reflowed; only transport framing changes.
function rasterBands(r,settings){
 const {bits,stride}=validateRaster(r),profile=PROFILES[settings.profile];if(!profile)throw Error('This model has no documented graphics profile.');
 if(![216,240].includes(settings.verticalResolution)||![settings.offsetX,settings.offsetY].every(n=>Number.isFinite(n)&&Math.abs(n)<=10))throw Error('Confirm the printer vertical resolution and bounded calibration.');
 const ink=(x,y)=>y<r.height&&(bits[y*stride+(x>>3)]&(128>>(x&7)));
 let left=r.width,right=-1,top=r.height,bottom=-1;
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)if(ink(x,y)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)throw Error('The active passbook layout is blank.');
 const xMm=left*25.4/180+settings.offsetX;
 if(xMm<0||top*25.4/180+settings.offsetY<1||right*25.4/180+settings.offsetX>profile.maxWidthMm||bottom*25.4/180+settings.offsetY>profile.maxHeightMm)throw Error('Layout falls outside the supported printer area; no font or scaling was changed.');
 const bands=[];
 for(let y=top;y<=bottom;y+=24){
  let bandLeft=right+1,bandRight=left-1;
  for(let x=left;x<=right;x++)for(let row=y;row<Math.min(y+24,r.height);row++)if(ink(x,row)){bandLeft=Math.min(bandLeft,x);bandRight=Math.max(bandRight,x);}
  if(bandRight<bandLeft)continue;
  const yMm=y*25.4/180+settings.offsetY,bandXmm=bandLeft*25.4/180+settings.offsetX,width=bandRight-bandLeft+1,bytes=[];
  for(let x=bandLeft;x<=bandRight;x++)for(let block=0;block<3;block++){
   let byte=0;for(let bit=0;bit<8;bit++)if(ink(x,y+block*8+bit))byte|=1<<bit;
   bytes.push(byte);if(byte===27)bytes.push(27);
  }
  bands.push(Buffer.concat([esc('/1'+digits(Math.round(yMm*settings.verticalResolution/25.4),4)),esc('|A'+digits(Math.round(bandXmm*120/25.4),3)),Buffer.from([13]),esc('!G1'),esc('1C'+digits(width,4)+'000'),Buffer.from(bytes),C.end,C.waitPrint]));
 }
 return {feed:esc('L000'),bands,pixels:{left,right,top,bottom},transport:'absolute-24-dot-bands'};
}

// Physical-size PR2 proof path. The approved PDFs are rasterized at 180 dpi,
// while PLQ-20 PR2 G1 columns and absolute X positions use a 120 dpi grid.
// Sending one 180 dpi source column as one G1 column expands artwork by 1.5x.
// This converter resamples only the transport grid; it never reflows, fits,
// scales or changes the source template's font/compression/coordinates.
function rasterBandsPhysical(r,settings){
 const {bits,stride}=validateRaster(r),profile=PROFILES[settings.profile];if(!profile)throw Error('This model has no documented graphics profile.');
 if(![216,240].includes(settings.verticalResolution)||![settings.offsetX,settings.offsetY].every(n=>Number.isFinite(n)&&Math.abs(n)<=10))throw Error('Confirm the printer vertical resolution and bounded calibration.');
 const sourceDpi=r.dpi,horizontalDpi=profile.horizontalGraphicsDpi;
 if(!Number.isInteger(horizontalDpi)||horizontalDpi<1||horizontalDpi>sourceDpi)throw Error('Invalid PR2 graphics density profile.');
 const ink=(x,y)=>x>=0&&x<r.width&&y>=0&&y<r.height&&(bits[y*stride+(x>>3)]&(128>>(x&7)));
 let left=r.width,right=-1,top=r.height,bottom=-1;
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)if(ink(x,y)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)throw Error('The active passbook layout is blank.');
 const leftMm=left*25.4/sourceDpi+settings.offsetX,rightMm=(right+1)*25.4/sourceDpi+settings.offsetX;
 const topMm=top*25.4/sourceDpi+settings.offsetY,bottomMm=(bottom+1)*25.4/sourceDpi+settings.offsetY;
 if(leftMm<0||topMm<1||rightMm>profile.maxWidthMm||bottomMm>profile.maxHeightMm)throw Error('Layout falls outside the supported printer area; no font or scaling was changed.');
 const ratio=horizontalDpi/sourceDpi,offsetColumns=Math.round(settings.offsetX*horizontalDpi/25.4),rows=new Map();
 // A 50% area threshold made a one-pixel stem print or disappear according to
 // its 180-dpi phase on the 120-dpi grid. That is why equal CSS text appeared
 // alternately light, heavy and narrow on the real PLQ-20 proof. Preserve each
 // contiguous source-ink run instead: map both physical edges to the global
 // printer grid and guarantee one native dot for a non-empty thin run. This is
 // deterministic for every row, keeps the source coordinates/70% compression,
 // and may make a sub-native-width stem one dot darker rather than deleting it.
 const outputRow=y=>{
  if(rows.has(y))return rows.get(y);
  const columns=new Set();
  if(y>=0&&y<r.height){
   for(let x=left;x<=right;){
    while(x<=right&&!ink(x,y))x++;
    if(x>right)break;
    const runStart=x;while(x<=right&&ink(x,y))x++;const runEnd=x;
    let outputStart=Math.round(runStart*ratio),outputEnd=Math.round(runEnd*ratio);
    if(outputEnd<=outputStart){outputStart=Math.floor((runStart+runEnd)*ratio/2);outputEnd=outputStart+1;}
    for(let column=outputStart;column<outputEnd;column++)columns.add(column);
   }
  }
  rows.set(y,columns);return columns;
 };
 const bands=[];
 for(let y=top;y<=bottom;y+=24){
  let outputLeft=Infinity,outputRight=-1;
  for(let row=y;row<Math.min(y+24,r.height);row++)for(const column of outputRow(row)){outputLeft=Math.min(outputLeft,column);outputRight=Math.max(outputRight,column);}
  if(outputRight<outputLeft)continue;
  const width=outputRight-outputLeft+1,bytes=[];
  for(let x=outputLeft;x<=outputRight;x++)for(let block=0;block<3;block++){
   let byte=0;for(let bit=0;bit<8;bit++)if(outputRow(y+block*8+bit).has(x))byte|=1<<bit;
   bytes.push(byte);if(byte===27)bytes.push(27);
  }
  const yMm=y*25.4/sourceDpi+settings.offsetY,xColumns=outputLeft+offsetColumns;
  if(xColumns<0)throw Error('Layout falls outside the supported printer area; no font or scaling was changed.');
  bands.push(Buffer.concat([esc('/1'+digits(Math.round(yMm*settings.verticalResolution/25.4),4)),esc('|A'+digits(xColumns,3)),Buffer.from([13]),esc('!G1'),esc('1C'+digits(width,4)+'000'),Buffer.from(bytes),C.end,C.waitPrint]));
 }
 const outputLeft=Math.floor(left*ratio),outputRight=Math.ceil((right+1)*ratio)-1;
 return {
  feed:esc('L000'),bands,pixels:{left,right,top,bottom},
  transport:'physical-120dpi-horizontal-24-dot-bands',
  density:{sourceDpi,horizontalDpi,verticalGraphicsDpi:profile.verticalGraphicsDpi,verticalPositionUnits:settings.verticalResolution},
  physical:{sourceWidthMm:(right-left+1)*25.4/sourceDpi,outputWidthMm:(outputRight-outputLeft+1)*25.4/horizontalDpi,topMm,bottomMm}
 };
}

module.exports={PROFILES,C,status,paper,validateRaster,rasterJob,rasterBands,rasterBandsPhysical};
