import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
async function sourceModule(path){
  const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
  return import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
}
test("Glass appears as a third saved device-scoped mode; Light/Dark stay compatible",async()=>{
  const mod=await sourceModule("src/core/appearance.ts");
  const memory=new Map();
  const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  assert.equal(mod.storedAppearance(storage,"client-a","tenant-1"),"light");
  storage.setItem(mod.appearanceStorageKey("client-a","tenant-1"),"dark");
  assert.equal(mod.storedAppearance(storage,"client-a","tenant-1"),"dark");
  storage.setItem(mod.appearanceStorageKey("client-a","tenant-1"),"glass");
  assert.equal(mod.storedAppearance(storage,"client-a","tenant-1"),"glass");
  assert.equal(mod.storedAppearance(storage,"client-a","tenant-2"),"light");
  assert.equal(mod.storedAppearance(storage,"client-b","tenant-1"),"light");
  storage.setItem(mod.appearanceStorageKey("client-a","tenant-1"),"nonsense");
  assert.equal(mod.storedAppearance(storage,"client-a","tenant-1"),"light");
});
test("Glass settings sanitize external values, remember current device, and keep tenant isolation",async()=>{
  const mod=await sourceModule("src/core/glassAppearance.ts");
  const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  assert.equal(mod.storedGlassSettings(storage,"user","tenant").design,"liquid");
  const settings=mod.sanitizeGlassSettings({design:"3d",tone:"white",background:"office",transparency:999,blur:-10,animationSpeed:"bad"});
  assert.equal(settings.transparency,100);
  assert.equal(settings.blur,0);
  assert.equal(settings.animationSpeed,mod.DEFAULT_GLASS_SETTINGS.animationSpeed);
  mod.saveGlassSettings(storage,"user","tenant",settings);
  assert.equal(mod.storedGlassSettings(storage,"user","tenant").design,"3d");
  assert.equal(mod.storedGlassSettings(storage,"user","other").design,"liquid");
  assert.equal(mod.glassDarkSurface({...settings,tone:"white"}),false);
  assert.equal(mod.glassDarkSurface({...settings,tone:"black"}),true);
  assert.equal(mod.glassDarkSurface({...settings,tone:"auto",background:"dark"}),true);
  const vars=mod.glassVariables(settings);
  assert.match(vars["--glass-fill"],/rgba\(/);
  assert.match(vars["--glass-blur"],/px$/);
  assert.equal(Object.prototype.hasOwnProperty.call(vars,"--dashboard-bg"),false);
});
test("every page reuses a three-position track; Glass editor only in Admin Menu when selected",()=>{
  const dash=read("src/Dashboard.tsx"),app=read("src/App.css"),panel=read("src/GlassAppearancePanel.tsx");
  assert.match(dash,/banksetu-appearance-track/);
  assert.match(dash,/\["light","dark","glass"\] as Appearance\[\]/);
  assert.match(dash,/aria-pressed=\{appearance===mode\}/);
  assert.match(dash,/appearance==="glass" && <button type="button" className="banksetu-glass-admin-action"/);
  assert.match(dash,/glassDialogOpen&&appearance==="glass"/);
  assert.match(dash,/GlassAppearancePanel/);
  assert.match(dash,/saveGlassPreferences/);
  assert.match(dash,/banksetu-workspace-change/);
  assert.match(app,/banksetu-appearance-track\[data-mode="glass"\]/);
  for(const label of ["Classic Glass","3D Glass","Liquid Glass","White Glass","Black Glass","Full Transparent","Appearance &amp; Background","Save Current Setting"]){
    assert.ok(panel.includes(label),label);
  }
  for(const slider of ["transparency","blur","intensity","glow","shadow","animationSpeed","motionDelay"]){
    assert.ok(panel.includes('key:"'+slider+'"'),slider);
  }
  assert.match(panel,/prepareGlassWallpaper/);
  assert.match(panel,/Remember this setting on this device/);
  assert.match(panel,/role="dialog" aria-modal="true"/);
});
test("Glass remains a paint-only scope, honors responsiveness, portals, animation and print isolation",()=>{
  const theme=read("src/GlassTheme.css"),panelCss=read("src/GlassAppearancePanel.css");
  assert.match(theme,/data-appearance="glass"/);
  for(const className of ["dashboard-status-panel","customer-preview-card","ssa-card-dialog","dashboard-analytics-card","support-page","license-panel","banksetu-admin-menu","dashboard-stat-card","dashboard-top-bar","banksetu-sidebar","banksetu-main-workspace","input,textarea,select"]){
    assert.ok(theme.includes(className),className);
  }
  for(const keyframe of ["glass-section-arrive","glass-popup-arrive","glass-row-arrive"]){
    assert.ok(theme.includes("@keyframes "+keyframe),keyframe);
  }
  assert.match(theme,/var\(--glass-stagger\)/);
  assert.match(theme,/@media\(hover:none\)/);
  assert.match(theme,/@media\(max-width:900px\)/);
  assert.match(theme,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(theme,/@media print/);
  assert.match(theme,/\.bank-format-print-document/);
  assert.match(panelCss,/@media\(max-width:740px\)/);
  assert.match(panelCss,/\.glass-appearance-overlay/);
});
test("Uploaded backgrounds cannot affect customer or sync databases and native host uses an existing theme",()=>{
  const src=read("src/core/glassBackgroundStore.ts"),native=read("src/platform/appearance.ts");
  assert.match(src,/bankSetuAppearanceAssets/);
  assert.doesNotMatch(src,/bankSetuCustomers|bankSetuOffline|updateCustomer|firebase|tenantLicenses/);
  assert.match(src,/image\/jpeg","image\/png","image\/webp/);
  assert.match(src,/1600/);
  assert.match(src,/file\.size>10\*1024\*1024/);
  assert.match(native,/mode==='glass'\?'dark':mode/);
});
