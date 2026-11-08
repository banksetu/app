import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const css=read("src/MobileLiquidGlassFix.css"), data=read("src/AllCustomerData.tsx"),dash=read("src/Dashboard.tsx");
test("mobile viewport uses border-box, contains the dashboard and does not widen root",()=>{
 assert.match(dash,/import "\.\/MobileLiquidGlassFix\.css";/);
 for(const key of ["box-sizing:border-box!important","width:100%!important","max-width:100%!important","overflow-x:clip!important",
 "grid-template-columns:repeat(2,minmax(0,1fr))!important",
 ".dashboard-top-bar",".persistent-bank-header",".bank-info-strip",
 ".dashboard-stats-grid",".dashboard-quick-grid",".dashboard-analytics-grid"]){
  assert(css.includes(key),"Mobile containment missing "+key);
 }
});
test("All Customer Data uses actual mobile row labels and Glass surfaces",()=>{
 assert.match(data,/className="all-customer-table-scroll"/);
 assert.match(data,/className="all-customer-table"/);
 const labels=["Customer ID","Name","Account Number","Mobile Number","Aadhaar Number","Account Opening Date"];
 for(const name of labels){assert(data.includes('data-label="'+name+'"'),"Missing card label "+name);}
 assert.match(data,/className="all-customer-account-value"/);
 assert.match(css,/\.all-customer-table tbody tr:nth-child\(even\)/);
 assert.match(css,/\.all-customer-table tbody td::before/);
 assert.match(css,/background:var\(--glass-fill-strong\)!important/);
 assert.match(css,/overflow-x:hidden!important/);
 assert.match(data,/event\.stopPropagation\(\)/);
});
test("This Month Account Openings uses original report and bounded portal glass",()=>{
 const report=read("src/DashboardAccountOpeningReport.tsx");
 assert.match(report,/return createPortal\(/);
 assert.match(report,/setPreviewCustomer\(row\)/);
 for(const key of [".dashboard-opening-overlay",".dashboard-opening-panel",".dashboard-opening-table-scroll",
 ".dashboard-opening-overview",".dashboard-opening-status.is-active",
 ".dashboard-opening-panel tbody tr",".dashboard-opening-panel tbody td::before",
 "max-height:calc(100dvh","overflow-y:auto!important","overflow-x:hidden!important","position:sticky"]){
  assert(css.includes(key),"Report modal coverage missed "+key);
 }
 assert.match(css,/background:color-mix\(in srgb,var\(--glass-fill-strong\) 74%/);
 assert.match(css,/@media screen and \(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media screen and \(max-width:380px\)/);
});
test("glass styles cannot change physical bank paper, customer records or print engines",()=>{
 assert.match(css,/@media screen\s*\{/);
 assert.doesNotMatch(css,/(?:\.paper|\.print-area|\.passbook-print-area)\s*\{[\s\S]{0,80}background:var\(--glass/);
 assert.doesNotMatch(css,/firebase|indexedDB|fetch\(|localStorage|window\.print\(|@media\s+print/i);
});
