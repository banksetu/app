import test from "node:test";
import assert from "node:assert/strict";
import worker, { firestoreDocumentName, bankFormatSelectionError, workspaceBankSettingsPath, validateWorkspaceBankPatch } from "./worker.js";


test("builds Firestore commit resource names without REST URL prefixes", () => {
  assert.equal(
    firestoreDocumentName({ FIREBASE_PROJECT_ID: "banksetu-69e2f" }, "/tenants/client-123"),
    "projects/banksetu-69e2f/databases/(default)/documents/tenants/client-123",
  );
});

const env = {
  ALLOWED_ORIGINS: "https://banksetu-app.web.app",
};

test("keeps the existing health check available", async () => {
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, protected: true, message: "Bank Setu API is running" });
});

test("allows the configured app origin to preflight the account API", async () => {
  const response = await worker.fetch(new Request("https://worker.example/account-action", {
    method: "OPTIONS",
    headers: { origin: "https://banksetu-app.web.app" },
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://banksetu-app.web.app");
});

test("rejects an unconfigured website origin", async () => {
  const response = await worker.fetch(new Request("https://worker.example/account-action", {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ uid: "target", action: "block" }),
  }), env);
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Origin is not allowed/);
});

test("requires Firebase sign-in before account and tenant setup actions", async () => {
  for (const path of ["/account-action", "/delete-user", "/get-google-setup", "/configure-tenant-data", "/save-bank-format-template", "/save-bank-format-mapping", "/save-workspace-bank-settings"]) {
    const response = await worker.fetch(new Request(`https://worker.example${path}`, {
      method: "POST",
      headers: { origin: "https://banksetu-app.web.app", "content-type": "application/json" },
      body: JSON.stringify({ uid: "target", action: "block" }),
    }), env);
    assert.equal(response.status, 401, path);
    assert.match((await response.json()).error, /Sign in is required/, path);
  }
});

test("bank samples require the currently selected bank and never replace built-in Assam formats", () => {
  assert.match(bankFormatSelectionError("", "Union Bank of India"), /Select and save/);
  assert.match(bankFormatSelectionError("Union Bank of India", "State Bank of India"), /Select and save/);
  assert.equal(bankFormatSelectionError(" Union Bank of India ", "union  bank of india"), "");
  for (const bank of ["Assam Gramin Bank", "Assam Gramin Vikas Bank", "AGVB"]) {
    assert.match(bankFormatSelectionError(bank, bank), /built-in/);
  }
});

test("bank settings are written only to the signed-in administrator's workspace", () => {
  assert.equal(workspaceBankSettingsPath({uid:"client",profile:{role:"client_admin",tenantId:"workspace-1"}}),"/tenantSettings/workspace-1");
  assert.equal(workspaceBankSettingsPath({uid:"user",profile:{role:"client_user",tenantId:"workspace-1"}}),"");
  assert.equal(workspaceBankSettingsPath({uid:"master",profile:{role:"master_owner"}}),"/appSettings/master");
  assert.equal(workspaceBankSettingsPath({uid:"unassigned",profile:{role:"client_admin"}}),"");
});
test("bank settings patches preserve unrelated Drive and template configuration", () => {
  const bankInfo={bankName:" Bank ",passbookBank:"Assam Gramin Bank",branchName:"Branch",cspCode:"",operatorName:"Operator",address:"Address"};
  const patch=validateWorkspaceBankPatch({bankInfo,tenantId:"another-workspace",spreadsheetId:"overwrite",bankFormats:{}});
  assert.equal(patch.bankName,"Bank");assert.deepEqual(patch.bankInfo,{...bankInfo,bankName:"Bank"});
  assert(!("spreadsheetId" in patch));assert(!("bankFormats" in patch));assert(!("tenantId" in patch));
  assert.deepEqual(validateWorkspaceBankPatch({bankLogo:"data:image/png;base64,AAAA"}),{bankLogo:"data:image/png;base64,AAAA"});
  assert.throws(()=>validateWorkspaceBankPatch({bankLogo:"https://untrusted.example/logo"}));
  assert.throws(()=>validateWorkspaceBankPatch({bankLogo:"data:image/png;base64,"+"A".repeat(150000)}));
});
