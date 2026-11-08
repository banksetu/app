import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(path,"utf8");
const coverage=read("src/GlassCoverage.css");
const theme=read("src/GlassTheme.css");
const combined=theme+"\n"+coverage+"\n"+read("src/GlassAppearancePanel.css")+"\n"+read("src/GlassStudioCoverage.css");
const source=fs.readdirSync("src").filter(name=>/\.(tsx|ts)$/.test(name))
  .map(name=>read("src/"+name)).join("\n");
const areas={
  "SSA Campaign & action buttons":["ssa-banner","ssa-kpi","ssa-panel","ssa-editor","ssa-reports","ssa-table-wrap","ssa-save","ssa-update","ssa-search","ssa-schemes","ssa-report-buttons","ssa-check","ssa-edit-btn"],
  "SSA PDF/Excel/Share/Print popup":["ssa-export-overlay","ssa-export-dialog","ssa-export-group","ssa-export-preview","ssa-export-matches","ssa-export-actions","ssa-export-date","ssa-export-selected"],
  "SSA KPI customer popup":["ssa-card-overlay","ssa-card-dialog","ssa-card-table-wrap","ssa-card-heading","ssa-card-pdf","ssa-card-customer-link"],
  "Dashboard & month opening popup":["banksetu-app-shell","banksetu-sidebar","banksetu-main-workspace","dashboard-top-bar","dashboard-stats-grid","dashboard-stat-card","dashboard-analytics-card","dashboard-status-panel","dashboard-opening-panel","dashboard-opening-overview","dashboard-opening-filters","dashboard-opening-tabs","dashboard-opening-number"],
  "Customer, Passbook and AOF UI":["customer-entry-wrapper","customer-form-card","customer-search-card","customer-camera-dialog","customer-delete-dialog","customer-preview-card","customer-preview-section","match-modal","pdf-dialog","passbook-search-card","passbook-shell","edit-panel"],
  "PR2 / Alignment / PDF mapping windows":["pr2-overlay","pr2-dialog","print-alignment-window","print-alignment-settings","print-alignment-choice","banksetu-glass-mapping-dialog","banksetu-mapping-field-marker"],
  "Licensing":["license-panel","license-card","license-banner","license-summary","license-tile","license-history","license-drawer","license-modal","license-plan-badge","license-tabs"],
  "Sync and Backup":["sync-center","sync-card","sync-dialog-panel","sync-maintenance","sync-error-card"],
  "Support":["support-page","support-hero","chat-panel","message-list","conversation-list","chat-compose","announcement-editor","faq-list","banksetu-floating-support"],
  "Word-like template editor":["layout-studio","ls-header","ls-ribbon","ls-format-ribbon","ls-tool-card","ls-word-tabs","ls-page-setup-dialog","ls-page-setup","ls-map-overlay","ls-catalog-card"],
  "System, inline Admin and app dialogs":["app-message-dialog","banksetu-admin-menu","banksetu-glass-inline-dialog","banksetu-glass-modal-overlay","master-client-form","admin-users-panel","update-dialog"]
};
test("Glass paint selectors cover 100 audited real UI surfaces without relying on screenshot mockups",()=>{
  const entries=Object.entries(areas).flatMap(([area,names])=>names.map(name=>({area,name})));
  assert.equal(entries.length,100);
  for(const {area,name} of entries){
    assert.ok(combined.includes("."+name),area+" :: "+name+" has no Glass CSS rule");
    assert.ok(source.includes(name),area+" :: "+name+" no longer maps to source UI");
  }
});
test("All separate popup layers and small actions receive Glass presentation",()=>{
  const overlays=["ssa-export-overlay","ssa-card-overlay","dashboard-opening-overlay",
    "pr2-overlay","print-alignment-overlay","print-alignment-choice-overlay",
    "customer-delete-overlay","license-modal-backdrop","update-backdrop",
    "customer-preview-overlay","match-modal-backdrop","customer-camera-overlay",
    "banksetu-glass-mapping-overlay","banksetu-glass-modal-overlay"];
  for(const item of overlays)assert.match(coverage,new RegExp("\\."+item+"\\b"),item);
  for(const item of ["ssa-save","ssa-update","ssa-check","ssa-edit-btn","ssa-card-pdf",
    "banksetu-floating-support","support-message-actions","update-progress",
    "input[type=\"checkbox\"]","input[type=\"radio\"]","input[type=\"range\"]"]){
    assert.ok(coverage.includes(item),item);
  }
  const dash=read("src/Dashboard.tsx");
  assert.equal((dash.match(/className="banksetu-glass-modal-overlay"/g)||[]).length,7);
  assert.equal((dash.match(/className="banksetu-glass-inline-dialog(?:\s[^"}]*)?"/g)||[]).length,7);
  assert.match(dash,/import "\.\/GlassCoverage\.css";/);
  assert.match(dash,/appearance==="glass" && <button type="button" className="banksetu-glass-admin-action"/);
});
test("Glass is isolated from paper geometry, document export, and other modes",()=>{
  assert.match(coverage,/@media screen/);
  assert.match(coverage,/@media print/);
  assert.match(theme,/@media print/);
  for(const paper of ["paper","print-area","passbook-print-area","central-bank-document",
    "bank-format-print-document","customer-pdf-page","workspace-template-page"]){
    assert.ok(combined.includes("."+paper),paper);
  }
  for(const selector of ["banksetu-mapping-canvas","banksetu-mapping-field-marker"]){
    assert.ok(source.includes(selector),selector);
  }
  assert.match(coverage,/\.banksetu-mapping-field-marker:hover\s*\{\s*transform:translate\(-2px,-2px\)!important/);
  assert.match(theme,/:not\(\.paper \*\)/);
  assert.match(theme,/:not\(\.bank-format-print-document \*\)/);
  assert.match(theme,/:not\(\.central-bank-document \*\)/);
  assert.match(coverage,/:not\(\.banksetu-mapping-field-marker\):hover/);
});
test("Glass preserves accessible motion and mobile resource limits",()=>{
  assert.match(coverage,/@media screen and \(max-width:900px\)/);
  assert.match(coverage,/@media screen and \(hover:none\)/);
  assert.match(coverage,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(theme,/@media\(max-width:900px\)/);
  assert.match(theme,/glass-popup-arrive/);
  assert.match(theme,/glass-row-arrive/);
  assert.match(coverage,/var\(--glass-stagger\)/);
  assert.match(coverage,/:focus-visible/);
  assert.match(coverage,/:disabled/);
  const root=read("src/core/glassBackgroundStore.ts");
  assert.match(root,/sample\.width=32;sample\.height=32/);
  assert.match(root,/drawImage\(canvas,0,0,canvas\.width,canvas\.height,0,0,32,32\)/);
  assert.doesNotMatch(root,/bankSetuCustomer|bankSetuOffline/);
});
