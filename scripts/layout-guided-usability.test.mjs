import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../src/CustomizeLayoutStudio.css",import.meta.url),"utf8");
test("Windows layout has three real guided steps and Advanced Mode without deleting existing tools",()=>{
 assert.match(ui,/setEasyMode/);
 for(const step of ['"start"','"edit"','"check"'])assert.ok(ui.includes(step));
 for(const phrase of ["Easy Layout Builder","Create blank layout","Import sample PDF","Next: Design","Next: Check & save","Check layout","Save draft","Advanced tools","Back to Easy Mode"])assert.ok(ui.includes(phrase),phrase);
 assert.match(ui,/setWorkspaceView\("library"\)/);
 assert.match(ui,/save\(\)/);
 assert.match(ui,/auditPassbookTemplate\(draft\)/);
});
test("guided visual layout is responsive, theme-backed and non-printing",()=>{
 assert.match(styles,/\.ls-easy-guide/);
 assert.match(styles,/var\(--ls-surface\)/);
 assert.match(styles,/\.ls-guided\[data-step="start"\]/);
 assert.match(styles,/\.ls-guided\[data-step="check"\]/);
 assert.match(styles,/@media \(max-width:850px\)/);
 assert.match(styles,/prefers-reduced-motion/);
 assert.doesNotMatch(styles,/\.ls-easy-guide[^}]*position:\s*fixed/);
});
test("guided workflow does not bypass Windows-only gate or approvals",()=>{
 assert.match(ui,/if\(!windowsLayoutEngineAvailable\(\)\)/);
 assert.match(ui,/approve/);
 assert.match(ui,/setPhysicalChecked/);
 assert.match(ui,/setHardwareChecked/);
});
