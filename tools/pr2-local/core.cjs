'use strict';
const {C,status,paper,rasterJob}=require('./pr2-protocol.cjs');
const hex=b=>Buffer.from(b).toString('hex').match(/../g)?.join(' ')||'';
// Epson NPD0841-00, sheet 57: ESC } - measures width and, when aligned,
// inserts the document. ESC S followed by four ASCII decimal digits is a
// measurement, never a ready/status response. Width units are 1/240 inch.
function widthMeasurement(frame){
 if(frame.length!==6||frame[0]!==27||frame[1]!==83||!frame.subarray(2).every(x=>x>=48&&x<=57))throw Error('Invalid PR2 paper-width measurement response; motion state uncertain');
 const units=Number(frame.subarray(2).toString('ascii'));
 if(units===0||units>3000)throw Error('PR2 paper-width measurement outside supported test range; motion state uncertain');
 return {widthUnits:units,widthMm:Math.round(units*25.4/240*10)/10};
}
function proof(resolution){
 const width=360,height=180,stride=Math.ceil(width/8),bits=Buffer.alloc(stride*height);
 // Synthetic 25.4 x 12.7 mm box at 12.7 mm from left, 5 mm from top.
 for(let y=36;y<126;y++)for(let x=90;x<270;x++)if(y===36||y===125||x===90||x===269)bits[y*stride+(x>>3)]|=128>>(x&7);
 return rasterJob({dpi:180,width,height,bits:bits.toString('base64')},{profile:'epson-plq20-pr2-v1',verticalResolution:resolution,offsetX:0,offsetY:0});
}
const FONT={
 ' ':['00000','00000','00000','00000','00000','00000','00000'],'-':['00000','00000','00000','11111','00000','00000','00000'],'/':['00001','00010','00100','01000','10000','00000','00000'],':':['00000','00100','00100','00000','00100','00100','00000'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['01110','00100','00100','00100','00100','00100','01110'],J:['00001','00001','00001','00001','10001','10001','01110'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111']
};
function makeSampleRaster(){
 const width=1260,height=420,stride=Math.ceil(width/8),bits=Buffer.alloc(stride*height);
 const dot=(x,y)=>{if(x>=0&&x<width&&y>=0&&y<height)bits[y*stride+(x>>3)]|=128>>(x&7);};
 const line=(x1,y1,x2,y2)=>{if(y1===y2)for(let x=x1;x<=x2;x++)dot(x,y1);else for(let y=y1;y<=y2;y++)dot(x1,y);};
 const text=(x,y,value,scale=3)=>{for(const ch of value){const rows=FONT[ch]||FONT[' '];for(let ry=0;ry<7;ry++)for(let rx=0;rx<5;rx++)if(rows[ry][rx]==='1')for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)dot(x+rx*scale+sx,y+ry*scale+sy);x+=6*scale;}};
 // Synthetic content only. Geometry is intentionally independent of every
 // approved customer/passbook template and exists solely to verify PR2 output.
 line(72,28,1188,28);line(72,374,1188,374);line(72,28,72,374);line(1188,28,1188,374);
 text(108,55,'BANK SETU PR2 TEST',4);
 text(108,105,'SYNTHETIC PASSBOOK SAMPLE',3);
 line(108,136,1110,136);
 text(108,160,'NAME  TEST CUSTOMER',3);
 text(108,202,'A/C   000000000000',3);
 text(108,244,'ID    TEST-0001',3);
 text(108,286,'DATE  23-10-2026',3);
 text(108,330,'NO CUSTOMER DATA',3);
 return {dpi:180,width,height,bits:bits.toString('base64')};
}
function sampleProof(resolution){return rasterJob(makeSampleRaster(),{profile:'epson-plq20-pr2-v1',verticalResolution:resolution,offsetX:0,offsetY:0});}
async function run({io,action,resolution,approve,log,fence,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!['diagnose','measure-width','feed','print','eject'].includes(action))throw Error('Unsupported action');
 if(action==='print'&&![216,240].includes(resolution))throw Error('Select printer configuration resolution 216 or 240');
 const tx=async(label,b)=>{log({direction:'TX',label,hex:hex(b)});await io.write(b);};
 const direct=typeof io.capture==='function';
 const query=async(label,b,n)=>{await tx(label,b);const r=direct?await io.capture():await io.read(n);log({direction:'RX',label,hex:hex(r)});if(r.length!==n)throw Error('Incomplete or mixed PR2 response; printer motion state uncertain');return r;};
 if(direct&&(await io.capture()).length)throw Error('Stale USB input; no motion');
 await tx('control-procedure',C.start);
 if(direct&&(await io.capture()).length)throw Error('Unexpected response to PR2 initialization; no motion');
 const identity=await query('identity',C.identity,3);
 if(!identity.equals(Buffer.from([27,47,55])))throw Error('Unknown identity; stop without feed/print/eject');
 const s=await query('status',C.status,3);
 // Preserve raw evidence before strict existing parser rejects it; never guess readiness.
 const initialStatus=status(s,{allowNoPaper:true});
 let p=paper(await query('paper',C.paper,6));log({paper:p});
 if(action==='diagnose')return {transportAcknowledged:true,physicalVerified:false};
 if(action==='print'&&initialStatus.ready!==true)throw Error('Printer did not report ready; no print proof sent');
 if(action==='measure-width'&&(initialStatus.ready!==true||p!=='aligned'))throw Error('Width diagnostic requires ready printer and a newly aligned disposable document');
 if(['feed','print'].includes(action)&&!['aligned','inserted'].includes(p))throw Error('Insert disposable test passbook and rerun after inspecting it');
 if(!await approve(action))throw Error('Local approval declined');
 await fence(); // durable review marker BEFORE first motion byte; never auto replay
 if(action==='measure-width'){
  const measured=widthMeasurement(await query('width-measurement',Buffer.from([27,125,45]),6));
  log({measurement:measured});
  const after=status(await query('after-measure-status',C.status,3),{allowNoPaper:true});
  p=paper(await query('after-measure-paper',C.paper,6));log({paper:p});
  if(after.ready!==true||p!=='inserted')throw Error('Width measurement did not confirm ready and inserted paper; no print data sent or automatic retry');
  return {...measured,paper:p,transportAcknowledged:true,physicalVerified:false,requiresHumanConfirmation:true};
 }
 if(action==='feed')await tx('feed',Buffer.from([27,76,48,48,48]));
 if(action==='eject')await tx('eject',C.eject);
 if(action==='print'){
  const chunks=proof(resolution);
  await tx('print-feed',chunks[0]);
  // An aligned document is at the feeder, not at the print position. Never
  // stream image bytes until the printer reports that it actually inserted it.
  for(let attempt=0;attempt<5;attempt++){
   p=paper(await query('after-feed-paper',C.paper,6));log({paper:p});
   if(p==='inserted'||p!=='aligned')break;
   if(attempt<4)await wait(500); // Read-only observation; never resend feed.
  }
  const feedStatus=status(await query('after-feed-status',C.status,3),{allowNoPaper:true});
  if(feedStatus.ready!==true)throw Error('Printer is not ready after feed; graphics stopped. No automatic retry.');
  if(p!=='inserted')throw Error('Feed was not confirmed (paper='+p+'); graphics stopped. No automatic retry.');
  for(const b of chunks.slice(1))await tx('synthetic-print',b);
 }
 status(await query('post-status',C.status,3),{allowNoPaper:true});
 p=paper(await query('post-paper',C.paper,6));log({paper:p});
 return {transportAcknowledged:true,physicalVerified:false,requiresHumanConfirmation:true};
}
module.exports={run,hex,proof,makeSampleRaster,sampleProof,widthMeasurement};
