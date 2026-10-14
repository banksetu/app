import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('src/core/photoState.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {applyPhotoIndex,mergeRemotePhoto,photoBytesHash}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const record=(id,url='',preview='')=>({key:id,scope:'tenant-a',recordId:id,pending:false,revision:'r1',customer:{enrolId:id,photoUrl:url,photoPreview:preview}});
const entry=(id,version='1',revision=1)=>({fileId:id,customerId:id,url:`https://drive.google.com/file/d/${id}/view`,version,revision,deleted:false});
test('completed no-photo evidence skips unknowns; incomplete baseline cannot assert NO_PHOTO',()=>{
 const state={records:[record('none')],operations:[],photoIndex:{revision:0,complete:false,entries:[]}};applyPhotoIndex(state);assert.equal(state.records[0].customer.photoState,undefined);
 state.photoIndex.complete=true;applyPhotoIndex(state);assert.equal(state.records[0].customer.photoState,'NO_PHOTO');assert.equal(state.records[0].customer.photoAvailable,false);
});
test('same-file remote version invalidates only its prior preview; repeated delta is idempotent',()=>{
 const e=entry('file','2',2),state={records:[record('customer',e.url,'old-photo')],operations:[],photoIndex:{revision:2,complete:true,entries:[e]}};
 state.records[0].customer.photoVersion='1';applyPhotoIndex(state);assert.equal(state.records[0].customer.photoPreview,'');assert.equal(state.records[0].customer.photoPreviousPreview,'old-photo');assert.equal(state.records[0].customer.photoState,'PENDING_DOWNLOAD');
 state.records[0].customer.photoPreview='new-photo';applyPhotoIndex(state);assert.equal(state.records[0].customer.photoPreview,'new-photo');assert.equal(state.records[0].customer.photoState,'SYNCED');
 const merged=mergeRemotePhoto({enrolId:'customer',photoUrl:e.url},state.records[0].customer);assert.equal(merged.photoVersion,'2');assert.equal(merged.photoPreview,'new-photo');
});
test('valid cloud reference absent from index is recoverable; intentional removal never resurrects older files',()=>{
 const state={records:[record('missing','https://drive.google.com/file/d/valid/view'),record('removed')],operations:[],photoIndex:{revision:1,complete:true,entries:[entry('removed')]}};
 state.records[1].customer.photoRemoved=true;applyPhotoIndex(state);assert.notEqual(state.records[0].customer.photoAvailable,false);assert.equal(state.records[1].customer.photoState,'NO_PHOTO');assert.equal(state.records[1].customer.photoUrl,'');
});
test('pending local replacement is never overwritten by a cloud index or another tenant index',()=>{
 const state={records:[record('photo')],operations:[],photoIndex:{revision:1,complete:true,entries:[entry('photo')]}};state.records[0].pending=true;state.records[0].customer.photoPreview='offline-new';applyPhotoIndex(state);assert.equal(state.records[0].customer.photoPreview,'offline-new');assert.equal(state.records[0].customer.photoUrl,'');
 const other={records:[],operations:[],photoIndex:{revision:1,complete:true,entries:[entry('photo')]}};applyPhotoIndex(other);assert.equal(other.records.length,0);
});

test('one-time legacy checksum baseline preserves matching bytes and detects changed bytes without Drive downloads',async()=>{
 const preview='data:image/png;base64,c2FtZQ==',hash=await photoBytesHash(preview);
 const e={...entry('legacy'),hash},state={records:[record('legacy',e.url,preview)],operations:[],photoIndex:{revision:1,complete:true,entries:[e]}};
 applyPhotoIndex(state);assert.equal(state.records[0].customer.photoNeedsBaselineHash,true);assert.equal(state.records[0].customer.photoPreview,preview);
 state.records[0].customer.photoContentHash=hash;applyPhotoIndex(state);assert.equal(state.records[0].customer.photoState,'SYNCED');assert.equal(state.records[0].customer.photoPreview,preview);assert.equal(state.records[0].customer.photoNeedsBaselineHash,false);
});
