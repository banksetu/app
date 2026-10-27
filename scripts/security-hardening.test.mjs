import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("production PDF dependencies exclude known vulnerable releases", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies.jspdf, "4.2.1");
  assert.equal(pkg.dependencies.dompurify, "3.4.17");
});

test("web and Electron documents receive baseline anti-injection headers", () => {
  const firebase = JSON.parse(read("firebase.json"));
  const global = firebase.hosting.headers.find(item => item.source === "**")?.headers || [];
  const headers = new Map(global.map(item => [item.key.toLowerCase(), item.value]));
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.match(headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  const protocol = read("desktop/app-protocol.cjs");
  assert.match(protocol, /X-Content-Type-Options/);
  assert.match(protocol, /frame-ancestors 'none'/);
});

test("Android sharing is cache-only and update input is bounded", () => {
  const paths = read("android/app/src/main/res/xml/file_paths.xml");
  assert.doesNotMatch(paths, /external-path/);
  assert.match(paths, /cache-path/);
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:name="androidx\.core\.content\.FileProvider"[\s\S]*?android:exported="false"/);
  const updater = read("android/app/src/main/java/in/banksetu/android/BankSetuUpdatePlugin.java");
  assert.match(updater, /MAX_APK_BYTES/);
  assert.match(updater, /getUserInfo\(\) != null/);
  assert.match(updater, /Downloaded update is not an APK file/);
});

test("third-party GitHub Actions are pinned to immutable commits", () => {
  const root = new URL("../.github/workflows/", import.meta.url);
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    for (const line of read(path.posix.join(".github/workflows", name)).split(/\r?\n/)) {
      const use = line.match(/^\s*- uses:\s*([^#\s]+)(?:\s*#.*)?$/)?.[1];
      if (use && !use.startsWith("./")) assert.match(use, /@[a-f0-9]{40}$/, `${name}: ${use}`);
    }
  }
});
