import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import crypto from 'node:crypto';
function bridge(){const rows=[['ENDROL ID','ACCOUNT NO','NAME']];const tabs=new Map();const book={getSheetByName:name=>tabs.get(name),insertSheet(name){const tab=makeSheet([[]]);tabs.set(name,tab);return tab;}};function makeSheet(data){return {getParent:()=>book,hideSheet(){},getMaxColumns:()=>27,getLastRow:()=>data.length,appendRow:row=>data.push(row),deleteRow:row=>data.splice(row-1,1),getRange(start,col,count,width){return {getValues:()=>Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>data[start+i-1]?.[col+j-1]||'')),getDisplayValues:()=>Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>String(data[start+i-1]?.[col+j-1]||''))),setValues(values){values.forEach((row,i)=>{data[start+i-1] ||= [];row.forEach((cell,j)=>data[start+i-1][col+j-1]=cell);});}};}};}const sheet=makeSheet(rows);
 const context=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_alg,value)=>Array.from(crypto.createHash('sha256').update(value).digest())},SpreadsheetApp:{flush(){}},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},console});vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);context.getSheet=()=>sheet;context.findDuplicates=()=>({accountNo:null,enrolId:null,uidaiNo:null});return {context,rows,tabs};}
const makeOp=(id,action='saveCustomer')=>({recordId:id,operationId:crypto.randomUUID(),action,baseRevision:'',customer:{name:'Alice',accountNo:'1001',enrolId:'001',uidaiNo:'123456789012'}});
const user={connectionId:'bound',role:'client_admin',email:'owner@example.com'};
test('bridge replays committed operations, uses UUID after row reorder and rejects concurrent edits',()=>{
 const {context,rows}=bridge();const op=makeOp(crypto.randomUUID());const first=context.syncCustomerOperation({connectionId:'bound',operation:op},user);assert(first.success);assert.equal(rows.length,2);const replay=context.syncCustomerOperation({connectionId:'bound',operation:op},user);assert(replay.replayed);assert.equal(rows.length,2);
 rows.splice(1,0,Array(27).fill(''));const edit={...op,operationId:crypto.randomUUID(),action:'updateCustomer',baseRevision:first.revision,customer:{...op.customer,name:'Updated'}};const updated=context.syncCustomerOperation({connectionId:'bound',operation:edit},user);assert(updated.success);assert.equal(updated.rowNumber,3);assert.equal(rows[1][2],'');assert.equal(rows[2][2],'Updated');
 const stale={...edit,operationId:crypto.randomUUID(),customer:{...edit.customer,name:'Stale'}};const conflict=context.syncCustomerOperation({connectionId:'bound',operation:stale},user);assert.equal(conflict.code,'CONFLICT');assert.equal(rows[2][2],'Updated');
 rows[2][2]='Manual edit';const manual=context.syncCustomerOperation({connectionId:'bound',operation:{...stale,baseRevision:updated.revision}},user);assert.equal(manual.code,'CONFLICT');
 assert.equal(context.syncCustomerOperation({connectionId:'changed',operation:op},user).code,'CONNECTION_CHANGED');
});
test('sync metadata refuses occupied columns without changing existing data',()=>{const {context,rows}=bridge();rows[0][24]='Client custom column';const before=JSON.stringify(rows);assert.throws(()=>context.localFirstRead({action:'getAllCustomers'},user),/already in use/);assert.equal(JSON.stringify(rows),before);});
test('delete removes the Sheet row and replays from a scoped tombstone',()=>{const {context,rows}=bridge();const op=makeOp(crypto.randomUUID());const saved=context.syncCustomerOperation({connectionId:'bound',operation:op},user);const deletion={...op,operationId:crypto.randomUUID(),action:'deleteCustomer',baseRevision:saved.revision};assert.throws(()=>context.syncCustomerOperation({connectionId:'bound',operation:deletion},{...user,role:'client_user'}),/Administrator/);assert(context.syncCustomerOperation({connectionId:'bound',operation:deletion},user).deleted);assert.equal(rows.length,1);assert(context.syncCustomerOperation({connectionId:'bound',operation:deletion},user).replayed);assert.equal(context.localFirstRead({action:'getCustomerPage',cursor:0},user).deletedIds[0],op.recordId);assert.equal(context.localFirstRead({action:'getAllCustomers'},user).customers.length,0);});
test('deleted record cannot be recreated, and deletion IDs stay in their connection',()=>{const {context}=bridge();const op=makeOp(crypto.randomUUID());const saved=context.syncCustomerOperation({connectionId:'bound',operation:op},user);const deletion={...op,operationId:crypto.randomUUID(),action:'deleteCustomer',baseRevision:saved.revision};assert(context.syncCustomerOperation({connectionId:'bound',operation:deletion},user).success);assert.equal(context.syncCustomerOperation({connectionId:'bound',operation:{...op,operationId:crypto.randomUUID()}},user).code,'CONFLICT');assert.equal(context.localFirstRead({action:'getCustomerPage',cursor:0},{...user,connectionId:'other'}).deletedIds.length,0);});
test('Master and Client delete incomplete legacy rows by stable ID without customer form validation',()=>{
 for(const role of ['master_owner','client_admin']){
   const {context,rows}=bridge();const actor={...user,role,connectionId:role};
   const original=makeOp(crypto.randomUUID());assert(context.syncCustomerOperation({connectionId:role,operation:original},actor).success);
   rows[1][0]='';rows[1][1]='';rows[1][2]='';rows[1][10]='';
   const revision=context.localFirstRead({action:'getCustomerPage',cursor:0},actor).customers[0].revision;
   const deletion={recordId:original.recordId,operationId:crypto.randomUUID(),action:'deleteCustomer',baseRevision:revision,customer:{}};
   const result=context.syncCustomerOperation({connectionId:role,operation:deletion},actor);
   assert(result.success&&result.deleted&&result.rowDeleted&&result.driveDeleted);assert.equal(rows.length,1);
   assert(context.syncCustomerOperation({connectionId:role,operation:deletion},actor).replayed);
 }
});
test('audit details identify changed customer fields without exposing Aadhaar',()=>{
 const {context}=bridge();
 const details=context.activityChanges({name:'Old Name',accountNo:'1001',uidaiNo:'111122223333'}, {name:'New Name',accountNo:'1002',uidaiNo:'444455556666'});
 assert.match(details,/Name: Old Name → New Name/);assert.match(details,/Account Number: 1001 → 1002/);
 assert(!details.includes('444455556666'));
});
test('paged customer downloads preserve cursors and include deletion tombstones without returning the entire Sheet',()=>{const {context,rows}=bridge();for(let i=0;i<600;i++){const row=Array(27).fill('');row[0]=String(i);row[2]='Customer '+i;row[24]=crypto.randomUUID();if(i===2)row[26]='true';rows.push(row);}const first=context.localFirstRead({action:'getCustomerPage',cursor:0,pageSize:250},user);assert.equal(first.customers.length,249);assert.equal(first.deletedIds.length,1);assert.equal(first.nextCursor,250);assert(first.hasNextPage);const last=context.localFirstRead({action:'getCustomerPage',cursor:500,pageSize:250},user);assert.equal(last.customers.length,100);assert.equal(last.hasNextPage,false);assert.throws(()=>context.localFirstRead({action:'getCustomerPage',cursor:-1},user),/Invalid/);});

test('Master sync keeps existing records, assigns stable IDs and replays safely',()=>{const {context,rows}=bridge();rows.push(['old-id','9001','Existing Master']);const master={connectionId:'master-existing',role:'master_owner',email:'master@example.com'};const first=context.localFirstRead({action:'getCustomerPage',cursor:0,pageSize:250},master);assert.equal(first.customers[0].name,'Existing Master');assert(first.customers[0].recordId);const op=makeOp(crypto.randomUUID());assert(context.syncCustomerOperation({connectionId:master.connectionId,operation:op},master).success);assert(context.syncCustomerOperation({connectionId:master.connectionId,operation:op},master).replayed);assert.equal(rows.length,3);assert.equal(rows[1][2],'Existing Master');});

test('tenant-bound sync delete trashes linked Drive files before confirming Sheet tombstone',()=>{
 const {context,rows}=bridge();
 const attached=new Map();
 const folderId='tenant-folder';
 const file=(id,parent)=>({trashed:false,getParents:()=>{let used=false;return {hasNext:()=>!used,next:()=>{used=true;return {getId:()=>parent};}};},setTrashed(value){this.trashed=value;}});
 attached.set('photo-file-id-1234567890',file('photo-file-id-1234567890',folderId));
 attached.set('pdf-file-id-12345678901',file('pdf-file-id-12345678901',folderId));
 context.DriveApp={getFileById:id=>{if(!attached.has(id))throw Error('File missing');return attached.get(id);},
   getFolderById:id=>{assert.equal(id,folderId);return {getFilesByName:()=>({hasNext:()=>false})};}};
 const admin={...user,photoFolderId:folderId};const op=makeOp(crypto.randomUUID());
 const saved=context.syncCustomerOperation({connectionId:'bound',operation:op},admin);
 rows[1][19]='https://drive.google.com/file/d/photo-file-id-1234567890/view';
 rows[1][20]='https://drive.google.com/file/d/pdf-file-id-12345678901/view';
 const revision=context.localFirstRead({action:"getAllCustomers"},admin).customers[0].revision;
 const deletion={...op,operationId:crypto.randomUUID(),action:'deleteCustomer',baseRevision:revision};
 const result=context.syncCustomerOperation({connectionId:'bound',operation:deletion},admin);
 assert(result.success&&result.deleted&&result.driveDeleted);assert.equal(rows.length,1);
 assert(attached.get('photo-file-id-1234567890').trashed);assert(attached.get('pdf-file-id-12345678901').trashed);
 const replay=context.syncCustomerOperation({connectionId:'bound',operation:deletion},admin);
 assert(replay.replayed&&replay.deleted&&replay.driveDeleted);
 const foreign=makeOp(crypto.randomUUID());const other=context.syncCustomerOperation({connectionId:'bound',operation:foreign},admin);
 rows[1][19]='https://drive.google.com/file/d/foreign-file-123456789012/view';
 attached.set('foreign-file-123456789012',file('foreign-file-123456789012','another-tenant'));
 const denied={...foreign,operationId:crypto.randomUUID(),action:'deleteCustomer',baseRevision:context.localFirstRead({action:"getAllCustomers"},admin).customers.find(item=>item.recordId===foreign.recordId).revision};
 assert.throws(()=>context.syncCustomerOperation({connectionId:'bound',operation:denied},admin),/outside this tenant/);
 assert.equal(rows.length,2);
});
