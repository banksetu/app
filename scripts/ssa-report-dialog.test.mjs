import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectSsaReportEntries, ssaReportCounts } from "../src/core/ssaReportSelection.ts";

const entry=(accountNo,entryDate,flags={})=>({
  entryId:"entry-"+accountNo+"-"+entryDate,accountNo,entryDate,
  name:accountNo==="000111"?"Customer A":"Customer B",
  customerId:"C"+accountNo,apy:false,pmjjby:false,pmsby:false,...flags
});
const rows=[
  entry("000111","2026-11-01",{apy:true}),
  entry("000111","2026-10-31",{pmsby:true}),
  entry("000222","2026-11-07",{pmjjby:true}),
  entry("000222","2026-01-05",{apy:true,pmsby:true})
];
const base={period:"month",month:"2026-11",day:"2026-11-07",
  from:"2026-10-31",to:"2026-11-07",audience:"all",accountNo:""};
test("one-month report includes only actual entries in that month",()=>{
  assert.deepEqual(selectSsaReportEntries(rows,base).rows.map(r=>r.accountNo),["000111","000222"]);
  assert.equal(ssaReportCounts(selectSsaReportEntries(rows,base).rows).apy,1);
});
test("single day and exact inclusive date range share the same selection",()=>{
  assert.deepEqual(selectSsaReportEntries(rows,{...base,period:"day"}).rows.map(r=>r.entryDate),["2026-11-07"]);
  assert.deepEqual(selectSsaReportEntries(rows,{...base,period:"range"}).rows.map(r=>r.entryDate),
    ["2026-10-31","2026-11-01","2026-11-07"]);
});
test("individual customer reports preserve account numbers with leading zeros",()=>{
  const selected=selectSsaReportEntries(rows,{...base,period:"all",audience:"customer",accountNo:"000111"});
  assert.equal(selected.rows.length,2);
  assert.ok(selected.rows.every(row=>row.accountNo==="000111"));
  assert.match(selected.description,/000111/);
  assert.throws(()=>selectSsaReportEntries(rows,{...base,audience:"customer",accountNo:""}),/Select an SSA customer/);
});
test("invalid or backwards report dates never silently broaden the export",()=>{
  assert.throws(()=>selectSsaReportEntries(rows,{...base,period:"range",from:"2026-12-01"}),/From date/);
  assert.throws(()=>selectSsaReportEntries(rows,{...base,period:"day",day:"2026-02-30"}),/valid report day/);
  assert.throws(()=>selectSsaReportEntries(rows,{...base,period:"month",month:"2026-13"}),/valid report month/);
  assert.equal(selectSsaReportEntries(rows,{...base,period:"all"}).rows.length,4);
});
test("all four report actions launch a common dialog and print selection never uses dashboard filter",()=>{
  const component=readFileSync(new URL("../src/SsaCampaign.tsx",import.meta.url),"utf8");
  const dialog=readFileSync(new URL("../src/SsaCampaignReportDialog.tsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/SsaCampaign.css",import.meta.url),"utf8");
  for(const action of ["pdf","excel","share","print"])
    assert.ok(component.includes('setReportKind("'+action+'")'),"Missing popup: "+action);
  assert.match(component,/SsaCampaignReportDialog/);
  assert.match(component,/selectSsaReportEntries\(entries,selection\)/);
  assert.match(component,/\(printSelection\?\.rows\|\|\[\]\)\.map/);
  assert.match(component,/navigator\.share\(\{title:"BANK SETU SSA Campaign",files:\[shareFile\]\}\)/);
  assert.match(dialog,/type="month"/);
  assert.match(dialog,/type="date"/);
  assert.match(dialog,/role="dialog" aria-modal="true"/);
  assert.match(css,/@page\{size:A4 landscape/);
  assert.match(css,/page-break-inside:avoid/);
});
test("menu preserves historical v1.0.142 order with only new passbook and SSA entries inserted",()=>{
  const source=readFileSync(new URL("../src/Dashboard.tsx",import.meta.url),"utf8");
  const nav=source.slice(source.indexOf('<nav style={styles.nav}>'),source.indexOf("</nav>",source.indexOf('<nav style={styles.nav}>')));
  const labels=[...nav.matchAll(/<NavButton[^>]+label="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(labels,["Dashboard","Customer Entry","Quick Passbook","Passbook Print (PR2)",
    "Auto Passbook Generator","All Customer Data","Customers","Account Opening PDF Sample",
    "Forms Send to Branch","SSA Campaign","Settings","Reports","Sync & Backup"]);
});
