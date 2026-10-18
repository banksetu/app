import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('src/core/photoState.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
const {applyPhotoIndex,mergeRemotePhoto,photoBytesHash}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const record=(id,url='',preview='')=>({key:id,scope:'tenant-a',recordId:id,pending:false,revision:'r1',customer:{enrolId:id,photoUrl:url,photoPreview:preview}});
const entry=(id,version='1',revision=1)=>({fileId:id,customerId:id,url:`https://drive.google.com/file/d/${id}/view`,version,revision,deleted:false});
test('completed no-photo evidence skips unknowns; incomplete baseline cannot assert NO_PHOTO',()=>{
 const state={records:[record('none')],operations:[],photoIndex:{revision:0,complete:false,entries:[]}};state.records[0].customer.photoIndexWaiting=true;applyPhotoIndex(state);assert.equal(state.records[0].customer.photoState,undefined);
 state.photoIndex.complete=true;applyPhotoIndex(state);assert.equal(state.records[0].customer.photoState,'NO_PHOTO');assert.equal(state.records[0].customer.photoAvailable,false);assert.equal(state.records[0].customer.photoIndexWaiting,false);
 applyPhotoIndex(state);assert.equal(state.records[0].customer.photoIndexWaiting,false);
});
test('manual Drive filename matches only one customer photo; ambiguous duplicates are not assigned',()=>{
 const state={records:[record('record-id')],operations:[],photoIndex:{revision:2,complete:true,entries:[entry('file-a'),entry('file-b')]}};
 state.records[0].customer.enrolId='file-a';
 applyPhotoIndex(state);assert.equal(state.records[0].customer.photoUrl,'https://drive.google.com/file/d/file-a/view');
 state.records[0].customer.photoUrl='';state.records[0].customer.enrolId='shared';
 state.photoIndex.entries=[{...entry('file-a'),customerId:'shared'},{...entry('file-b'),customerId:'shared'}];
 applyPhotoIndex(state);assert.equal(state.records[0].customer.photoUrl,'');assert.equal(state.records[0].customer.photoState,'AMBIGUOUS');
});
test('large completed inventory retires waiting flags and skips customers with no photo',()=>{
 const records=Array.from({length:2767},(_,i)=>record(`customer-${i}`));
 for(const item of records)item.customer.photoIndexWaiting=true;
 const entries=Array.from({length:6},(_,i)=>({...entry(`file-${i}`),customerId:`customer-${i}`}));
 const state={records,operations:[],photoIndex:{revision:6,complete:true,entries}};
 applyPhotoIndex(state);
 assert.equal(records.filter(item=>item.customer.photoState==='NO_PHOTO').length,2761);
 assert.equal(records.filter(item=>item.customer.photoState==='PENDING_DOWNLOAD').length,6);
 assert.equal(records.filter(item=>item.customer.photoIndexWaiting).length,0);
 applyPhotoIndex(state);
 assert.equal(records.filter(item=>item.customer.photoState==='NO_PHOTO').length,2761);
});
test('same-file remote version invalidates only its prior preview; repeated delta is idempotent',()=>{
 const e=entry('file','2',2),state={records:[record('customer',e.url,'old-photo')],operations:[],photoIndex:{revision:2,complete:true,entries:[e]}};
 state.records[0].customer.photoVersion='1';applyPhotoIndex(state);assert.equal(state.records[0].customer.photoPreview,'');assert.equal(state.records[0].customer.photoPreviousPreview,'old-photo');assert.equal(state.records[0].customer.photoState,'PENDING_DOWNLOAD');
 state.records[0].customer.photoPreview='new-photo';applyPhotoIndex(state);assert.equal(state.records[0].customer.photoPreview,'new-photo');assert.equal(state.records[0].customer.photoState,'SYNCED');
 const merged=mergeRemotePhoto({enrolId:'customer',photoUrl:e.url},state.records[0].customer);assert.equal(merged.photoVersion,'2');assert.equal(merged.photoPreview,'new-photo');
});
test('completed index retires a stale Sheet URL without deleting it and reactivates a later photo',()=>{
 const state={records:[record('missing','https://drive.google.com/file/d/valid/view'),record('removed')],operations:[],photoIndex:{revision:1,complete:true,entries:[entry('removed')]}};
 state.records[0].photoFailures=2;state.records[0].photoLastError='Drive failure';state.records[1].customer.photoRemoved=true;
 applyPhotoIndex(state);assert.equal(state.records[0].customer.photoAvailable,false);assert.equal(state.records[0].customer.photoState,'NO_PHOTO');assert.match(state.records[0].customer.photoUrl,/valid/);assert.equal(state.records[0].photoFailures,undefined);assert.equal(state.records[0].photoLastError,undefined);
 assert.equal(state.records[1].customer.photoState,'NO_PHOTO');assert.equal(state.records[1].customer.photoUrl,'');
 state.photoIndex.entries.push(entry('valid','2',2));applyPhotoIndex(state);assert.equal(state.records[0].customer.photoState,'PENDING_DOWNLOAD');assert.equal(state.records[0].customer.photoAvailable,true);assert.equal(state.records[0].photoMissingRef,undefined);
});
test('incomplete index keeps an unknown cloud reference retryable',()=>{
 const state={records:[record('missing','https://drive.google.com/file/d/valid/view')],operations:[],photoIndex:{revision:0,complete:false,entries:[]}};
 applyPhotoIndex(state);assert.equal(state.records[0].customer.photoState,undefined);assert.equal(state.records[0].photoMissingRef,undefined);
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
