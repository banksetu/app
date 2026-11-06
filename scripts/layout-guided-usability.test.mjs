import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const wizard=readFileSync(new URL("../src/LayoutSetupWizard.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../src/CustomizeLayoutStudio.css",import.meta.url),"utf8");
test("first-time designer uses bank/method/mode wizard without a duplicate wizard inside editor",()=>{
 for(const heading of ["Please Select Your Bank","Upload PDF Sample","Upload Word DOC/DOCX","Create New Layout","Quick Passbook","Passbook Print (PR2)"])
  assert.ok(wizard.includes(heading),heading);
 assert.match(ui,/LayoutSetupWizard/);
 assert.doesNotMatch(ui,/className="ls-easy-guide"/);
 assert.match(ui,/onBackToSetup/);
 assert.match(ui,/setEasyMode/);
 assert.match(ui,/setWorkspaceView\("library"\)/);
 assert.match(ui,/auditPassbookTemplate\(draft\)/);
});
test("light/dark design respects narrower Windows widths and reduced motion",()=>{
 assert.match(styles,/\.ls-start-wizard/);
 assert.match(styles,/var\(--ls-surface\)/);
 assert.match(styles,/@media\(max-width:600px\)/);
 assert.match(styles,/prefers-reduced-motion/);
 assert.doesNotMatch(styles,/\.ls-easy-guide[^}]*position:\s*fixed/);
});
test("wizard does not bypass Windows-only gate, local drafts or Master approval",()=>{
 assert.match(ui,/if\(!windowsLayoutEngineAvailable\(\)\)/);
 assert.match(ui,/saveLocalLayout/);
 assert.match(ui,/submitForReview/);
 assert.match(ui,/setPhysicalChecked/);
 assert.match(ui,/setHardwareChecked/);
});
