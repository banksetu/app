import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {previewLayoutKey} from "../src/platform/layoutCodespacesPreview.ts";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Codespaces demo drafts are isolated per bank, document type, and Quick/PR2 slot",()=>{
 const keys=new Set();
 for(const bank of ["Assam Gramin Bank","Central Bank of India"])
  for(const mode of ["passbook","accountOpening"])
   for(let slot=1;slot<=6;slot++)
    keys.add(previewLayoutKey(mode,bank,"layout-"+slot));
 assert.equal(keys.size,24);
 assert.match(previewLayoutKey("passbook","Assam Gramin Bank","layout-4"),/^banksetu:codespaces:synthetic-layout-preview:/);
 assert.throws(()=>previewLayoutKey("passbook","Demo","../customers"));
 assert.throws(()=>previewLayoutKey("passbook","Demo","layout-7"));
});

test("Vite enables demo only for Codespaces in development, not web or Android release builds",()=>{
 const config=read("vite.config.ts");
 const gate=read("src/platform/layoutCodespacesPreview.ts");
 assert.match(config,/mode==="development" && Boolean\(codespaceName\)/);
 assert.match(gate,/import\.meta\.env\.DEV/);
 assert.match(gate,/__BANKSETU_CODESPACES_LAYOUT_PREVIEW__/);
 const main=read("src/main.tsx");
 assert.match(main,/codespacesLayoutPreviewAvailable\(\)/);
 assert.match(main,/normal-app/);
 assert.match(main,/import\("\.\/CodespacesLayoutPreview"\)/);
 assert.match(main,/return;\s*\}\s*const \[\{showMessage\}/);
});

test("Actual editor preview denies cloud operations, customers, approval and native printing",()=>{
 const ui=read("src/CustomizeLayoutStudio.tsx");
 const lab=read("src/CodespacesLayoutPreview.tsx");
 assert.match(ui,/!windowsLayoutEngineAvailable\(\)&&!previewOnly/);
 assert.match(ui,/const canSubmit = !previewOnly/);
 assert.match(ui,/const canReview = !previewOnly/);
 for(const name of ["if(previewOnly){","previewLayoutKey","localStorage.setItem",
   "setPreviewCustomers","Codespaces demo","Sync / Recover Layouts"])
  assert.ok(ui.includes(name),name);
 assert.match(lab,/previewOnly bankName=/);
 assert.match(lab,/accountRole="client_user"/);
 assert.match(lab,/DEMO ONLY|Demo Branch/);
 assert.doesNotMatch(lab,/callBankSetuWorker|customerRepository|firebase\/auth/);
});
