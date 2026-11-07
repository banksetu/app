import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/CustomizeLayoutStudio.css",import.meta.url),"utf8");
test("Word File groups Save, Master submission and JSON backup without redundant cards",()=>{
 for(const feature of ["MS Word-style Tools","File · Draft · Approval · Backup",
   "Save Draft","Save &amp; Submit to Master","Download Editable Backup",
   "Restore Editable Backup","Open PDF Sample","Open Word"]){
  assert.ok(ui.includes(feature),feature);
 }
 for(const old of ["Start & Import","Text & Customer Data","Graphics & Shapes","Page & Preview","More tools & exports"])
  assert.ok(!ui.includes(old),"removed duplicate card: "+old);
 assert.ok(ui.includes('wordTab==="insert"'));
 assert.ok(ui.includes('wordTab==="layout"'));
});

test("Word features stay grouped and printer/approval safeguards remain",()=>{
 const suite=ui.slice(ui.indexOf('className="ls-tool-card ls-word-suite"'));
 for(const feature of ["ls-format-ribbon","Find / Replace static text","ls-word-precision","Group","Unlock","Letter gap","Font compress"])assert.ok(suite.includes(feature),feature);
 assert.match(ui,/if\(!windowsLayoutEngineAvailable\(\)&&!previewOnly\)/);
 assert.match(ui,/auditPassbookTemplate\(draft\)/);
 assert.match(ui,/setHardwareChecked/);
});
test("card styles are theme aligned, responsive and reduced-motion compatible",()=>{
 for(const selector of [".ls-tool-card",".ls-word-suite",".ls-word-tabs",".ls-canvas-wrap",".ls-workspace"])
 assert.ok(css.includes(selector),selector);
 assert.match(css,/var\(--ls-surface\)/);
 assert.match(css,/@media\(max-width:920px\)/);
 assert.match(css,/prefers-reduced-motion/);
});
