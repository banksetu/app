import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(path,"utf8");
const ssa=read("src/SsaAppearance.css"),studio=read("src/GlassVisualPolish.css");
test("SSA Campaign imports a dedicated Dark and Glass paint layer after the original styles",()=>{
  const component=read("src/SsaCampaign.tsx");
  assert.match(component,/import "\.\/SsaCampaign\.css";\s*import "\.\/SsaAppearance\.css";/);
  assert.match(ssa,/html\[data-appearance="dark"\] \.banksetu-app-shell \.ssa-campaign/);
  assert.match(ssa,/html\[data-appearance="glass"\] \.banksetu-app-shell \.ssa-campaign/);
  for(const selector of [".ssa-banner",".ssa-kpi",".ssa-panel",".ssa-customer",".ssa-schemes label",
    ".ssa-search button",".ssa-report-buttons button",".ssa-table-wrap",".ssa-entries",'.ssa-chips button.active',
    ".ssa-entry-meta span",".ssa-help",".ssa-save-buttons",".ssa-matches",".ssa-banner-controls"]){
    assert.ok(ssa.includes(selector),"Missing SSA theme selector "+selector);
  }
  assert.match(ssa,/@media screen and \(max-width:850px\)/);
  assert.match(ssa,/@media screen and \(max-width:500px\)/);
  assert.match(ssa,/@media screen and \(max-width:340px\)/);
  assert.match(ssa,/@media screen and \(hover:none\)/);
  assert.match(ssa,/@media screen and \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(ssa,/\.ssa-print-report\s*\{/,"Printable SSA report geometry must not be redesigned");
});
test("Bank header glass applies to logo container AND uploaded bank information, never photo pixels",()=>{
  const dash=read("src/Dashboard.tsx");
  assert.match(dash,/import "\.\/GlassVisualPolish\.css";/);
  for(const selector of [".persistent-bank-header",".bank-logo-zone",".bank-info-strip",
    ".bank-logo-zone img",".bank-info-edit-pencil",".logo-edit-pencil"]){
    assert.ok(studio.includes(selector),selector);
  }
  assert.match(studio,/object-fit:contain!important/);
  assert.match(studio,/filter:none!important/);
  assert.match(studio,/var\(--glass-fill\)/);
  assert.match(studio,/@media screen and \(max-width:760px\)/);
});
test("Settings client workspace and empty assigned users list use glass instead of forced white",()=>{
  for(const className of [".admin-users-panel",".admin-client-workspace",".admin-client-children",
    ".admin-user-card",".admin-users-toolbar",".admin-client-seat-count",
    ".admin-user-status.status-approved",".admin-user-actions"]){
    assert.ok(studio.includes(className),className);
  }
  assert.match(studio,/\.settings-page\s+:is\(/);
  assert.match(studio,/background:var\(--glass-fill\)!important/);
});
test("Dashboard animation is staggered rather than artificially delaying app data",()=>{
  const vars=read("src/core/glassAppearance.ts");
  assert.match(vars,/"--glass-entry-motion"/);
  assert.match(vars,/"--glass-stagger":Math\.round\(s\.motionDelay\*1\.18\*\(1\.55-s\.animationSpeed\*\.011\)\)/);
  for(const cls of [".dashboard-top-bar",".dashboard-stats-grid",".dashboard-quick-grid",
    ".dashboard-analytics-grid"]){
    assert.ok(studio.includes(cls),cls);
  }
  assert.match(studio,/animation-delay:1060ms!important/);
  assert.match(studio,/@media screen and \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(studio,/setTimeout|await |fetch\(|localStorage\.|indexedDB\./);
});
