import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const css=read("src/GlassFormPopupPolish.css");
test("Customer Entry form retains accessible high-contrast labels and glass controls",()=>{
  const c=read("src/CustomerEntry.tsx");
  assert.equal((c.match(/className="customer-tool-card" style=\{styles\.toolCard\}/g)||[]).length,2);
  assert.match(c,/className="customer-field" style=\{styles\.field\}/);
  for(const sel of [".customer-entry-wrapper",".customer-field>span",
    ".customer-field>input",".customer-field>textarea",".customer-field>select",
    ".customer-photo-card",".customer-photo-area",".customer-tool-card",
    ".customer-form-card",".customer-form-grid"]){
    assert(css.includes(sel),"Missing real customer form selector: "+sel);
  }
  assert.match(css,/color:var\(--glass-text\)!important/);
  assert.match(css,/visibility:visible!important/);
  assert.match(css,/-webkit-text-fill-color:currentColor!important/);
  assert.match(css,/@media screen and \(max-width:520px\)/);
});
test("Glass popup surface is translucent with restrained blur, while actual A4 is untouched",()=>{
  const dash=read("src/Dashboard.tsx");
  assert.match(dash,/import "\.\/GlassLuminance\.css";\s*import "\.\/GlassFormPopupPolish\.css";/);
  for(const sel of [".ssa-export-overlay",".ssa-export-dialog",".ssa-card-dialog",
    ".customer-preview-overlay",".customer-preview-card",".customer-preview-section",
    ".customer-preview-content",".customer-preview-section dt",
    ".dashboard-opening-panel",".match-modal",".pdf-dialog",
    ".pr2-dialog",".license-drawer",".banksetu-glass-inline-dialog"]){
    assert(css.includes(sel),"Uncovered popup: "+sel);
  }
  assert.match(css,/backdrop-filter:blur\(3px\)!important/);
  assert.match(css,/blur\(min\(12px,var\(--glass-blur\)\)\)/);
  assert.match(css,/--glass-dialog-surface:color-mix/);
  assert.match(css,/@media print/);
  assert.doesNotMatch(css,/\.print-area\s*\{\s*background:var\(--glass-fill\)/);
  assert.doesNotMatch(css,/\.paper\s*\{\s*background:var\(--glass-fill\)/);
});
test("Glass hover reflection is optional and doesn't move form measurements",()=>{
  assert.match(css,/background-position:3% center/);
  assert.match(css,/var\(--glass-luminance-opacity/);
  assert.match(css,/@media screen and \(hover:none\)/);
  assert.match(css,/@media screen and \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/setTimeout|requestAnimationFrame|@media\s*print\s*\{[^}]*\.paper\s*\{background/);
});
