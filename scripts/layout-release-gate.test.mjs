import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectLayoutAcceptance,layoutReleaseReady} from "./layout-release-gate.mjs";
test("Step 10: current engine CANNOT claim complete or release without unsigned hardware checks",()=>{
 const markdown=readFileSync(new URL("../docs/LAYOUT_ENGINE_ACCEPTANCE.md",import.meta.url),"utf8");
 const result=inspectLayoutAcceptance(markdown);
 assert.ok(result.total>=25,"actual acceptance list must remain substantive");
 assert.ok(result.pending.length>=10,"real hardware and user sign-off must not be silently presumed complete");
 assert.equal(layoutReleaseReady(markdown),false);
 assert.ok(result.pending.some(x=>/PLQ-35|PLQ-80|Epson/.test(x)));
});
test("Step 10: review gate accepts ONLY fully signed criteria and never starts a release",()=>{
 const entries=Array.from({length:26},(_,i)=>"- [x] Evidence #"+i).join("\n");
 assert.equal(layoutReleaseReady(entries),true);
 assert.equal(layoutReleaseReady(entries.replace("- [x] Evidence #17","- [ ] Evidence #17")),false);
 assert.equal(layoutReleaseReady("- [x] Tiny checklist"),false);
});
