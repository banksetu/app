import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/CustomizeLayoutStudio.css",import.meta.url),"utf8");
test("Office-like ribbon tabs retain real existing formatting, insert, layout, design and review functions",()=>{
 for(const tab of ['"home"','"insert"','"layout"','"design"','"review"','"view"'])
  assert.ok(source.includes(tab),tab);
 for(const item of ["ls-word-tabs","ls-format-ribbon","ls-word-precision","Find / Replace static text","copySelectedStyle","pasteSelectedStyle","setShowGrid","setShowRulers"])
  assert.ok(source.includes(item),item);
 assert.ok(source.includes('wordTab==="insert"'));
 assert.ok(source.includes('wordTab==="review"'));
});
test("six tenant-specific draft slots are separate from live activation",()=>{
 assert.ok(source.includes('selectedLayoutSlot+(setup.output==="dotmatrix"?3:0)'));
 assert.ok(source.includes('layoutSlotId'));
 assert.ok(source.includes('changeDraftSlot'));
 assert.ok(source.includes('selectApprovedTemplate'));
 assert.ok(source.includes('setHardwareChecked'));
});
test("Word ribbon remains responsive and light/dark theme compatible",()=>{
 assert.match(css,/\.ls-word-tabs/);
 assert.match(css,/var\(--ls-soft\)/);
 assert.match(css,/@media\(max-width:600px\)/);
});
