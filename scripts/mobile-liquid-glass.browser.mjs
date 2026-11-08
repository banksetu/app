import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";
/* Synthetic screenshot regression: no live user data or backend requests. */
const vars=[
 "--glass-fill:rgba(23,37,58,.38)","--glass-fill-strong:rgba(18,35,56,.70)",
 "--glass-text:#f6fbff","--glass-muted:#bed6eb",
 "--glass-line:rgba(105,180,226,.53)","--glass-accent:#8dd9ff",
 "--glass-blur:25px","--glass-glow:12px","--glass-rim-glow:8px",
 "--glass-shadow:27px","--glass-motion:340ms",
 "--glass-rim-gradient:linear-gradient(125deg,#70d9ef,#817ae9,#c9e3ef)"
].join(";");
const rows=Array.from({length:4},(_,i)=>
 '<tr tabindex="0" style="background:'+(i%2?'#fff8fa':'#fff')+';border-bottom:1px solid #eee">'+
 '<td data-label="Customer ID">CIF0'+(1000+i)+'</td>'+
 '<td data-label="Name">Example Customer '+(i+1)+'</td>'+
 '<td data-label="Account Number"><span class="all-customer-account-value">7345010106504</span> <button title="Copy account number">⧉</button></td>'+
 '<td data-label="Mobile Number">9000000000</td>'+
 '<td data-label="Aadhaar Number">XXXX XXXX 9999</td>'+
 '<td data-label="Account Opening Date">06 Nov 2026</td></tr>').join("");
const openings=Array.from({length:4},(_,i)=>
 '<tr tabindex="0"><td data-label="Customer Name"><strong>Customer '+i+'</strong></td>'+
 '<td data-label="Account Number" class="dashboard-opening-number"><span>7345010106504</span><button>Copy</button></td>'+
 '<td data-label="Opening Date">06 Nov 2026</td>'+
 '<td data-label="Active Status"><span class="dashboard-opening-status is-active">Active</span></td></tr>').join("");
const markup=[
 '<div id="root"><main class="banksetu-app-shell" data-appearance="glass" style="width:100%;min-height:100dvh">',
 '<aside class="banksetu-sidebar"><nav><button>Dashboard</button></nav></aside>',
 '<section class="banksetu-main-workspace" style="width:100%;padding:22px 24px">',
 '<header class="dashboard-top-bar" style="display:grid;grid-template-columns:44px minmax(0,1fr) max-content">',
 '<button class="mobile-menu-button">☰</button>',
 '<section class="persistent-bank-header" style="display:flex;flex-direction:column;min-width:0">',
 '<div class="bank-logo-zone has-logo"><img style="width:100%;max-width:320px" alt="Bank" /></div>',
 '<div class="bank-info-strip"><h2>ASSAM GRAMIN BANK</h2><p>Branch BADARPUR Operator SAHIN Address ASSAM-788806</p></div>',
 '</section><div class="admin-wrapper"><button class="admin-trigger">A</button></div></header>',
 '<div class="dashboard-stats-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">',
 '<button class="dashboard-stat-card">Total Customers 2782</button><button class="dashboard-stat-card">KYC Pending 23</button>',
 '<button class="dashboard-stat-card">Passbook Pending 1698</button><button class="dashboard-stat-card">This Month Account Openings 4</button></div>',
 '<section class="dashboard-quick-panel"><h2>Quick Actions</h2><div class="dashboard-quick-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">',
 '<button class="dashboard-quick-card">Add Customer</button><button class="dashboard-quick-card">Upload PDF</button>',
 '<button class="dashboard-quick-card">Passbook Print</button></div></section>',
 '<section class="all-customer-data" style="background:white;border-radius:16px;padding:20px">',
 '<h2>All Customer Data</h2><input aria-label="Search all customer data" placeholder="Search ID, account number, name">',
 '<div class="all-customer-table-scroll" style="max-height:680px;overflow:auto">',
 '<table class="all-customer-table" style="border-collapse:collapse;width:100%;min-width:680px;text-align:left">',
 '<thead><tr><th>Customer ID</th><th>Name</th><th>Account Number</th><th>Mobile Number</th><th>Aadhaar Number</th><th>Account Opening Date</th></tr></thead>',
 '<tbody>'+rows+'</tbody></table></div></section>',
 '</section></main></div>',
 '<div class="dashboard-opening-overlay" style="display:none"><section class="dashboard-opening-panel" role="dialog" aria-modal="true">',
 '<header class="dashboard-opening-header"><div><h2>Account Opening Report</h2><p>Filter by month or date range</p></div><button>×</button></header>',
 '<div class="dashboard-opening-filters"><div class="dashboard-opening-tabs"><button aria-pressed="true">One Month</button><button>Month Range</button><button>Date Range</button></div>',
 '<label>Choose Month<input type="month" value="2026-11"></label>',
 '<label class="dashboard-opening-search">Search Results<input placeholder="Name, account number or status"></label></div>',
 '<div class="dashboard-opening-overview"><div><small>Accounts Opened</small><strong>4</strong></div><div><small>Selected Period</small><strong>01 Nov 2026 – 08 Nov 2026</strong></div></div>',
 '<div class="dashboard-opening-table-scroll"><table><thead><tr><th>Customer Name</th><th>Account Number</th><th>Date</th><th>Status</th></tr></thead><tbody>'+openings+'</tbody></table></div>',
 '<footer class="dashboard-opening-footer"><span>Showing 4 of 4 matching customers</span><button>Close</button></footer>',
 '</section></div>'
].join("");
const sheets=["src/index.css","src/App.css","src/DashboardAccountOpeningReport.css","src/GlassTheme.css",
 "src/GlassCoverage.css","src/GlassVisualPolish.css","src/ThemeDeepCoverage.css",
 "src/GlassLuminance.css","src/GlassFormPopupPolish.css","src/MobileLiquidGlassFix.css","src/MobileGlassMotionPolish.css"];
const browser=await chromium.launch({args:["--no-sandbox","--disable-dev-shm-usage","--no-zygote"]});
fs.mkdirSync("test-evidence",{recursive:true});
const style=(p,sel,ps)=>p.locator(sel).first().evaluate((el,ps)=>{
 const s=getComputedStyle(el,ps||null),r=el.getBoundingClientRect();
 return {bg:s.backgroundColor,color:s.color,display:s.display,backdrop:s.backdropFilter,
  border:s.borderTopStyle,overflowX:s.overflowX,maxHeight:s.maxHeight,
  right:r.right,left:r.left,width:r.width,height:r.height};
},ps);
try{
 for(const width of [320,360,390,412,768]){
  const p=await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
  await p.setContent('<!doctype html><html data-appearance="glass" data-glass-design="liquid" data-glass-dark="true" style="'+vars+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+markup+'</body></html>');
  for(const file of sheets)await p.addStyleTag({path:file});
  await p.waitForTimeout(1200);
  for(const sel of [".banksetu-app-shell",".banksetu-main-workspace",".dashboard-top-bar",".dashboard-stats-grid",".dashboard-quick-panel",".all-customer-data"]){
    const v=await style(p,sel);
    assert(v.left>=-1&&v.right<=width+1,sel+" wider than viewport "+width+": "+JSON.stringify(v));
  }
  const docWidth=await p.evaluate(()=>document.documentElement.scrollWidth);
  assert(docWidth<=width+2,"The page still scrolls sideways at "+width+": "+docWidth);
  const row=await style(p,".all-customer-table tbody tr");
  assert.equal(row.display,"grid","Mobile customer row should be a fit-to-screen card");
  assert(row.right<=width+1,"Customer row clipped horizontally");
  const td=await style(p,".all-customer-table tbody td");
  assert.equal(td.color,"rgb(246, 251, 255)","Customer value invisible against white");
  assert.notEqual(row.bg,"rgb(255, 255, 255)","Customer row is still solid white");
  const label=await p.locator(".all-customer-table tbody td").first().evaluate(el=>getComputedStyle(el,"::before").content);
  assert(label.includes("Customer ID"),"Mobile data-label missing");
  await p.locator(".dashboard-opening-overlay").evaluate(el=>el.style.display="flex");
  await p.waitForTimeout(200);
  const dialog=await style(p,".dashboard-opening-panel"),overlay=await style(p,".dashboard-opening-overlay");
  assert(dialog.left>=0&&dialog.right<=width+1,"Opening modal clipped in viewport "+width);
  assert(dialog.height<=800,"Opening modal taller than device screen");
  assert(overlay.width<=width+1,"Opening backdrop spills sideways");
  assert(dialog.backdrop!=="none","Opening popup does not have glass blur");
  const reportRow=await style(p,".dashboard-opening-panel tbody tr");
  assert.notEqual(reportRow.bg,"rgb(247, 250, 255)","Opening result row left as default white");
  assert.equal((await style(p,".dashboard-opening-panel tbody td")).color,"rgb(246, 251, 255)","Popup row text not readable");
  if(width===390||width===768)await p.screenshot({path:"test-evidence/mobile-liquid-glass-"+width+".png",fullPage:false});
  console.log("PASS mobile viewport, customer table, Glass opening report "+width+"px");
  await p.close();
 }
}finally{await browser.close()}
