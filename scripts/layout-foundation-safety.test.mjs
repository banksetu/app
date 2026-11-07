import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Step 1: existing customer repository, offline queue, Windows/Android/Web DB and PR2 flow are preserved",()=>{
 const db=file("src/platform/web/indexedDbRepository.ts");
 const desktop=file("desktop/store.cjs");
 const repo=file("src/core/customerRepository.ts");
 const schema=file("src/core/schema.ts");
 const local=file("src/layoutLocalStore.ts");
 const core=file("src/layoutLocalState.ts");
 assert.match(db,/banksetu-local-v1/);
 assert.match(desktop,/customers\.sqlite/);
 assert.match(repo,/indexedDbRepository\.transact|indexedDbRepository/);
 assert.match(repo,/bankSetuDesktop/);
 assert.match(schema,/records: CachedRecord\[\]/);
 assert.match(schema,/operations: QueueOperation\[\]/);
 assert.match(core,/__bankSetuLayoutSlotsV1/);
 assert.match(core,/state\.documents/);
 assert.doesNotMatch(core,/state\.records\s*=/);
 assert.doesNotMatch(core,/state\.operations\s*=/);
 assert.doesNotMatch(local,/indexedDB\.open|new DatabaseSync|new WebSocket|setInterval/);
});
test("Step 3: all sync routes in existing Worker authorization and route dispatch tables",()=>{
 const worker=file("cloudflare/worker.js");
 for(const route of ["/layout-sync-index","/layout-sync-download","/layout-sync-publish"]){
   assert.ok(worker.split('"'+route+'"').length>=4,
    route+" must be in supportedRoutes, migratedRoutes and handler");
 }
 const start=worker.indexOf('if (["/layout-sync-index"');
 const end=worker.indexOf('// Generic, reviewed bank templates;',start);
 const code=worker.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(code,/\["client_admin","client_user"\]/);
 assert.match(code,/role!=="client_admin"/);
 assert.match(code,/sanitizeLayoutTemplate\(body\.template,bankName\)/);
 assert.match(code,/expectedManifestRevision/);
 assert.match(code,/expectedSlotRevision/);
 assert.match(code,/currentDocument:/);
 assert.match(code,/method:"POST",body:JSON\.stringify\(\{writes\}\)/);
 assert.match(code,/tenantId=String\(actor\.profile\.tenantId\)/);
 assert.doesNotMatch(code,/request\.json\(\).*tenantId/);
});
test("Step 2-3: editor uses one existing repository, cloud sync lazy on verified login, no destructive migration",()=>{
 const studio=file("src/CustomizeLayoutStudio.tsx");
 const app=file("src/Dashboard.tsx");
 const sync=file("src/layoutCloudRecovery.ts");
 assert.match(studio,/readLocalLayouts/);
 assert.match(studio,/saveLocalLayout/);
 assert.match(studio,/publishLocalLayoutSlot/);
 assert.match(studio,/Previous local draft migrated/);
 assert.match(studio,/Legacy copy was retained/);
 assert.match(app,/synchronizeLocalLayoutSlots/);
 assert.match(app,/bankSettingsReady/);
 assert.match(sync,/DecompressionStream/);
 assert.match(sync,/expectedManifestRevision/);
 assert.doesNotMatch(sync,/firebase\.googleapis\.com/);
 assert.doesNotMatch(sync,/new IndexedDB|indexedDB\.open|new DatabaseSync/);
});
