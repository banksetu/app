import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {inspectLayoutAcceptance,layoutReleaseReady} from "./layout-release-gate.mjs";

const real=()=>readFileSync(new URL("../docs/LAYOUT_ENGINE_ACCEPTANCE.md",import.meta.url),"utf8");

test("Step 10: release blocked until every independent real printer/device sign-off",()=>{
 const markdown=real(),result=inspectLayoutAcceptance(markdown);
 assert.ok(result.total>=46,"do not shrink the official acceptance list");
 assert.ok(result.pending.length>=10,"real hardware and user sign-off are still pending");
 assert.deepEqual(result.invalid,[]);
 assert.deepEqual(result.duplicated,[]);
 assert.deepEqual(result.missingTopics,[],"do not lose any mandatory bank or device criterion");
 assert.equal(layoutReleaseReady(markdown),false);
 assert.ok(result.pending.some(x=>/PLQ-35|PLQ-80|Epson/.test(x)));
});

test("Step 10: current release gate rejects an arbitrary list of 100 checked boxes",()=>{
 const fake=Array.from({length:100},(_,i)=>"- [x] Fake check "+i).join("\n");
 assert.equal(layoutReleaseReady(fake),false);
 assert.ok(inspectLayoutAcceptance(fake).missingTopics.length>0);
});

test("Step 10: mandatory item deletion, duplicates, malformed markers and unsigned items fail closed",()=>{
 const full=real().replace(/- \[ \]/g,"- [x]");
 assert.equal(layoutReleaseReady(full),true,"fully reviewed original list is structurally complete only; real evidence remains human duty");
 const postReleasePending=full.replace(
  /- \[x\] Verify Windows\/Android\/Web published version URLs/,
  "- [ ] Verify Windows/Android/Web published version URLs");
 assert.equal(layoutReleaseReady(postReleasePending),true,
  "a release cannot be blocked waiting for its own future published URLs");
 assert.equal(inspectLayoutAcceptance(postReleasePending).pendingAfterRelease.length,1);
 assert.equal(inspectLayoutAcceptance(postReleasePending).pendingBeforeRelease.length,0);

 assert.equal(layoutReleaseReady(full.replace(/- \[x\] Verify Windows\/Android\/Web published version URLs[^\n]*/,"")),false);
 assert.equal(layoutReleaseReady(full.replace(/- \[x\] Verify Windows\/Android\/Web published version URLs[^\n]*/,"- [x] DUPLICATE")),false);
 assert.equal(layoutReleaseReady(full.replace("- [x] Existing approved Assam Gramin", "- [ ] Existing approved Assam Gramin")),false);
 const copy=full.match(/^- \[x\] (.+)$/m)?.[0];
 assert.ok(copy);
 const repeated=full+"\n"+copy;
 assert.equal(layoutReleaseReady(repeated),false);
 assert.ok(inspectLayoutAcceptance(repeated).duplicated.length>0);
 const malformed=full+"\n- [yes] Physical printer was tested";
 assert.equal(layoutReleaseReady(malformed),false);
 assert.ok(inspectLayoutAcceptance(malformed).invalid.length>0);
});

test("Step 10: read-only checker contains no GitHub merge or Firebase production action",()=>{
 const gate=readFileSync(new URL("./layout-release-gate.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(gate,/merge_pull_request|github\.rest\.pulls\.merge|firebase deploy|firestoreRequest|writeFileSync/);
 assert.match(gate,/process\.exitCode=1/);
});

test("Step 10: invoking the real release gate CLI exits nonzero with unsigned physical approvals",()=>{
 const script=new URL("./layout-release-gate.mjs",import.meta.url);
 const output=spawnSync(process.execPath,[script.pathname],{encoding:"utf8"});
 assert.equal(output.status,1,"draft gate must fail closed before any merge or release");
 assert.match(output.stderr,/LAYOUT DRAFT ONLY.*BLOCKED/);
 assert.match(output.stderr,/pre-release checks remain unsigned/);
 assert.equal(output.stdout,"");
});
