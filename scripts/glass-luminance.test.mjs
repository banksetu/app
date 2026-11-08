import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(name)=>fs.readFileSync(name,"utf8");
test("Glass luminance and corner rim are scoped and respond to appearance sliders",()=>{
  const css=read("src/GlassLuminance.css");
  const vars=read("src/core/glassAppearance.ts");
  const entry=read("src/Dashboard.tsx");
  assert.match(entry,/import "\.\/GlassLuminance\.css";/);
  for(const key of ["--glass-rim-gradient","--glass-luminance-opacity","--glass-rim-glow"]){
    assert(vars.includes('"'+key+'"'),key);
    assert(css.includes("var("+key),key+" not used in final stylesheet");
  }
  for(const selector of [
    ".dashboard-stat-card",".dashboard-quick-card",".dashboard-analytics-card",
    ".ssa-kpi",".ssa-panel",".ssa-report-buttons button",".support-home-grid>button",
    ".customer-preview-section",".reports-panel",".sync-card",".license-card",
    ".admin-user-card",".ssa-export-dialog",".pdf-dialog",".dashboard-opening-panel",
    ".dashboard-status-panel",".banksetu-support-popup"
  ])assert(css.includes(selector),"Missing luminous glass surface: "+selector);
  assert.match(css,/background-position:5% center/);
  assert.match(css,/mix-blend-mode:screen/);
  assert.match(css,/mask-composite:exclude/);
  assert.match(css,/@media\(hover:none\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media print/);
  assert.doesNotMatch(css,/setInterval|requestAnimationFrame|window\.|localStorage|indexedDB|firebase/i);
});
test("Only one glass header for bank logo and bank information",()=>{
 const css=read("src/GlassLuminance.css"),dash=read("src/Dashboard.tsx");
 assert.match(css,/\.dashboard-top-bar\s*\{[\s\S]*?background:var\(--glass-fill\)!important/);
 assert.match(css,/\.persistent-bank-header:hover\s*\{[\s\S]*?box-shadow:none!important/);
 assert.match(css,/\.persistent-bank-header::before,/);
 assert.match(css,/\.persistent-bank-header::after/);
 assert.match(dash,/className="persistent-bank-header"/);
 assert.match(dash,/bank-logo-zone/);
 assert.match(dash,/bank-info-strip/);
});
test("SYNC LIVE remain plain text in Glass and KPI privacy toggle is accessible and scoped",()=>{
 const css=read("src/GlassLuminance.css"),dash=read("src/Dashboard.tsx"),global=read("src/App.css");
 assert.match(css,/\.dashboard-stat-badge\s*\{[\s\S]*?border:0!important/);
 assert.match(css,/\.dashboard-stat-badge::before/);
 assert.match(dash,/className="dashboard-kpi-privacy-toggle"/);
 assert.match(dash,/role="switch" aria-checked=\{!kpiPrivacyHidden\}/);
 assert.match(dash,/data-show=\{!kpiPrivacyHidden\}/);
 assert.match(dash,/onClick=\{toggleKpiPrivacy\}/);
 assert.doesNotMatch(dash,/dashboard-kpi-privacy-toggle"[\s\S]{0,240}disabled=/);
 assert.match(dash,/stats-obscured/);
 assert.match(dash,/bankSetuKpiPrivacy:/);
 assert.match(global,/@keyframes banksetu-privacy-smoke/);
 assert.match(global,/filter:blur\(15px\)!important/);
 assert.match(global,/@media\(prefers-reduced-motion:reduce\)/);
});
test("Unpainted search, empty states, and portal popup micro-controls now use Glass",()=>{
 const css=read("src/GlassLuminance.css");
 for(const name of ["passbook-heading p","passbook-empty","passbook-search-card",
   "passbook-search-input","passbook-page .search-button",".customer-search-card",
   ".match-modal",".ssa-export-dialog",".pdf-mode",".pdf-results",
   ".customer-preview-card",".print-alignment-choice"]){
   assert(css.includes(name),"Missing surface "+name);
 }
 const paperSafety=css+"\n"+read("src/GlassTheme.css")+"\n"+read("src/ThemeDeepCoverage.css");
 assert.match(paperSafety,/:not\(\.paper \*\)/);
 assert.match(paperSafety,/:not\(\.print-area \*\)/);
 assert.match(css,/@media print/);
});
