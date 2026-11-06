import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const worker=file("cloudflare/worker.js"),custom=file("src/CustomBankDocument.tsx");
const preview=file("src/WorkspaceTemplateDocument.tsx");
const ipc=file("desktop/pr2-ipc.cjs");
test("Worker dispatch exposes tenant selections and Master-reviewed catalog only behind authentication",()=>{
  for(const route of ["/submit-layout-template","/review-layout-template","/list-layout-templates","/get-workspace-layout-selection","/set-workspace-layout-selection"]){
    const count=worker.split('"'+route+'"').length-1;
    assert.ok(count>=3,route+" must be in handler, supported and migrated route tables");
  }
  assert.match(worker,/confirmedPhysicalSample!==true/);
  assert.match(worker,/confirmedPrinterCalibration!==true/);
  assert.match(worker,/template.status!=="approved"/);
});
test("Customer document loads activated layout only for the currently selected bank and preserves legacy fallback",()=>{
  assert.match(custom,/get-workspace-layout-selection/);
  assert.match(custom,/templateCanRender\(state.template,bankInfo.passbookBank/);
  assert.match(custom,/BankFormatPrint/);
  assert.match(custom,/onPr2Complete/);
});
test("Existing verified PR2 bridge is reused, not copied, and completion controls status",()=>{
  assert.match(preview,/\.\/Pr2PrinterDialog/);
  assert.match(preview,/windowsPr2\(\)/);
  assert.match(preview,/className="passbook-page workspace-bridge-page"/);
  assert.match(preview,/className="passbook-shell workspace-bridge-shell"/);
  assert.match(ipc,/\.passbook-page \.passbook-shell/);
  assert.match(custom,/action:"markPassbookPrinted"/);
  assert.match(custom,/if\(!customerRow\)/);
});

test("step 5: custom PR2 uses its own approved values PDF and requires physical receipt",()=>{
 const dialog=file("src/Pr2PrinterDialog.tsx");
 const print=file("src/WorkspaceTemplateDocument.tsx");
 assert.match(dialog,/customPdfBase64\?\?prepared\.pdf/);
 assert.match(dialog,/requirePhysicalConfirmation/);
 assert.match(dialog,/pendingPhysical/);
 assert.match(print,/exportLayoutProofPdf\(/);
 assert.match(print,/isLayoutLayerPrintable/);
 assert.match(print,/requirePhysicalConfirmation/);
 assert.match(print,/I inspected|onPr2Complete/);
});

test("step 6: Master approval is compare-and-swap and preserves template data on concurrent reviews",()=>{
 const start=worker.indexOf('if (route === "/review-layout-template")');
 const end=worker.indexOf('if (route === "/get-workspace-layout-selection"',start);
 const section=worker.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(section,/currentDocument:\{updateTime:found\.updateTime\}/);
 assert.match(section,/updateMask:\{fieldPaths:Object\.keys\(reviewed\)\}/);
 assert.match(section,/Refresh before making a new decision/);
 assert.doesNotMatch(section,/await putDocument\(env,path/);
});

test("Master approval auto-applies a separately calibrated target Quick/PR2 slot atomically",()=>{
 const begin=worker.indexOf('if (route === "/submit-layout-template")');
 const end=worker.indexOf('if (route === "/get-workspace-layout-selection"',begin);
 const text=worker.slice(begin,end);
 for(const expected of [
   "requestedOutput","requestedSlot","autoActivateOnApproval",
   "body.confirmedPhysicalSample===true",
   "body.confirmedPrintedLabels===true",
   "body.confirmedPrinterCalibration===true",
   "layoutSelectionKey(tenantId,template.mode,template.requestedOutput,template.requestedSlot)",
   "normalizedActivationRecord(oldSelection,id,actor.uid,now)",
   "currentDocument:oldSelectionDoc?{updateTime:oldSelectionDoc.updateTime}:{exists:false}",
   "JSON.stringify({writes})"
 ])assert.ok(text.includes(expected),expected);
 assert.match(text,/Master approval cannot auto-activate a different bank/);
 assert.match(text,/The submitting workspace changed bank/);
 const studio=file("src/CustomizeLayoutStudio.tsx");
 assert.match(studio,/autoActivateOnApproval:true/);
 assert.match(studio,/confirmedPrinterCalibration:hardwareChecked/);
 assert.match(studio,/requestedOutput/);
});
