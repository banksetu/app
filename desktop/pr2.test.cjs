const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {C,status,paper,rasterJob,rasterBands,rasterBandsPhysical}=require('./pr2-protocol.cjs');
const {createBridge}=require('./pr2-bridge.cjs');
const settings={profile:'epson-plq20-pr2-v1',verticalResolution:240,offsetX:0,offsetY:0,confirmModel:true,confirmMode:true,acceptRaster:true};
const device={id:'synthetic-device',name:'EPSON PLQ-20',transport:'usb-direct'},scope='synthetic:user:tenant:connection';
function raster(){const bits=Buffer.alloc(100);bits[10]=128;bits[11]=128;bits[13]=128;bits[14]=128;return {width:8,height:100,dpi:180,bits:bits.toString('base64')};}
function fixture(t,options={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-pr2-'));t.after(()=>fs.rmSync(directory,{force:true,recursive:true}));
 let time=0,last,ejected=false,fed=false,ejectReads=0,closed=false,writes=[],paperIndex=0,statusIndex=0,fail=options.fail;
 const noReply=b=>b.equals(Buffer.from([27,108]))||b.equals(Buffer.from([27,46]))||b.equals(Buffer.from([27,85,96]))||b.equals(Buffer.from([27,83,53]))||b.subarray(0,2).equals(Buffer.from([27,39]))||b.subarray(0,2).equals(Buffer.from([27,38]))||b.subarray(0,2).equals(Buffer.from([27,81]))||b.equals(Buffer.from([27,35,48]))||b.equals(Buffer.from([27,76,48,48,48]))||b.equals(C.eject);
 const io={async handshake(){if(options.offline)throw Error('Bridge unavailable');},async list(){return {devices:options.devices||[device],queues:[{name:'Default office laser'}]};},async open(){closed=false;ejected=false;fed=false;ejectReads=0;last=null;},close(){closed=true;},async write(b){if(closed)throw Error('closed');last=b;writes.push(b);if(fail&&b.includes(C.end))throw Error('communication lost');if(b.equals(Buffer.from([27,76,48,48,48])))fed=true;if(b.equals(C.eject))ejected=true;},async read(){if(last.equals(C.identity))return Buffer.from(options.wrongMode?[27,47,47]:[27,47,55]);if(last.equals(Buffer.from([27,105])))return Buffer.from([27,112,81,0,0,0]);if(last.equals(C.status)){const values=options.statuses||[options.status||80],value=values[Math.min(statusIndex++,values.length-1)];return Buffer.from([27,114,value]);}if(last.equals(C.paper)){const state=ejected?(ejectReads++<(options.releaseDelay||0)?67:65):(options.paper?.[Math.min(paperIndex++,options.paper.length-1)]??(fed?67:66));return Buffer.from([27,66,53,state,27,90]);}throw Error('unexpected read');},async capture(){if(!last)return Buffer.from(options.stale?[27,114,80]:[]);if(last.equals(C.start))return Buffer.from(options.afterStart?[27,47,55]:[]);if(options.shifted&&last.equals(C.status))return Buffer.from([27,47,55]);if(noReply(last))return Buffer.alloc(0);if(ejected&&last.equals(C.paper)&&ejectReads<(options.silentEjectReads||0)){ejectReads++;return Buffer.alloc(0);}return io.read();}};
 const args={directory,transport:()=>io,authorize:s=>{assert.equal(s,scope,'workspace authorization');},now:()=>time,wait:async ms=>{time+=ms;if(options.onWait)await options.onWait();},progress:options.progress};
 const bridge=createBridge(args),request={scope,id:crypto.randomUUID(),device,settings,raster:raster()};return {bridge,request,writes,io,directory,restart:()=>createBridge(args),clearFail:()=>fail=false};
}
test('status and paper framing reject unsupported responses and identify jam/offline',()=>{
 assert.equal(status(Buffer.from([27,114,80])).ready,true);assert.equal(status(Buffer.from([27,114,50]),{allowNoPaper:true}).noDocument,true);
 assert.throws(()=>status(Buffer.from([27,114,49])),/jam/);assert.throws(()=>status(Buffer.from([27,114,84])),/offline/);assert.throws(()=>status(Buffer.from([0,0,0])),/Unrecognized/);
 assert.equal(paper(Buffer.from([27,66,53,64,27,90])),'absent');assert.throws(()=>paper(Buffer.from([27,66,53,70,27,90])),/unavailable/);
});
test('graphics preserves NUL, doubles ESC and uses PR2 top-LSB column packing',()=>{
 const chunks=rasterJob(raster(),settings);assert.deepEqual(chunks[6],Buffer.from([27,27,0,0]));
 assert.ok(chunks[0].equals(Buffer.from([27,76,48,48,48])));assert.ok(chunks.at(-1).equals(C.end));
 assert.throws(()=>rasterJob({...raster(),bits:'AAAA'},settings),/length/);
 assert.throws(()=>rasterJob(raster(),{...settings,offsetX:-10}),/outside/);
 assert.throws(()=>rasterJob(raster(),{...settings,profile:'plq35'}),/profile/);
});
test('banded graphics preserves pixels with one feed and a completion barrier per block',()=>{
 const input=raster(),bits=Buffer.from(input.bits,'base64');bits[80]=128;input.bits=bits.toString('base64');
 const plan=rasterBands(input,settings);assert.ok(plan.feed.equals(Buffer.from([27,76,48,48,48])));assert.ok(plan.bands.length>1);
 for(const band of plan.bands){assert.ok(band.includes(C.end));assert.ok(band.subarray(-C.waitPrint.length).equals(C.waitPrint));assert.ok(band.length<5000);}
});
test('device completion is confirmed; repeat identity is not resent even after restart',async t=>{
 const f=fixture(t);assert.equal((await f.bridge.print(f.request)).completed,true);const count=f.writes.length;
 assert.equal(f.writes.filter(b=>b.equals(C.status)).length,3+rasterBandsPhysical(raster(),settings).bands.length);
 assert.equal((await f.restart().print(f.request)).replayed,true);assert.equal(f.writes.length,count);
 const disk=fs.readFileSync(path.join(f.directory,'pr2-state-v1.json'),'utf8');assert.ok(!disk.includes(f.request.raster.bits));assert.ok(!disk.includes(scope));
});
test('direct job uses the physically proven automatic PR2 setup before one feed',async t=>{
 const f=fixture(t);assert.equal((await f.bridge.print({...f.request,settings:{...settings,paperLengthMm:175,passbookType:'horizontal'}})).completed,true);
 const index=bytes=>f.writes.findIndex(value=>value.equals(Buffer.from(bytes)));
 assert.ok(index([27,105])<index([27,46]));assert.ok(index([27,46])<index([27,85,96]));assert.ok(index([27,85,96])<index([27,76,48,48,48]));
 assert.equal(f.writes.filter(value=>value.equals(Buffer.from([27,76,48,48,48]))).length,1);
});
test('known blinking command-error state is cleared once before tested setup',async t=>{
 const f=fixture(t,{statuses:[56,80]});const result=await f.bridge.print(f.request);assert.equal(result.completed,true,result.message);
 assert.equal(f.writes.filter(value=>value.equals(Buffer.from([27,108]))).length,1);
});
test('front release waits without resending ESC O',async t=>{
 const f=fixture(t,{releaseDelay:3});assert.equal((await f.bridge.print(f.request)).completed,true);
 assert.equal(f.writes.filter(b=>b.equals(C.eject)).length,1);
});
test('front release tolerates temporary silent USB observations without resending ESC O',async t=>{
 const f=fixture(t,{silentEjectReads:3});assert.equal((await f.bridge.print(f.request)).completed,true);
 assert.equal(f.writes.filter(b=>b.equals(C.eject)).length,1);
});
test('permanently silent eject observation is uncertain and never reported complete',async t=>{
 const f=fixture(t,{silentEjectReads:20}),result=await f.bridge.print(f.request);
 assert.equal(result.state,'uncertain');assert.match(result.message,/status channel stayed silent/);assert.equal(f.writes.filter(b=>b.equals(C.eject)).length,1);
});
test('absent paper waits for later insertion without printing early',async t=>{
 const notices=[];const f=fixture(t,{paper:[64,64,66,66,67,67],progress:e=>notices.push(e.message)});
 const result=await f.bridge.print(f.request);assert.equal(result.completed,true,result.message);assert.ok(notices.includes('Please insert your passbook.'));
});
test('aligned paper that fails to feed stops before graphics and fences retry',async t=>{
 const f=fixture(t,{paper:[66,66,66]});const result=await f.bridge.print(f.request);
 assert.equal(result.state,'uncertain');assert.match(result.message,/Paper feed not confirmed/);
 assert.ok(f.writes.some(b=>b.equals(Buffer.from([27,76,48,48,48]))));
 assert.ok(!f.writes.some(b=>b.subarray(0,3).equals(Buffer.from([27,49,67]))));
 await assert.rejects(f.bridge.print({...f.request,id:crypto.randomUUID()}),/interrupted/);
});
test('delayed feed is observed without resending motion',async t=>{
 const f=fixture(t,{paper:[66,66,66,67]});const result=await f.bridge.print(f.request);
 assert.equal(result.completed,true,result.message);
 assert.equal(f.writes.filter(b=>b.equals(Buffer.from([27,76,48,48,48]))).length,1);
});
test('no paper has bounded wait and no feeding bytes',async t=>{
 const f=fixture(t,{paper:[64]});const result=await f.bridge.print(f.request);assert.equal(result.completed,false);assert.match(result.message,/60 seconds/);assert.ok(!f.writes.some(b=>b[1]===76));
});
test('cancel before paper insertion sends no print job',async t=>{
 let f;f=fixture(t,{paper:[64],onWait:()=>f.bridge.cancel(scope,f.request.id)});
 assert.equal((await f.bridge.print(f.request)).state,'cancelled');assert.ok(!f.writes.some(b=>b[1]===76));
});
test('communication uncertainty fences device across restarts until explicit review',async t=>{
 const f=fixture(t,{fail:true});assert.equal((await f.bridge.print(f.request)).state,'uncertain');
 await assert.rejects(f.restart().print({...f.request,id:crypto.randomUUID()}),/interrupted/);
 f.clearFail();f.bridge.acknowledge(scope,device.id);assert.equal((await f.bridge.print({...f.request,id:crypto.randomUUID()})).completed,true);
});
test('wrong mode/disconnected device fails without graphics',async t=>{
 for(const options of [{wrongMode:true},{offline:true}]){const f=fixture(t,options);assert.equal((await f.bridge.print(f.request)).completed,false);assert.ok(!f.writes.some(b=>b[1]===76));}
});
test('stale and shifted USB responses stop before any feed or raster',async t=>{
 for(const options of [{stale:true},{afterStart:true},{shifted:true}]){
  const f=fixture(t,options),result=await f.bridge.print(f.request);
  assert.equal(result.completed,false);
  assert.ok(!f.writes.some(b=>b.equals(C.eject)||b[1]===76));
 }
});
test('multiple compatible devices remain separate; default spooler is not selected',async t=>{
 const f=fixture(t,{devices:[device,{...device,id:'second'}]});const list=await f.bridge.discover(scope);assert.equal(list.devices.length,2);assert.equal(list.preferences,undefined);assert.ok(list.devices.every(d=>d.profile));
 for(const name of ['EPSON PLQ-35','EPSON PLQ-80'])assert.equal((await f.bridge.probe(scope,{...device,name},settings)).pr2,true);
 await assert.rejects(f.bridge.probe(scope,{...device,name:'EPSON PLQ-32'},settings),/profile/);
});
test('read-only printer discovery safely retries one interrupted helper before printing',async t=>{
 let attempts=0;const f=fixture(t);const bridge=createBridge({directory:f.directory,authorize:s=>assert.equal(s,scope),transport:()=>{attempts++;if(attempts===1)return {async handshake(){throw Error('Printer detection stopped before any print data was sent.');},close(){}};return f.io;}});
 const list=await bridge.discover(scope);assert.equal(attempts,2);assert.equal(list.devices.length,1);assert.equal(f.writes.length,0);
});
test('cross-tenant requests, probes, discovery and cancellation are rejected',async t=>{
 const f=fixture(t);await assert.rejects(f.bridge.print({...f.request,scope:'other'}),/authorization/);await assert.rejects(f.bridge.discover('other'),/authorization/);await assert.rejects(f.bridge.probe('other',device,settings),/authorization/);assert.throws(()=>f.bridge.cancel('other',f.request.id),/authorization/);
});
test('double click while waiting cannot create two jobs',async t=>{
 let f,checked=false;f=fixture(t,{paper:[64,66,66,67,67],onWait:async()=>{if(!checked){checked=true;await assert.rejects(f.bridge.print(f.request),/active request/);}}});const result=await f.bridge.print(f.request);assert.equal(result.completed,true,result.message);
});
test('platform gate precedes customer lookup and obsolete HTTP path is gone',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/Passbook.tsx'),'utf8');const handler=source.slice(source.indexOf('const directPrinterSend'),source.indexOf('const directPrintCompleted'));
 assert.ok(handler.indexOf('windowsPr2()')<handler.indexOf('!previewCustomer'));assert.match(handler,/showMessage\(WINDOWS_PR2_MESSAGE\)/);assert.ok(!source.includes('18181/print-pr2'));
 assert.match(fs.readFileSync(path.join(__dirname,'../src/platform/pr2.ts'),'utf8'),/Please use this button on only Windows EXE mode\./);
});
test('native IPC rejects web/non-Windows before accessing helper',async()=>{
 const handlers={};require('./pr2-ipc.cjs').installPr2({app:{getPath:()=>os.tmpdir(),on(){}},ipcMain:{handle:(name,fn)=>handlers[name]=fn},BrowserWindow:null,trusted:()=>{},authorize:()=>{},getWindow:()=>null});
 if(process.platform!=='win32')assert.throws(()=>handlers['pr2:discover']({},scope),/only Windows EXE/);
});
function nativeFixture(t,respond=true){
 const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banksetu-native-'));t.after(()=>fs.rmSync(directory,{force:true,recursive:true}));
 const bytes=Buffer.from('synthetic executable');fs.writeFileSync(path.join(directory,'BankSetu.Pr2Bridge.exe'),bytes);fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({protocol:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let killed=false;child.kill=()=>{killed=true;};const received=[];
 child.stdin.on('data',data=>{const request=JSON.parse(data.toString());received.push(request);if(respond)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:request.id,result:request.op==='hello'?{protocol:1}:{written:Buffer.from(request.data||'','base64').length}})+'\n'));});
 const client=require('./pr2-native.cjs').nativeClient(directory,{spawnProcess:(_exe,_args,options)=>{assert.equal(options.shell,false);return child;}});t.after(()=>client.close());return {client,child,received,directory,killed:()=>killed};
}
test('native RPC preserves zero bytes and escapes without text conversion',async t=>{
 const f=nativeFixture(t);await f.client.handshake();const bytes=Buffer.from([0,27,0,255,13,10,0]);await f.client.write(bytes);assert.deepEqual(Buffer.from(f.received[1].data,'base64'),bytes);
});
test('native timeout terminates helper and never retries the write',async t=>{
 const f=nativeFixture(t,false);await assert.rejects(f.client.rpc('read',{count:3},5),/timed out.*Do not resend/);assert.equal(f.killed(),true);assert.equal(f.received.length,1);await assert.rejects(f.client.handshake(),/closed/);
});
test('native discovery timeout is clearly safe to retry because no print data was sent',async t=>{
 const f=nativeFixture(t,false);await assert.rejects(f.client.rpc('list',{},5),/detection timed out before any print data was sent/);assert.equal(f.killed(),true);assert.equal(f.received[0].op,'list');
});
test('damaged or mismatched bundled helper fails before process launch',t=>{
 const f=nativeFixture(t);fs.writeFileSync(path.join(f.directory,'BankSetu.Pr2Bridge.exe'),'changed');assert.throws(()=>require('./pr2-native.cjs').nativeClient(f.directory,{spawnProcess:()=>assert.fail('must not spawn')}),/damaged/);
});
test('untrusted native caller rejected before authorization/helper',()=>{
 const handlers={};require('./pr2-ipc.cjs').installPr2({app:{getPath:()=>os.tmpdir(),on(){}},ipcMain:{handle:(n,f)=>handlers[n]=f},trusted:()=>{throw Error('Untrusted application frame');},authorize:()=>assert.fail('must not authorize'),getWindow:()=>null});
 assert.throws(()=>handlers['pr2:discover']({},scope),/Untrusted/);
});

test('explicit inspection of a crash-pending job survives a second restart',async t=>{
 const f=fixture(t);await f.bridge.print(f.request);
 const file=path.join(f.directory,'pr2-state-v1.json'),saved=JSON.parse(fs.readFileSync(file,'utf8'));
 saved.jobs[f.request.id].state='sending';fs.writeFileSync(file,JSON.stringify(saved));
 const restarted=f.restart();await assert.rejects(restarted.print({...f.request,id:crypto.randomUUID()}),/interrupted/);
 restarted.acknowledge(scope,device.id);
 const reviewed=f.restart();assert.equal((await reviewed.print(f.request)).completed,false);
 assert.equal((await reviewed.print({...f.request,id:crypto.randomUUID()})).completed,true);
});

test('native pipe failure rejects the job instead of crashing Electron',async t=>{
 const f=nativeFixture(t,false),pending=f.client.rpc('read',{count:3});
 assert.doesNotThrow(()=>f.child.stdin.emit('error',Error('EPIPE')));
 await assert.rejects(pending,/interrupted/);assert.equal(f.killed(),true);
 assert.doesNotThrow(()=>f.child.stdout.emit('error',Error('closed')));
});
