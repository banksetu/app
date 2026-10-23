const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
function load(name){const m=new Module(path.join(__dirname,name));m.filename=path.join(__dirname,name);m.paths=module.paths;m.require=id=>id==='./pr2-protocol.cjs'?require('../../desktop/pr2-protocol.cjs'):id==='./core.cjs'?load('core.cjs'):require(id);m._compile(fs.readFileSync(m.filename,'utf8'),m.filename);return m.exports;}
const {fullSuite}=load('suite.cjs');
const ready=[27,114,80],aligned=[27,66,53,66,27,90],inserted=[27,66,53,67,27,90],config=[27,112,48,48,48,48];
function fixture(replies,approvals={"full-suite":true,"synthetic-print":false}){const sent=[],events=[],asked=[];let fenced=0;return {sent,events,asked,get fenced(){return fenced;},io:{rpc:async()=>{const data=replies.shift();if(data===undefined)throw Error('missing fixture reply');return {data:Buffer.from(data).toString('base64'),segments:[],zeroReads:0,quietTimeout:true,limitReached:false};},write:async b=>{sent.push(Buffer.from(b));return {written:b.length};}},log:e=>events.push(e),approve:async a=>{asked.push(a);return approvals[a]===true;},fence:async()=>{fenced++;}};}
const count=(f,bytes)=>f.sent.filter(b=>b.equals(Buffer.from(bytes))).length;
test('consolidated suite advances once per candidate and stops at measured insertion',async()=>{
 const f=fixture([config,[],ready,aligned,[],ready,aligned,[27,83,49,57,52,54],ready,inserted]);
 const r=await fullSuite({...f,resolution:216,passbookType:'horizontal'});
 assert.equal(r.insertedBy,'length-measurement');assert.equal(r.printed,false);assert.equal(r.physicalVerified,false);
 assert.equal(count(f,[27,125,45]),1);assert.equal(count(f,[27,45]),1);assert.equal(count(f,[27,76,48,48,48]),0);
 assert.deepEqual(f.asked,['full-suite','synthetic-print']);assert.equal(f.fenced,1);
 assert.ok(!f.sent.some(b=>b.subarray(0,3).equals(Buffer.from([27,49,67]))));
});
test('all no-response candidates are bounded to one attempt with no graphics',async()=>{
 const f=fixture([config,[],ready,aligned,[],ready,aligned,[],ready,aligned,[],ready,aligned]);
 const r=await fullSuite({...f,resolution:240,passbookType:'vertical'});
 assert.equal(r.insertedBy,null);assert.equal(r.physicalVerified,false);
 assert.equal(count(f,[27,125,45]),1);assert.equal(count(f,[27,45]),1);assert.equal(count(f,[27,76,48,48,48]),1);
 assert.ok(!f.sent.some(b=>b.subarray(0,3).equals(Buffer.from([27,49,67]))));
});
test('unexpected motion reply stops before the next candidate',async()=>{
 const f=fixture([config,[],ready,aligned,[1,2,3]]);
 await assert.rejects(fullSuite({...f,resolution:216,passbookType:'document'}),/unexpected bytes/);
 assert.equal(count(f,[27,125,45]),1);assert.equal(count(f,[27,45]),0);
});
test('printer error after a candidate prevents every later motion',async()=>{
 const f=fixture([config,[],ready,aligned,[],[27,114,56],aligned]);
 await assert.rejects(fullSuite({...f,resolution:216,passbookType:'horizontal'}));
 assert.equal(count(f,[27,125,45]),1);assert.equal(count(f,[27,45]),0);
});
test('strict insertion plus second approval sends graphics without another feed or eject',async()=>{
 const f=fixture([config,[],ready,aligned,[27,83,49,57,52,54],ready,inserted,ready,inserted],{'full-suite':true,'synthetic-print':true});
 const r=await fullSuite({...f,resolution:216,passbookType:'horizontal'});
 assert.equal(r.printed,true);assert.equal(r.physicalVerified,false);
 assert.equal(count(f,[27,125,45]),1);assert.equal(count(f,[27,76,48,48,48]),0);
 assert.ok(f.sent.some(b=>b.subarray(0,3).equals(Buffer.from([27,49,67]))));
 assert.equal(count(f,[27,79]),0);
});
test('invalid configuration rejects before approval, fence and USB writes',async()=>{
 for(const args of [{resolution:100,passbookType:'horizontal'},{resolution:216,passbookType:'unknown'}]){const f=fixture([]);await assert.rejects(fullSuite({...f,...args}));assert.equal(f.sent.length,0);assert.equal(f.fenced,0);}
});
