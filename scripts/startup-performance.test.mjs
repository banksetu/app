import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("startup keeps heavy dashboard and document pages out of the entry bundle", () => {
  const app = read("src/App.tsx");
  const dashboard = read("src/Dashboard.tsx");
  assert.match(app, /lazy\(\(\) => import\("\.\/Dashboard"\)\)/);
  for (const page of ["CustomerEntry", "SelectedBankDocument", "Customers", "AdvancedAdmin", "Reports"])
    assert.match(dashboard, new RegExp(`lazy\\(\\(\\) => import\\(\\"\\.\\/${page}\\"\\)\\)`), page);
});

test("motion stays paint-only and mobile passbook fitting never changes print geometry", () => {
  const list=read("src/AllCustomerData.tsx");
  const css=read("src/App.css");
  assert.match(list,/all-customer-row-enter/);
  assert.match(list,/index<25/);
  assert.match(list,/banksetu-customer-row-in/);
  assert.match(css,/--motion-accent:#1677df/);
  assert.match(css,/data-appearance="dark"[^}]*--motion-accent:#36d7e7/s);
  assert.match(css,/@keyframes banksetu-page-arrive/);
  assert.match(css,/@keyframes banksetu-popup-arrive/);
  assert.doesNotMatch(css,/\.dashboard-stat-card[^\{]*\{[^}]*transition:[^}]*background-color/s);
  assert.match(css,/@media screen and \(max-width:420px\)[\s\S]*zoom:\.39/);
  assert.match(css,/@media print[\s\S]*bank-format-print-document\{zoom:1!important;animation:none!important\}/);
});

test("Windows first paint does not wait for installed printer enumeration", () => {
  const main = read("desktop/main.cjs");
  assert.doesNotMatch(main, /await appMenu\.refreshPrinters\(\)/);
  assert.match(main, /setImmediate\(\(\)=>void appMenu\.refreshPrinters\(\)\)/);
});

test("Windows database startup keeps crash recovery but skips repeated full scans", () => {
  const store = read("desktop/store.cjs");
  assert.match(store, /uncleanShutdown/);
  assert.match(store, /Date\.now\(\)-lastIntegrityCheck>24\*60\*60\*1000/);
  assert.match(store, /WHERE typeof\(payload\) != 'text'/);
  assert.match(store, /fs\.unlinkSync\(openMarker\)/);
});

test("All Customer Data preloads locally, renders bounded pages and shares no account metadata", () => {
  const list=read("src/AllCustomerData.tsx");
  const dashboard=read("src/Dashboard.tsx");
  const cache=read("src/customerListCache.ts");
  assert.match(list,/const LOCAL_PAGE_SIZE = 200/);
  assert.match(cache,/customerListCache/);
  assert.match(cache,/export async function preloadAllCustomerData/);
  assert.match(dashboard,/preloadAllCustomerData\(\)/);
  assert.match(list,/querySelectorAll\("\.customer-preview-share-exclude"\)/);
  assert.match(list,/customer-preview-identity customer-preview-share-exclude/);
  assert.match(list,/customer-preview-bottom customer-preview-share-exclude/);
  assert.match(list,/customer-preview-section customer-preview-share-exclude/);
  assert.match(list,/customer-preview-card \{[^}]*text-align:left/);
  assert.match(list,/customer-preview-section dd \{[^}]*text-align:left/);
  assert.match(list,/function applyShareCaptureTheme/);
  assert.match(list,/dataset\.appearance === "dark"/);
  assert.match(list,/setProperty\(property,item,"important"\)/);
  assert.match(list,/card:\"#0b1424\"/);
  assert.match(list,/card:\"#fff2f5\"/);
});
