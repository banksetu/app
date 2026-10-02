import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

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
  for (const path of ["/account-action", "/delete-user", "/get-google-setup", "/configure-tenant-data"]) {
    const response = await worker.fetch(new Request(`https://worker.example${path}`, {
      method: "POST",
      headers: { origin: "https://banksetu-app.web.app", "content-type": "application/json" },
      body: JSON.stringify({ uid: "target", action: "block" }),
    }), env);
    assert.equal(response.status, 401, path);
    assert.match((await response.json()).error, /Sign in is required/, path);
  }
});
