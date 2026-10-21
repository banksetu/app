const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
// Resolve unchanged production protocol without copying it into source tools.
const m=new Module(path.join(__dirname,'core.cjs'));m.filename=path.join(__dirname,'core.cjs');m.paths=module.paths;
m.require=id=>id==='./pr2-protocol.cjs'?require('../../desktop/pr2-protocol.cjs'):require(id);
m._compile(require('node:fs').readFileSync(m.filename,'utf8'),m.filename);
const {run,proof}=m.exports;
function fixture(responses){const sent=[],events=[];let fenced=0,approved=0;return {sent,events,get fenced(){return fenced;},get approved(){return approved;},io:{write:async b=>sent.push(Buffer.from(b)),read:async()=>Buffer.from(responses.shift())},log:e=>events.push(e),fence:async()=>{fenced++;},approve:async()=>{approved++;return true;}};}
const good=()=>[[27,47,55],[27,114,80],[27,66,53,66,27,90]];
test('unknown status captured and blocks motion',async()=>{const f=fixture([[27,47,55],[0,0,0]]);await assert.rejects(run({...f,action:'print',resolution:216}),/Unrecognized/);assert.equal(f.sent.length,3);assert.equal(f.events.at(-1).hex,'00 00 00');assert.equal(f.fenced,0);});
test('diagnose sends only identity/status/paper commands',async()=>{const f=fixture(good());await run({...f,action:'diagnose'});assert.equal(f.sent.length,4);assert.equal(f.approved,0);});
for(const action of ['feed','print','eject'])test(action+' requires approval and fence before motion',async()=>{const f=fixture([...good(),[27,114,80],[27,66,53,64,27,90]]);const write=f.io.write;f.io.write=async b=>{if(f.sent.length===4){assert.equal(f.approved,1);assert.equal(f.fenced,1);}return write(b);};const result=await run({...f,action,resolution:216});assert.equal(result.physicalVerified,false);});
test('declined approval sends no motion',async()=>{const f=fixture(good());await assert.rejects(run({...f,action:'feed',approve:async()=>false}),/declined/);assert.equal(f.sent.length,4);});
test('unknown identity stops before status',async()=>{const f=fixture([[0,0,0]]);await assert.rejects(run({...f,action:'eject'}),/identity/);assert.equal(f.sent.length,2);});
test('invalid action or resolution sends nothing',async()=>{for(const args of [{action:'shell'},{action:'print',resolution:100}]){const f=fixture([]);await assert.rejects(run({...f,...args}));assert.equal(f.sent.length,0);}});
test('synthetic proof uses reused raster protocol',()=>{assert.ok(proof(216).length>3);});
test('direct USB print proof rejects stale and shifted frames before motion',async()=>{
 for(const frames of [
  [[27,114,80]],
  [[],[],[27,47,55],[27,47,55]]
 ]){
  const f=fixture([]);f.io.capture=async()=>Buffer.from(frames.shift()||[]);
  await assert.rejects(run({...f,action:'print',resolution:216}));
  assert.equal(f.fenced,0);
  assert.equal(f.approved,0);
  assert.ok(!f.sent.some(b=>b[1]===76));
 }
});
test('direct USB proof accepts exact frames but never claims physical print',async()=>{
 const f=fixture([]),frames=[[],[],...good(),[27,114,80],[27,66,53,64,27,90]];
 f.io.capture=async()=>Buffer.from(frames.shift()||[]);
 const result=await run({...f,action:'print',resolution:216});
 assert.equal(f.approved,1);assert.equal(f.fenced,1);assert.equal(result.physicalVerified,false);
 assert.ok(f.sent.some(b=>b[1]===76));
});
test('no-document status cannot authorize a print even with aligned paper bytes',async()=>{
 const f=fixture([[27,47,55],[27,114,50],[27,66,53,66,27,90]]);
 await assert.rejects(run({...f,action:'print',resolution:240}),/did not report ready/);
 assert.equal(f.approved,0);assert.equal(f.fenced,0);
});
