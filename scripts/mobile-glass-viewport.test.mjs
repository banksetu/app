import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const css=read("src/MobileGlassViewportFinish.css");
test("Responsive Glass wallpaper uses saved appearance variables, not mobile white fallback",()=>{
 const dash=read("src/Dashboard.tsx");
 assert.match(dash,/import "\.\/MobileGlassMotionPolish\.css";\s*import "\.\/MobileGlassViewportFinish\.css";/);
 assert.match(css,/html\[data-appearance="glass"\]\s*body\s*\{/);
 assert.match(css,/background-image:var\(--glass-wallpaper/);
 assert.match(css,/html\[data-appearance="glass"\]\[data-glass-dark="false"\]/);
 assert.match(css,/html\[data-appearance="glass"\]\[data-glass-dark="true"\]/);
 assert.match(css,/\.banksetu-main-workspace/);
});
test("Analytics grid has one full-width column on ALL narrow windows",()=>{
 assert.match(css,/\.dashboard-analytics-grid\s*\{/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/\.dashboard-analytics-card:last-child\s*\{/);
 assert.match(css,/grid-column:1\/-1!important/);
 assert.match(css,/max-width:100%!important/);
});
test("Header row one is compact, both actions horizontal above logo and info",()=>{
 const dash=read("src/Dashboard.tsx");
 for(const name of ["dashboard-sync-button","admin-wrapper","persistent-bank-header","bank-logo-zone","bank-info-strip"]){
   assert(dash.includes(name),"Missing actual header node "+name);
   assert(css.includes(name),"Missing responsive header rule "+name);
 }
 assert.match(css,/grid-template-rows:minmax\(42px,auto\) auto!important/);
 assert.match(css,/flex-direction:row!important/);
 assert.match(css,/grid-row:2!important/);
 assert.match(css,/object-fit:contain!important/);
});
test("Mobile styles avoid heavy animation filters and cannot affect print",()=>{
 assert.match(css,/backdrop-filter:none!important/);
 assert.match(css,/will-change:auto!important/);
 assert.match(css,/animation:none!important/);
 assert.match(css,/@media screen and \(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/\.paper\s*\{|\.print-area\s*\{|\.passbook-print-area\s*\{|indexedDB|firebase|window\.print/);
});
