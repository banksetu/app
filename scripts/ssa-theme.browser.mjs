import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";
/* Synthetic DOM only: CSS rendering in Chromium, no authenticated workspace. */
const markup="<main class=\"banksetu-app-shell\"><section class=\"banksetu-main-workspace\"><header class=\"dashboard-top-bar\"><section class=\"persistent-bank-header\"><div class=\"bank-logo-zone has-logo\"><img alt=\"Example bank\" width=\"200\" height=\"60\"><button class=\"logo-edit-pencil\">✎</button></div><div class=\"bank-info-strip has-info\"><h2>Example Gramin Bank</h2><div><span>Branch Sample</span><span>CSP 0123</span></div></div></section></header><section class=\"dashboard-stats-grid\"><button class=\"dashboard-stat-card\">Total Customers</button><button class=\"dashboard-stat-card\">This Month</button><button class=\"dashboard-stat-card\">KYC Pending</button><button class=\"dashboard-stat-card\">Passbook Pending</button></section><section class=\"ssa-campaign\"><header class=\"ssa-banner\"><h1><span>◎</span> SSA Campaign</h1><div class=\"ssa-banner-controls\"><select aria-label=\"Period\"><option>This Month</option></select><label>From <input type=\"date\" value=\"2026-11-01\"></label><label>To <input type=\"date\" value=\"2026-11-08\"></label><button>↻</button></div></header><section class=\"ssa-kpis\"><button class=\"ssa-kpi blue\"><span>▤</span><div><b>Total Entry</b><strong>0</strong></div></button><button class=\"ssa-kpi green\"><span>●</span><div><b>Total APY</b><strong>0</strong></div></button><button class=\"ssa-kpi orange\"><span>✚</span><div><b>Total PMJJBY</b><strong>0</strong></div></button><button class=\"ssa-kpi purple\"><span>☂</span><div><b>Total PMSBY</b><strong>0</strong></div></button></section><div class=\"ssa-main\"><section class=\"ssa-panel ssa-editor\"><h2>Add / Update SSA Entry</h2><form class=\"ssa-search\"><input placeholder=\"Search Account Number\"><button>Search</button></form><div class=\"ssa-customer\"><span class=\"ssa-customer-icon\">●</span><div><small>Customer Name</small><b>Select a customer</b></div><div><small>Account</small><b>—</b></div></div><div class=\"ssa-entry-meta\"><label>Entry Date <input type=\"date\" value=\"2026-11-08\"></label><span>New entry</span></div><div class=\"ssa-schemes\"><label><input type=\"checkbox\">APY</label><label><input type=\"checkbox\">PMJJBY</label><label><input type=\"checkbox\">PMSBY</label></div><div class=\"ssa-save-buttons\"><button class=\"ssa-save\">Save New Entry</button><button class=\"ssa-update\">Update Entry</button><button>Clear</button></div><small class=\"ssa-help\">Save an entry</small></section><section class=\"ssa-panel ssa-reports\"><h2>Reports &amp; Actions</h2><div class=\"ssa-report-buttons\"><button class=\"pdf\"><span>▣</span>PDF Report</button><button class=\"excel\"><span>▦</span>Excel Report</button><button class=\"print\"><span>▤</span>Print</button><button class=\"share\"><span>●</span>Share</button></div></section></div><section class=\"ssa-panel ssa-entries\"><header><h2>SSA Entries</h2><div class=\"ssa-chips\"><button class=\"active\">All</button><button>Today</button></div><input placeholder=\"Filter by account\"></header><div class=\"ssa-table-wrap\"><table><thead><tr><th>Date</th><th>Name</th><th>Account</th><th>APY</th><th>PMJJBY</th><th>PMSBY</th><th>Status</th></tr></thead><tbody><tr><td>2026-11-08</td><td>Sample</td><td>123456789</td><td>—</td><td>—</td><td>—</td><td>Synced</td></tr></tbody></table></div></section><div class=\"ssa-print-report\">Print paper remains unchanged</div></section><section class=\"settings-page\"><div class=\"admin-users-panel admin-users-embedded\"><div class=\"admin-users-toolbar\"><input placeholder=\"Search clients\"><button>Refresh</button></div><div class=\"admin-client-workspace\"><div class=\"admin-client-workspace-header\"><div><span>Client Admin</span><h3>Sample Client</h3></div><span class=\"admin-client-seat-count\">0 users</span></div><div class=\"admin-user-card\"><div class=\"admin-user-main\"><div class=\"admin-user-avatar\">S</div><div class=\"admin-user-info\"><strong>Example Admin</strong><span>admin@example.invalid</span></div></div><div class=\"admin-user-meta\"><span class=\"admin-user-status status-approved\">Active</span></div><div class=\"admin-user-actions\"><button class=\"block\">Block</button><button class=\"delete\">Delete</button></div></div><div class=\"admin-client-children\"><div class=\"admin-client-children-heading\"><strong>Users assigned to this client</strong></div><p class=\"admin-client-empty\">0 users</p></div></div></div></section></section></main>";
const assets=["src/index.css","src/App.css","src/AdminUsers.css","src/GlassTheme.css",
"src/GlassCoverage.css","src/GlassVisualPolish.css","src/SsaCampaign.css","src/SsaAppearance.css"];
const vars=["--glass-fill:rgba(17,24,38,.34)","--glass-fill-strong:rgba(16,24,38,.72)",
"--glass-text:#f8fbff","--glass-muted:#d6e1ef","--glass-line:rgba(255,255,255,.38)",
"--glass-blur:21px","--glass-glow:11px","--glass-shadow:30px","--glass-accent:#8fd4ff",
"--glass-wallpaper:linear-gradient(120deg,#26384b,#55516b,#98796b)",
"--glass-wallpaper-blur:9px","--glass-motion:310ms","--glass-entry-motion:540ms","--glass-stagger:188ms"].join(";");
const inspect=(p,selector)=>p.locator(selector).first().evaluate(el=>{
const css=getComputedStyle(el),r=el.getBoundingClientRect();
return {bg:css.backgroundColor,fg:css.color,border:css.borderTopStyle,
shadow:css.boxShadow,backdrop:css.backdropFilter,delay:css.animationDelay,duration:css.animationDuration,
right:r.right,width:r.width,scroll:el.scrollWidth,client:el.clientWidth};
});
const isDark=v=>{const m=v.bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);return !!m&&+m[1]<145&&+m[2]<145&&+m[3]<165};
const isGlass=v=>{const m=v.bg.match(/^rgba\([^)]+,\s*([\d.]+)\)$/);return !!m&&+m[1]>.03&&+m[1]<.96};
const browser=await chromium.launch({args:["--no-sandbox","--disable-dev-shm-usage","--no-zygote"]});
fs.mkdirSync("test-evidence",{recursive:true});
try {
 for(const mode of ["dark","glass"]){
  for(const width of [360,390,768,1280]){
   const p=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   await p.setContent('<!doctype html><html data-appearance="'+mode+'" data-glass-dark="true" data-glass-design="liquid" style="'+vars+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+markup+'</body></html>');
   await p.locator(".banksetu-app-shell").evaluate((el,mode)=>el.dataset.appearance=mode,mode);
   for(const stylesheet of assets)await p.addStyleTag({path:stylesheet});
   await p.waitForTimeout(1650);
   for(const selector of [".ssa-campaign",".ssa-panel",".ssa-customer",".ssa-kpi",
       ".ssa-report-buttons button",".ssa-banner-controls select",".ssa-schemes label"]){
    const v=await inspect(p,selector);
    assert(mode==="dark"?isDark(v):isGlass(v),mode+" "+width+" "+selector+" not themed: "+v.bg);
   }
   const bank=await inspect(p,".persistent-bank-header");
   if(mode==="dark")assert(isDark(bank),"Dark bank header became white");
   else {
    assert(bank.shadow!=="none","Bank header missing 3D shade");
    assert(bank.backdrop!=="none","Bank logo/Bank Info header missing backdrop blur");
    for(const selector of [".admin-client-workspace",".admin-client-children",".admin-user-card"]){
      const v=await inspect(p,selector);
      assert(isGlass(v),"Client Settings area white: "+selector+" "+v.bg);
    }
    const motion=await inspect(p,".dashboard-stats-grid>.dashboard-stat-card:nth-child(2)");
    assert(parseFloat(motion.delay)>=.25,"Stagger delay too fast "+motion.delay);
    assert(parseFloat(motion.duration)>=.45,"Entry animation too fast "+motion.duration);
   }
   assert.equal(await p.locator(".ssa-print-report").evaluate(el=>getComputedStyle(el).display),"none","Print report entered screen mode");
   const outer=await inspect(p,".ssa-campaign");
   assert(outer.scroll<=outer.client+2,"SSA horizontal overflow "+width+": "+outer.scroll+"/"+outer.client);
   if(width<=390){
    for(const selector of [".ssa-kpis",".ssa-main",".ssa-panel",".ssa-report-buttons",".ssa-banner-controls",".ssa-table-wrap"]){
     const rect=await inspect(p,selector);
     assert(rect.right<=width+1,mode+" "+selector+" clipped on "+width+"px, right "+rect.right);
    }
   }
   if(width===390||width===1280)await p.screenshot({path:"test-evidence/ssa-"+mode+"-"+width+".png",fullPage:true});
   if(mode==="glass"){
    await p.emulateMedia({reducedMotion:"reduce"});
    const a=await p.locator(".ssa-banner").evaluate(el=>getComputedStyle(el).animationName);
    assert.equal(a,"none","Reduced-motion accessibility not honored");
   }
   console.log("PASS SSA "+mode+" "+width+"px / header / client settings");
   await p.close();
  }
 }
} finally {await browser.close()}
