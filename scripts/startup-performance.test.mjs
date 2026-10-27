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
