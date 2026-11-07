import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  normalizedOpeningDate,openingDateKey,monthStart,monthEnd,localMonth,
  matchingOpeningCustomers,currentMonthOpeningCount,
  openingCustomerName,openingAccountNo,openingStatus,openingAmount
} from "../src/core/accountOpeningReport.ts";

test("account-opening dates are real account dates, not software-entry timestamps",()=>{
 const now=new Date(2026,10,7);
 const rows=[
   {name:"A",accountOpeningDate:"2026-11-07",createdAt:"2026-01-01"},
   {name:"B",accountOpeningDate:"01/11/2026",createdAt:"2024-01-01"},
   {name:"C",accountOpeningDate:"31-10-2026",createdAt:"2026-11-05"},
   {name:"D",createdAt:"2026-11-06"},
   {name:"E",openingDate:"07-Nov-2026"}
 ];
 assert.equal(localMonth(now),"2026-11");
 assert.equal(currentMonthOpeningCount(rows,now),3);
 assert.deepEqual(matchingOpeningCustomers(rows,"2026-11-01","2026-11-30").map(x=>x.name),["A","E","B"]);
 assert.equal(openingDateKey(rows[3]),null);
 assert.equal(openingDateKey(rows[2]),"2026-10-31");
});

test("month and exact-date range accept inclusive endpoints and leap year",()=>{
 assert.equal(monthStart("2026-01"),"2026-01-01");
 assert.equal(monthEnd("2026-11"),"2026-11-30");
 assert.equal(monthEnd("2024-02"),"2024-02-29");
 assert.equal(monthEnd("2025-02"),"2025-02-28");
 assert.equal(normalizedOpeningDate("29/02/2025"),null);
 assert.equal(normalizedOpeningDate("31/04/2026"),null);
 assert.equal(normalizedOpeningDate("2026-11-07T22:00:00.000Z"),"2026-11-07");
 assert.equal(normalizedOpeningDate("2026-13-01"),null);
 assert.deepEqual(matchingOpeningCustomers([{accountOpeningDate:"2026-01-01"},{accountOpeningDate:"2026-11-30"},{accountOpeningDate:"2026-12-01"}],"2026-01-01","2026-11-30").length,2);
 assert.equal(matchingOpeningCustomers([{accountOpeningDate:"2026-11-07"}],"2026-12-01","2026-01-01").length,0);
});

test("customer row shows name, account number, opening date, status and optional real opening amount",()=>{
 const customer={name:"Demo Customer",accountNo:"0000123400",status:"Active",
    "Account Opening Date":"07/11/2026",initialDeposit:"₹1,200.50"};
 assert.equal(openingCustomerName(customer),"Demo Customer");
 assert.equal(openingAccountNo(customer),"0000123400");
 assert.equal(openingStatus(customer),"Active");
 assert.equal(openingDateKey(customer),"2026-11-07");
 assert.equal(openingAmount(customer),1200.5);
 assert.equal(openingAmount({balance:"50000"}),null,"current balance is not an opening amount");
});

test("dashboard report reuses the existing full preview with actions, never creates a second preview renderer",()=>{
 const dashboard=readFileSync(new URL("../src/Dashboard.tsx",import.meta.url),"utf8");
 const report=readFileSync(new URL("../src/DashboardAccountOpeningReport.tsx",import.meta.url),"utf8");
 const customers=readFileSync(new URL("../src/AllCustomerData.tsx",import.meta.url),"utf8");
 assert.match(dashboard,/This Month Account Openings/);
 assert.match(dashboard,/currentMonthOpeningCount\(analyticsRows\)/);
 assert.match(dashboard,/DashboardAccountOpeningReport/);
 for(const word of ["One Month","Month Range","Date Range","Customer Name","Account Number","Account Opening Date","Active Status","Copy account number"]){
  assert.ok(report.includes(word),word);
 }
 assert.match(report,/previewCustomer=\{previewCustomer\}/);
 assert.match(report,/lazy\(\(\)=>import\("\.\/AllCustomerData"\)\)/);
 assert.match(customers,/previewCustomer\?:Customer/);
 assert.match(customers,/if\(previewCustomer\)return/);
 for(const action of ["Bank Setu – Customer Preview","Share","Print","Close","customer-preview-actions","requireLicensedWrite"]){
   assert.ok(customers.includes(action),action);
 }
 assert.match(customers,/className="customer-preview-overlay"/);
 assert.match(customers,/getCustomerByRowNumber/);
});
