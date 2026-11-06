import test from "node:test";
import assert from "node:assert/strict";
import {layoutSelectionKey,normalizedActivationRecord,previousApprovedVersion} from "../cloudflare/layoutActivation.js";
const first="01234567-89ab-cdef-0123-456789abcdef",second="fedcba98-7654-3210-fedc-ba9876543210";
test("selection keys are workspace and mode scoped",()=>{
 assert.equal(layoutSelectionKey("tenant-one","passbook"),"tenant-one-passbook");
 assert.notEqual(layoutSelectionKey("tenant-one","passbook"),layoutSelectionKey("tenant-two","passbook"));
 for(const input of ["../admin","a/b",""]) assert.throws(()=>layoutSelectionKey(input,"passbook"));
 assert.throws(()=>layoutSelectionKey("tenant-one","../../accountOpening"));
});
test("activation revision history and rollback candidate remain bounded",()=>{
 const firstSelection=normalizedActivationRecord({},first,"owner","2026-11-01T01:00:00Z");
 assert.equal(firstSelection.revision,1);
 assert.equal(firstSelection.templateId,first);
 const secondSelection=normalizedActivationRecord(firstSelection,second,"owner","2026-11-01T02:00:00Z");
 assert.equal(secondSelection.revision,2);
 assert.equal(previousApprovedVersion(secondSelection),first);
 const previous=normalizedActivationRecord(secondSelection,previousApprovedVersion(secondSelection),"owner","2026-11-01T03:00:00Z");
 assert.equal(previous.templateId,first);
 assert.equal(previous.revision,3);
 assert.equal(previousApprovedVersion(previous),second);
 assert.throws(()=>normalizedActivationRecord(firstSelection,first,"owner","2026-11-01T01:00:00Z"));
});
test("disable keeps history without losing the old approved template",()=>{
 const firstSelection=normalizedActivationRecord({},first,"owner","2026-11-01T01:00:00Z");
 const disabled=normalizedActivationRecord(firstSelection,null,"owner","2026-11-01T02:00:00Z");
 assert.equal(disabled.templateId,"");
 assert.equal(previousApprovedVersion(disabled),first);
});
