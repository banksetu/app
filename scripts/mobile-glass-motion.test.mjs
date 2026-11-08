import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const css=read("src/MobileGlassMotionPolish.css");
test("mobile Glass no longer creates a full-screen blurred compositing ghost",()=>{
 const dash=read("src/Dashboard.tsx");
 assert.match(dash,/import "\.\/MobileGlassMotionPolish\.css";/);
 assert.match(css,/\.banksetu-app-shell::before/);
 assert.match(css,/content:none!important/);
 assert.match(css,/background-image:var\(--glass-wallpaper\)!important/);
 assert.match(css,/\.dashboard-analytics-grid/);
 assert.match(css,/animation:none!important/);
 assert.match(css,/backdrop-filter:none!important/);
 assert.match(css,/\.dashboard-top-bar>\.persistent-bank-header/);
 assert.match(css,/grid-column:1\/-1!important/);
});
test("Glass sliders preview CSS vars directly rather than repeatedly re-rendering all customers",()=>{
 const dash=read("src/Dashboard.tsx"),panel=read("src/GlassAppearancePanel.tsx");
 assert.match(dash,/useCallback\(\(draft:GlassSettings,previewWallpaperUrl\?:string\)=>/);
 assert.match(dash,/root\.style\.getPropertyValue\(key\)!==value/);
 assert.match(dash,/onPreview=\{previewGlassPreferences\}/);
 assert.doesNotMatch(dash,/onPreview=\{setGlassSettings\}/);
 assert.match(panel,/onPreview\(draft,previewUrl\|\|existingCustomUrl\)/);
 assert.match(panel,/onChange=\{e=>set\(\{\[item\.key\]:Number\(e\.target\.value\)\}\)\}/);
 assert.match(css,/input\[type="range"\]/);
 assert.match(css,/touch-action:pan-x!important/);
 assert.match(css,/\.glass-appearance-scroll>fieldset/);
});
test("Glass settings, sync cards and all three themes retain legible mobile controls",()=>{
 for(const key of [".admin-users-toolbar",".settings-admin-hero",".sync-header",".sync-protection",
   ".sync-summary",".sync-health",".glass-appearance-panel",".glass-slider-line",
   ".banksetu-appearance-track",".banksetu-appearance-thumb","banksetu-theme-tab-ack",
   "prefers-reduced-motion"]){
  assert(css.includes(key),"Missing "+key);
 }
 assert.match(css,/color:var\(--glass-text\)!important/);
 assert.match(css,/background:var\(--glass-fill-strong\)!important/);
 assert.match(css,/overflow-y:auto!important/);
});
test("appearance and motion patches never touch print, customer DB, auth or sync engines",()=>{
 assert.doesNotMatch(css,/\.paper\s*\{|\.print-area\s*\{|\.passbook-print-area\s*\{|@media print\s*\{/);
 assert.doesNotMatch(css,/indexedDB|firebase|sheetId|localDataFetch|window\.print|fetch\(/);
});
