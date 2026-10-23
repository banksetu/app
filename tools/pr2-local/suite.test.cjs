const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
function load(name){const m=new Module(path.join(__dirname,name));m.filename=path.join(__dirname,name);m.paths=module.paths;m.require=id=>id==='./pr2-protocol.cjs'?require('../../desktop/pr2-protocol.cjs'):id==='./core.cjs'?load('core.cjs'):require(id);m._compile(fs.readFileSync(m.filename,'utf8'),m.filename);return m.exports;}
const {fullSuite}=load('suite.cjs');
const {rasterBandsPhysical}=require('../../desktop/pr2-protocol.cjs'),{makeSampleRaster}=load('core.cjs');
const ready=[27,114,80],commandError=[27,114,56],aligned=[27,66,53,66,27,90],released=[27,66,53,65,27,90],inserted=[27,66,53,67,27,90],config=[27,112,81,65,48,32];
function fixture(replies,approvals={"full-suite":true,"print-and-front-eject":false}){const sent=[],events=[],asked=[];let fenced=0;return {sent,events,asked,get fenced(){return fenced;},io:{rpc:async()=>{const data=replies.shift();if(data===undefined)throw Error('missing fixture reply');return {data:Buffer.from(data).toString('base64'),segments:[],zeroReads:0,quietTimeout:true,limitReached:false};},write:async b=>{sent.push(Buffer.from(b));return {written:b.length};}},log:e=>events.push(e),approve:async a=>{asked.push(a);return approvals[a]===true;},fence:async()=>{fenced++;},wait:async()=>{}};}
const count=(f,bytes)=>f.sent.filter(b=>b.equals(Buffer.from(bytes))).length;
const has=(buffer,bytes)=>buffer.includes(Buffer.from(bytes));
const successReplies=()=>[ready,aligned,config,[],ready,aligned,[],inserted,ready];
const sampleBandCount=rasterBandsPhysical(makeSampleRaster(),{profile:'epson-plq20-pr2-v1',verticalResolution:216,offsetX:0,offsetY:0}).bands.length;
const printReplies=(afterEject=[])=>[...successReplies(),...Array.from({length:sampleBandCount},()=>ready),inserted,[],...afterEject];
test('bank-style sequence sets automatic mode and page geometry then feeds exactly once',async()=>{
 const f=fixture(successReplies());const r=await fullSuite({...f,resolution:216,passbookType:'horizontal'});
 assert.equal(r.insertedBy,'bank-style-feed');assert.equal(r.printed,false);assert.equal(r.physicalVerified,false);assert.equal(f.fenced,1);
 for(const command of [[27,46],[27,85,96],[27,83,53],[27,39,70],[27,38,48,48],[27,81,48,52,50,27,90],[27,35,48],[27,76,48,48,48]])assert.equal(count(f,command),1);
 assert.equal(count(f,[27,125,45]),0);assert.equal(count(f,[27,45]),0);assert.deepEqual(f.asked,['full-suite','print-and-front-eject']);
});
test('known 38 command error is cleared once before bank-style setup',async()=>{
 const f=fixture([commandError,aligned,[],ready,aligned,...successReplies().slice(2)]);await fullSuite({...f,resolution:216,passbookType:'horizontal'});
 assert.equal(count(f,[27,108]),1);assert.equal(count(f,[27,76,48,48,48]),1);
});
test('non-PR2 configuration stops before setup and motion',async()=>{
 const f=fixture([ready,aligned,[27,112,67,65,48,32]]);await assert.rejects(fullSuite({...f,resolution:216,passbookType:'horizontal'}),/did not confirm PR2/);
 assert.equal(count(f,[27,76,48,48,48]),0);assert.equal(count(f,[27,46]),0);
});
test('setup error stops before feed',async()=>{
 const f=fixture([ready,aligned,config,[],commandError,aligned]);await assert.rejects(fullSuite({...f,resolution:216,passbookType:'horizontal'}),/READY/);
 assert.equal(count(f,[27,76,48,48,48]),0);
});
test('aligned paper after single feed is observed without retry and blocks graphics',async()=>{
 const f=fixture([ready,aligned,config,[],ready,aligned,[],aligned,aligned,aligned,aligned,aligned,ready]);
 await assert.rejects(fullSuite({...f,resolution:216,passbookType:'horizontal'}),/not confirmed/);
 assert.equal(count(f,[27,76,48,48,48]),1);assert.ok(!f.sent.some(b=>has(b,[27,49,67])));
});
test('declined atomic print-and-eject approval sends neither graphics nor eject',async()=>{
 const f=fixture(successReplies());const r=await fullSuite({...f,resolution:216,passbookType:'horizontal'});
 assert.equal(r.printed,false);assert.equal(r.physicalVerified,false);assert.equal(count(f,[27,76,48,48,48]),1);
 assert.ok(!f.sent.some(b=>has(b,[27,49,67])));assert.equal(count(f,[27,79]),0);assert.equal(r.ejected,false);
});
test('one approved atomic job prints sample then uses ESC O once and confirms released paper',async()=>{
 const f=fixture(printReplies([released]),{'full-suite':true,'print-and-front-eject':true});
 const r=await fullSuite({...f,resolution:216,passbookType:'horizontal'});
 assert.equal(r.printed,true);assert.equal(r.sample,'synthetic-bank-setu');assert.equal(r.ejectCommandSent,true);assert.equal(r.ejected,true);assert.equal(r.postPaper,'released');assert.equal(r.physicalVerified,false);
 assert.equal(count(f,[27,76,48,48,48]),1);assert.equal(count(f,[27,79]),1);assert.equal(count(f,[12]),0);
 assert.ok(f.sent.filter(b=>has(b,[27,49,67])).every(b=>b.subarray(-3).equals(Buffer.from([27,125,87]))));
 assert.equal(count(f,[27,106]),3+sampleBandCount);
});
test('front release observation is bounded without resending ESC O',async()=>{
 const f=fixture(printReplies([inserted,inserted,released]),{'full-suite':true,'print-and-front-eject':true});
 const r=await fullSuite({...f,resolution:216,passbookType:'horizontal'});
 assert.equal(r.printed,true);assert.equal(r.ejected,true);assert.equal(count(f,[27,79]),1);
});
test('silent USB observation never becomes success and never resends ESC O',async()=>{
 const f=fixture(printReplies(Array.from({length:10},()=>[])),{'full-suite':true,'print-and-front-eject':true});
 const r=await fullSuite({...f,resolution:216,passbookType:'horizontal'});
 assert.equal(r.printed,true);assert.equal(r.ejectCommandSent,true);assert.equal(r.ejected,false);assert.equal(r.postPaper,'unobserved');assert.equal(r.physicalVerified,false);
 assert.equal(count(f,[27,79]),1);
});
test('invalid options reject before approval, fence and USB writes',async()=>{
 for(const args of [{resolution:100,passbookType:'horizontal'},{resolution:216,passbookType:'unknown'}]){const f=fixture([]);await assert.rejects(fullSuite({...f,...args}));assert.equal(f.sent.length,0);assert.equal(f.fenced,0);}
});
