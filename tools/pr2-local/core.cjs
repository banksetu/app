'use strict';
const {C,status,paper,rasterJob}=require('./pr2-protocol.cjs');
const hex=b=>Buffer.from(b).toString('hex').match(/../g)?.join(' ')||'';
function proof(resolution){
 const width=360,height=180,stride=Math.ceil(width/8),bits=Buffer.alloc(stride*height);
 // Synthetic 25.4 x 12.7 mm box at 12.7 mm from left, 5 mm from top.
 for(let y=36;y<126;y++)for(let x=90;x<270;x++)if(y===36||y===125||x===90||x===269)bits[y*stride+(x>>3)]|=128>>(x&7);
 return rasterJob({dpi:180,width,height,bits:bits.toString('base64')},{profile:'epson-plq20-pr2-v1',verticalResolution:resolution,offsetX:0,offsetY:0});
}
async function run({io,action,resolution,approve,log,fence}){
 if(!['diagnose','feed','print','eject'].includes(action))throw Error('Unsupported action');
 if(action==='print'&&![216,240].includes(resolution))throw Error('Select printer configuration resolution 216 or 240');
 const tx=async(label,b)=>{log({direction:'TX',label,hex:hex(b)});await io.write(b);};
 const query=async(label,b,n)=>{await tx(label,b);const r=await io.read(n);log({direction:'RX',label,hex:hex(r)});return r;};
 await tx('control-procedure',C.start);
 const identity=await query('identity',C.identity,3);
 if(!identity.equals(Buffer.from([27,47,55])))throw Error('Unknown identity; stop without feed/print/eject');
 const s=await query('status',C.status,3);
 // Preserve raw evidence before strict existing parser rejects it; never guess readiness.
 status(s,{allowNoPaper:true});
 let p=paper(await query('paper',C.paper,6));log({paper:p});
 if(action==='diagnose')return {transportAcknowledged:true,physicalVerified:false};
 if(['feed','print'].includes(action)&&!['aligned','inserted'].includes(p))throw Error('Insert disposable test passbook and rerun after inspecting it');
 if(!await approve(action))throw Error('Local approval declined');
 await fence(); // durable review marker BEFORE first motion byte; never auto replay
 if(action==='feed')await tx('feed',Buffer.from([27,76,48,48,48]));
 if(action==='eject')await tx('eject',C.eject);
 if(action==='print')for(const b of proof(resolution))await tx('synthetic-print',b);
 status(await query('post-status',C.status,3),{allowNoPaper:true});
 p=paper(await query('post-paper',C.paper,6));log({paper:p});
 return {transportAcknowledged:true,physicalVerified:false,requiresHumanConfirmation:true};
}
module.exports={run,hex,proof};
