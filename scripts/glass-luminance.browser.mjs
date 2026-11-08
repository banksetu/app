import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";
/* Synthetic UI fixtures, never an authenticated BANK SETU account. */
const browser=await chromium.launch({args:["--no-sandbox","--disable-dev-shm-usage","--no-zygote"]});
const vars=[
"--glass-fill:rgba(17,24,38,.38)","--glass-fill-strong:rgba(16,24,38,.68)",
"--glass-text:#f8fbff","--glass-muted:#c8d8ee",
"--glass-line:rgba(116,183,236,.43)","--glass-rim-gradient:linear-gradient(130deg,#78ccf3,#847ce0,#9bdaef)",
"--glass-luminance-opacity:.35","--glass-rim-glow:7px",
"--glass-blur:21px","--glass-shadow:25px","--glass-motion:320ms",
"--glass-glow:12px","--glass-accent:#8dcfff","--glass-stagger:160ms",
"--glass-entry-motion:540ms"].join(";");
fs.mkdirSync("test-evidence",{recursive:true});
const content='<main class="banksetu-app-shell" data-appearance="glass" style="width:100%;min-height:100vh">'+
'<section class="banksetu-main-workspace" style="width:100%;margin:0">'+
'<header class="dashboard-top-bar"><section class="persistent-bank-header" style="background:white;box-shadow:0 0 3px white;border:2px solid white"><div class="bank-logo-zone">BANK LOGO</div><div class="bank-info-strip">Bank Information</div></section><button>Admin</button></header>'+
'<div class="dashboard-kpi-controls"><button class="dashboard-kpi-privacy-toggle" aria-pressed="false">Hide</button></div>'+
'<div class="dashboard-stats-grid"><button class="dashboard-stat-card"><div class="dashboard-stat-top"><span class="dashboard-stat-badge" style="background:white;border:1px solid white;box-shadow:0 2px 3px white">SYNC</span></div><div class="dashboard-stat-value">2769</div><h3 class="dashboard-stat-title">Total Customers</h3></button><button class="dashboard-stat-card"><div class="dashboard-stat-value">5</div><h3 class="dashboard-stat-title">KYC Pending</h3></button></div>'+
'<div class="dashboard-quick-grid"><button class="dashboard-quick-card">Quick Passbook</button><button class="dashboard-quick-card">Passbook Print</button></div>'+
'<div class="dashboard-analytics-grid"><div class="dashboard-analytics-card">Analytics</div></div>'+
'<div class="passbook-page"><h1>Quick Passbook</h1><div class="passbook-heading"><p>Search customer • Preview • Temporary Edit • Print</p></div><div class="passbook-search-card"><input class="passbook-search-input" value="abc"><button class="passbook-button search-button">Search</button></div><div class="passbook-empty" style="background:white;color:black">Search a customer to load the passbook preview.</div></div>'+
'<section class="ssa-panel"><button class="ssa-kpi">SSA Campaign</button><div class="ssa-report-buttons"><button>PDF Report</button><button>Print</button></div></section>'+
'</section></main><div class="ssa-export-overlay" style="display:none"><div class="ssa-export-dialog">SSA PDF Report Popup<button>Close</button></div></div>';
try{
for(const width of [390,768,1280]){
 const p=await browser.newPage({viewport:{width,height:800}});
 await p.setContent('<!doctype html><html data-appearance="glass" data-glass-design="liquid" data-glass-dark="true" style="'+vars+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+content+'</body></html>');
 for(const file of ["src/index.css","src/App.css","src/GlassTheme.css","src/GlassCoverage.css","src/GlassVisualPolish.css","src/ThemeDeepCoverage.css","src/GlassLuminance.css"])
   await p.addStyleTag({path:file});
 await p.waitForTimeout(1500);
 const get=(sel,ps)=>p.locator(sel).first().evaluate((el,ps)=>{
   const c=getComputedStyle(el,ps||null);return {bg:c.backgroundColor,border:c.borderTopStyle,color:c.color,
     shadow:c.boxShadow,backdrop:c.backdropFilter,opacity:c.opacity,
     before:c.content,position:c.backgroundPosition,filter:c.filter};
 },ps);
 const outer=await get(".dashboard-top-bar"),inner=await get(".persistent-bank-header");
 assert.notEqual(outer.backdrop,"none","outer bank header must be glass");
 assert.equal(inner.shadow,"none","inner bank logo/info box must not be separate card");
 assert.equal(inner.border,"none","inner bank logo/info box still has a border");
 const badge=await get(".dashboard-stat-badge");
 assert.equal(badge.border,"none","SYNC should be plain text");
 const empty=await get(".passbook-empty");
 assert.notEqual(empty.bg,"rgb(255, 255, 255)","passbook empty-state still white");
 const card=await get(".dashboard-quick-card");
 assert.equal(card.border,"solid","prismatic edge border missing");
 const before=await get(".dashboard-quick-card","::after");
 assert.notEqual(before.before,"none","card luminance pseudo missing");
 await p.locator(".dashboard-quick-card").first().hover();
 await p.waitForTimeout(700);
 const hover=await get(".dashboard-quick-card","::after");
 assert(parseFloat(hover.opacity)>.20,"luminance did not become visible on hover: "+hover.opacity);
 await p.locator(".dashboard-stats-grid").evaluate(e=>e.classList.add("stats-obscured"));
 await p.waitForTimeout(1000);
 const value=await get(".dashboard-stat-value");
 assert(parseFloat(value.opacity)<.1,"KPI smoke toggle failed to hide numeric values");
 await p.locator(".dashboard-stats-grid").evaluate(e=>e.classList.remove("stats-obscured"));
 await p.waitForTimeout(1000);
 assert(parseFloat((await get(".dashboard-stat-value")).opacity)>.95,"KPI values did not return");
 await p.locator(".ssa-export-overlay").evaluate(e=>e.style.display="block");
 const popup=await get(".ssa-export-dialog");
 assert.equal(popup.border,"solid","PDF report popup not glazed");
 await p.locator(".ssa-export-overlay").evaluate(e=>e.style.display="none");
 await p.screenshot({path:"test-evidence/luminance-"+width+".png",fullPage:false});
 await p.emulateMedia({reducedMotion:"reduce"});
 const motion=await p.locator(".dashboard-quick-card").first().evaluate(el=>getComputedStyle(el,"::after").transitionDuration);
 assert(motion==="0s"||motion==="1e-05s"||motion.includes("0.00001"),"reduced motion not respected: "+motion);
 console.log("PASS Glass 3D luminance + privacy + single bank header + popups "+width+"px");
 await p.close();
}
} finally {await browser.close()}
