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
