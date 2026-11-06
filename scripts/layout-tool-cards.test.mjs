import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/CustomizeLayoutStudio.css",import.meta.url),"utf8");
test("layout actions are grouped into independent task cards",()=>{
 for(const label of ["Start & Import","Text & Customer Data","Graphics & Shapes","MS Word-style Tools","Page & Preview","More tools & exports"])
  assert.ok(ui.includes(label),label);
 for(const action of ["Upload PDF","＋ Text","＋ Customer","＋ Bank Field","＋ Dot Matrix","▣ Photo Box","▢ Rectangle","Find / Replace static text","Distribute horizontally","Export JSON","Save Draft to Offline DB"])
  assert.ok(ui.includes(action),action);
});
test("Word features stay grouped and printer/approval safeguards remain",()=>{
 const start=ui.indexOf('className="ls-word-suite"'),end=ui.indexOf('className="ls-scan-proposal"',start);
 const suite=ui.slice(start,end);
 for(const feature of ["ls-format-ribbon","Find / Replace static text","ls-word-precision","Group","Unlock","Letter gap","Font compress"])assert.ok(suite.includes(feature),feature);
 assert.match(ui,/if\(!windowsLayoutEngineAvailable\(\)\)/);
 assert.match(ui,/auditPassbookTemplate\(draft\)/);
 assert.match(ui,/setHardwareChecked/);
});
test("card styles are theme aligned, responsive and reduced-motion compatible",()=>{
 for(const selector of [".ls-tool-collection",".ls-tool-card",".ls-word-suite",".ls-page-card",".ls-header-extra"])
 assert.ok(css.includes(selector),selector);
 assert.match(css,/var\(--ls-surface\)/);
 assert.match(css,/@media\(max-width:920px\)/);
 assert.match(css,/prefers-reduced-motion/);
});
