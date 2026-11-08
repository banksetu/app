/**
 * Synthetic DOM/CSS verification in REAL Chromium. No customer data, Firebase,
 * production web login or native print calls. Screenshots are CSS QA fixtures,
 * not screenshots of the running authenticated BANK SETU application.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";

const browser=await chromium.launch({
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,
  args:["--no-sandbox","--disable-dev-shm-usage","--no-zygote"]
});
fs.mkdirSync("test-evidence",{recursive:true});
const wallpaperVars=[
  "--glass-fill:rgba(17,24,38,.31)",
  "--glass-fill-strong:rgba(16,24,38,.72)",
  "--glass-text:#f8fbff","--glass-muted:#d6e1ef",
  "--glass-line:rgba(255,255,255,.38)","--glass-accent:#a6dfff",
  "--glass-glow:9px","--glass-shadow:27px","--glass-blur:20px",
  "--glass-wallpaper:linear-gradient(125deg,#2f4f62,#3b4558,#967b89)",
  "--glass-wallpaper-blur:8px","--glass-stagger:55ms","--glass-motion:310ms"
].join(";");
const rows=Array.from({length:4},(_,i)=>'<tr><td>'+String(i+1)+'</td><td>Sample '+String(i+1)+'</td><td>000000000'+String(i+1)+'</td></tr>').join("");
const markup='<!doctype html><html lang="en" data-appearance="glass" data-glass-dark="true" data-glass-design="liquid" style="'+wallpaperVars+'">'+
  '<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
  '<main class="banksetu-app-shell" data-appearance="glass">'+
  '<aside class="banksetu-sidebar open"><h2>BANK SETU</h2><nav><button class="banksetu-nav-item active">Dashboard</button><button class="banksetu-nav-item">Customers</button><button class="banksetu-nav-item">SSA Campaign</button></nav><div class="banksetu-appearance"><button>◇ Glass</button></div></aside>'+
  '<section class="banksetu-main-workspace"><header class="dashboard-top-bar"><h1>Dashboard</h1><input aria-label="Customer Search" placeholder="Search customers"></header>'+
  '<div class="dashboard-stats-grid"><button class="dashboard-stat-card">Total Customers 2769</button><button class="dashboard-stat-card">This Month 124</button></div>'+
  '<div class="dashboard-analytics-card">Monthly Customer Entries</div>'+
  '<div class="ssa-panel"><h2>SSA Campaign</h2><div class="ssa-search"><input aria-label="SSA search"><button>Search</button></div><div class="ssa-report-buttons"><button>PDF</button><button>Excel</button><button>Print</button></div><button class="ssa-save">Save Entry</button><button class="ssa-update">Update</button><button class="ssa-edit-btn">Edit</button></div>'+
  '<div class="license-panel"><div class="license-summary"><div class="license-tile">License Requests</div></div><div class="license-drawer">License details</div></div>'+
  '<div class="sync-center"><div class="sync-card">Sync & Backup</div></div>'+
  '<section class="layout-studio"><div class="ls-header">Word-style passbook editor</div><div class="ls-ribbon"><button>Format</button></div><div class="ls-tool-card">Template Tool</div></section>'+
  '<div class="aof-module"><div class="paper" style="background:#fff;color:#111"><strong id="paper-text">Original white passbook paper</strong><input id="paper-input" style="background:#fff;color:#111;width:58px" value="print"></div></div>'+
  '</section></main>'+
  '<div id="portal-fixtures" style="display:none">'+
  '<div class="ssa-export-overlay"><section class="ssa-export-dialog" role="dialog" aria-modal="true"><div class="ssa-export-heading"><h2>SSA Export</h2><button>×</button></div><div class="ssa-export-body"><fieldset class="ssa-export-group"><legend>Period</legend><input type="date"><label><input type="radio"> All</label><label><input type="checkbox"> Selected</label></fieldset><div class="ssa-export-preview">Matching Entries: 4</div><table><thead><tr><th>Entry</th><th>Name</th><th>Account</th></tr></thead><tbody>'+rows+'</tbody></table></div><footer class="ssa-export-actions"><button class="ssa-export-primary">PDF</button><button>Close</button></footer></section></div>'+
  '<div class="ssa-card-overlay"><section class="ssa-card-dialog"><div class="ssa-card-heading"><h2>Total APY</h2></div><button class="ssa-card-pdf">PDF</button><table><thead><tr><th>Customer</th></tr></thead><tbody><tr><td>Sample</td></tr></tbody></table></section></div>'+
  '<div class="pr2-overlay"><section class="pr2-dialog"><h2>Olivetti Mode</h2><label>Printer<select><option>Epson</option></select></label><button>Print</button></section></div>'+
  '<div class="print-alignment-overlay"><section class="print-alignment-window"><div class="print-alignment-settings"><label>X-offset<input type="number" value="2"></label></div><div class="print-alignment-paper" style="background:white;color:black">Original passbook</div><button>Preview</button></section></div>'+
  '<div class="dashboard-opening-overlay"><section class="dashboard-opening-panel"><h2>This Month Account Openings</h2><div class="dashboard-opening-filters"><label>Month<input type="month"></label></div><div class="dashboard-opening-overview">All Customers</div></section></div>'+
  '<div class="license-modal-backdrop"><section class="license-drawer">License Details <button>Close</button></section></div>'+
  '<div class="banksetu-glass-modal-overlay" style="position:fixed;inset:0;background:white"><section class="banksetu-glass-inline-dialog" style="background:white;color:black">Bank Information <input aria-label="Bank name" value="Sample"></section></div>'+
  '<div class="banksetu-glass-mapping-overlay" style="position:fixed;inset:0"><section class="banksetu-glass-mapping-dialog" style="background:white;color:black"><h2>Field mapping</h2><div class="banksetu-mapping-canvas" style="position:relative;width:340px;height:160px;background:white"><button class="banksetu-mapping-field-marker" style="transform:translate(-2px,-2px);position:absolute;left:50px;top:42px">Nominee field</button></div></section></div>'+
  '<div class="update-backdrop"><section class="update-dialog">Update Available</section></div>'+
  '<div class="customer-delete-overlay"><section class="customer-delete-dialog">Delete Customer</section></div>'+
  '<div class="print-alignment-choice-overlay"><section class="print-alignment-choice">Alignment Options</section></div>'+
  '</div></body></html>';
const sheets=[
  "src/index.css","src/App.css","src/LicenseManagement.css",
  "src/SsaCampaign.css","src/SsaCampaignCardDialog.css","src/SsaCampaignReportDialog.css",
  "src/DashboardAccountOpeningReport.css","src/Pr2PrinterDialog.css",
  "src/CustomizeLayoutStudio.css","src/CustomizeLayoutReferenceLock.css",
  "src/GlassTheme.css","src/GlassCoverage.css","src/GlassStudioCoverage.css"
];
try{
  for(const width of [360,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    await page.setContent(markup);
    for(const file of sheets)await page.addStyleTag({path:file});
    await page.waitForTimeout(600);
    const css=async selector=>page.locator(selector).first().evaluate(el=>{
      const s=getComputedStyle(el);
      return {background:s.backgroundColor,backdrop:s.backdropFilter,color:s.color,
        border:s.borderTopStyle,animation:s.animationName,box:s.boxShadow,
        rect:{left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}};
    });
    const card=await css(".dashboard-stat-card");
    assert.notEqual(card.background,"rgba(0, 0, 0, 0)","Glass KPI is not painted");
    assert.equal(card.border,"solid","KPI glass border missing");
    const small=await css(".ssa-save");
    assert.equal(small.border,"solid","SSA Save is missing glass border");
    const ribbons=await css(".ls-ribbon");
    assert.equal(ribbons.border,"solid","Word-like editor toolbar still opaque");
    const paper=await css(".paper");
    assert.equal(paper.background,"rgb(255, 255, 255)","physical paper must remain white");
    assert.equal(await page.locator("#paper-input").evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(255, 255, 255)","paper text fields must remain unglassified");
    const portalSelectors=[
      ".ssa-export-dialog",".ssa-card-dialog",".pr2-dialog",
      ".print-alignment-window",".dashboard-opening-panel",
      ".license-drawer",".banksetu-glass-inline-dialog",
      ".banksetu-glass-mapping-dialog",".update-dialog",
      ".customer-delete-dialog",".print-alignment-choice"
    ];
    for(const name of portalSelectors){
      const result=await css("#portal-fixtures "+name);
      assert.equal(result.background,"rgba(16, 24, 38, 0.72)",name+" is not using shared glass surface");
      assert.equal(result.border,"solid",name+" is missing glass border");
    }
    await page.locator("#portal-fixtures").evaluate(el=>el.style.display="block");
    await page.locator("#portal-fixtures").evaluate(el=>{
      for(const child of el.children)if(!child.classList.contains("ssa-export-overlay"))child.style.display="none";
    });
    const modal=await css(".ssa-export-dialog");
    assert(modal.rect.left>=0&&modal.rect.right<=width+1,"SSA PDF dialog clipped outside viewport "+JSON.stringify(modal.rect));
    const field=await css(".ssa-export-dialog input[type=date]");
    assert.equal(field.border,"solid","SSA export date field missing glass");
    await page.screenshot({path:"test-evidence/glass-ssa-popup-"+width+".png",fullPage:false});
    await page.locator("#portal-fixtures").evaluate(el=>{
      for(const child of el.children)child.style.display=child.classList.contains("banksetu-glass-mapping-overlay")?"block":"none";
    });
    const marker=page.locator(".banksetu-mapping-field-marker");
    const before=await marker.evaluate(el=>getComputedStyle(el).transform);
    await marker.hover({force:true});
    await page.waitForTimeout(400);
    const after=await marker.evaluate(el=>getComputedStyle(el).transform);
    assert.equal(after,before,"Hover animation moved calibrated bank PDF mapping field");
    await page.screenshot({path:"test-evidence/glass-mapping-"+width+".png",fullPage:false});
    await page.locator("#portal-fixtures").evaluate(el=>el.style.display="none");
    await page.screenshot({path:"test-evidence/glass-dashboard-"+width+".png",fullPage:false});
    await page.emulateMedia({reducedMotion:"reduce"});
    const reduced=await page.locator(".dashboard-stat-card").evaluate(el=>getComputedStyle(el).animationDuration);
    assert(reduced.includes("1e-05")||reduced.includes("0.00001")||reduced.includes("0s")||reduced.includes("0.01ms"),"Reduced motion ignored: "+reduced);
    await page.close();
    console.log("PASS Glass CSS Chromium "+width+"px: 11 popup surfaces, inputs, cards, mapping, paper, motion");
  }
}finally{await browser.close();}
