import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("client ribbon is English, shows File submission and no repeated legacy cards",()=>{
 const ui=read("src/CustomizeLayoutStudio.tsx"),css=read("src/CustomizeLayoutReferenceLock.css");
 assert.match(ui,/Save &amp; Submit to Master/);
 assert.match(ui,/Restore Editable Backup/);
 assert.match(ui,/Download Editable Backup/);
 assert.match(ui,/aria-label="Passbook Designer navigation"/);
 assert.doesNotMatch(ui,/className="ls-ribbon-quick-tools"/);
 assert.doesNotMatch(ui,/className="ls-extra-tools"/);
 assert.match(css,/grid-template-columns:132px minmax\(0,1fr\)/);
 assert.match(css,/\.ls-zoom-controls input\[type="range"\]/);
 assert.match(ui,/Editor zoom 50 to 400 percent/);
 assert.match(ui,/fitPaperWidth/);
});

test("physical measurements can be replaced with backspace in mm, cm or inches",()=>{
 const page=read("src/PassbookPageSetup.tsx");
 assert.match(page,/type="text" inputMode="decimal"/);
 assert.match(page,/event\.currentTarget\.select\(\)/);
 assert.match(page,/raw\.trim\(\)/);
 assert.match(page,/event\.key==="Escape"/);
 assert.match(page,/onBlur=\{commit\}/);
 assert.match(page,/unitFactor/);
 assert.match(page,/Math\.round\(mm\*1000\)\/1000/);
});

test("master can browse all bank templates and delete through authorized Worker route",()=>{
 const manager=read("src/MasterTemplateManager.tsx");
 const worker=read("cloudflare/worker.js");
 const dashboard=read("src/Dashboard.tsx");
 assert.match(dashboard,/Master Template Management — All Banks/);
 assert.match(dashboard,/bankSettingsReady \|\| canControlGlobalDashboard/);
 assert.match(manager,/allBanks:true,status:next/);
 for(const word of ["Pending Approval","Approved","Rejected","Deleted","originTenantId","submittedBy","Raw JSON"])
  assert.ok(manager.includes(word),word);
 assert.match(manager,/\/delete-layout-template/);
 assert.match(worker,/if\(route === "\/delete-layout-template"\)/);
 assert.match(worker,/if\(!isMasterActor\(actor\)\)/);
 const routings=worker.split('"\/delete-layout-template"').length-1;
 assert.equal(routings,3,"Delete route must be registered and handled exactly once");
 assert.match(worker,/status:"deleted",deletedBy:actor\.uid/);
});

test("Quick and PR2 remain isolated and client print actions sit after preview",()=>{
 const worker=read("cloudflare/worker.js"),client=read("src/CustomBankDocument.tsx");
 const print=read("src/WorkspaceTemplateDocument.tsx"),dialog=read("src/CustomPr2PrinterDialog.tsx");
 assert.match(worker,/template\.requestedOutput!==output/);
 assert.match(client,/Download Raw Layout \(\.json\)/);
 assert.match(client,/readLocalLayouts\(bankName,layoutMode\)/);
 assert.match(client,/validatePersistedLayoutDraft/);
 assert.match(client,/layoutOutput==="dotmatrix"\?3:0/);
 assert.ok(print.indexOf('className="workspace-template-pages"')<
   print.indexOf('className="workspace-template-controls"'));
 assert.match(print,/layoutId=\{template\.id\}/);
 assert.match(dialog,/Remember this printer and its verified X\/Y alignment/);
 assert.match(dialog,/requirePhysicalConfirmation/);
 assert.match(dialog,/pendingPhysical/);
});

test("Master approval is review-only until verified client print activation",()=>{
 const editor=read("src/CustomizeLayoutStudio.tsx"),worker=read("cloudflare/worker.js");
 assert.match(editor,/autoActivateOnApproval:false/);
 assert.match(worker,/body\.confirmedPhysicalSample!==true/);
 assert.match(worker,/body\.confirmedPrinterCalibration!==true/);
 assert.match(worker,/status!=="approved"/);
});
