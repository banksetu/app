import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../src/Dashboard.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/CustomizeLayoutStudio.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/CustomizeLayoutStudio.css", import.meta.url), "utf8");

test("Admin menu contains Customize Layout above License Management and Logout", () => {
  const marker = dashboard.indexOf('✏️ Customize Layout');
  const passbook = dashboard.indexOf('Customize Passbook</button>', marker);
  const account = dashboard.indexOf('Customize Account Opening Form</button>', marker);
  const license = dashboard.indexOf('🪪 License Management</button>', marker);
  const logout = dashboard.indexOf('↪ Logout', marker);
  assert.ok(marker > 0 && passbook > marker && account > passbook && license > account && logout > license);
});

test("Both customization pages use a lazy loaded editor", () => {
  assert.match(dashboard, /lazy\(\(\) => import\("\.\/CustomizeLayoutStudio"\)\)/);
  assert.match(dashboard, /"customize-passbook"/);
  assert.match(dashboard, /"customize-account-opening"/);
  assert.match(dashboard, /canCustomizeLayout && bankSettingsReady/);
});

test("Editor drafts remain isolated from live PR2 and backend mutations", () => {
  assert.match(editor, /bankSetuLayoutDraft:v1:/);
  assert.match(editor, /bankSetuTenantId/);
  assert.match(editor, /Local draft only/);
  assert.doesNotMatch(editor, /setDoc\(|updateDoc\(|localDataFetch\(|\/save-bank-format-template|\/save-bank-format-mapping/);
  assert.match(editor, /\/submit-layout-template/);
  assert.match(editor, /\/review-layout-template/);
});

test("Basic editor features and dark/light variants are present", () => {
  for (const label of ["Upload PDF", "Customer Field", "Bank Information", "Photo Box", "Branch Manager", "Default / Preview value", "Text alignment", "Text color", "Background color", "Rotation (°)", "Dot Matrix output", "Preprinted on paper", "Undo", "Redo"]) {
    assert.ok(editor.includes(label), "Missing control: " + label);
  }
  assert.match(css, /data-appearance="dark"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width:750px/);
});

// Include conservative A4 scanner geometry tests in the minimal draft CI job.
import "./layout-scan-geometry.test.mjs";

import "./layout-field-inference.test.mjs";

import "./layout-native-ocr.test.mjs";

import "./layout-visual-diff.test.mjs";

import "./layout-template-audit.test.mjs";
