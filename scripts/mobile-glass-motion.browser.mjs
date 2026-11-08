import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";
/* UI-only browser fixture: no signed-in tenant, account data, sync requests. */
const vars=[
 "--glass-wallpaper:linear-gradient(130deg,#182f49,#846d65,#19263f)",
 "--glass-fill:rgba(20,37,56,.36)","--glass-fill-strong:rgba(17,29,49,.67)",
 "--glass-text:#f8fbff","--glass-muted:#d6e1ef",
 "--glass-line:rgba(128,196,237,.52)","--glass-accent:#a6dfff",
 "--glass-blur:25px","--glass-glow:10px","--glass-rim-glow:8px",
 "--glass-shadow:20px","--glass-motion:350ms","--glass-stagger:180ms",
 "--glass-entry-motion:570ms","--glass-luminance-opacity:.36"
].join(";");
const styles=[
 "src/index.css","src/App.css","src/GlassAppearancePanel.css",
 "src/GlassTheme.css","src/GlassCoverage.css","src/GlassVisualPolish.css",
 "src/ThemeDeepCoverage.css","src/GlassLuminance.css",
 "src/GlassFormPopupPolish.css","src/MobileLiquidGlassFix.css",
 "src/MobileGlassMotionPolish.css"
];
const shell=[
 '<main class="banksetu-app-shell" data-appearance="glass" data-glass-design="liquid">',
 '<aside class="banksetu-sidebar"><nav><button class="banksetu-nav-item active"><span class="banksetu-nav-icon">◈</span>Dashboard</button></nav>',
 '<div class="banksetu-appearance"><div class="banksetu-appearance-track" data-mode="glass">',
 '<span class="banksetu-appearance-thumb"></span><button aria-pressed="false">☀</button><button aria-pressed="false">☾</button><button aria-pressed="true">◇</button></div></div></aside>',
 '<div class="banksetu-main-workspace">',
 '<header class="dashboard-top-bar"><button class="mobile-menu-button">☰</button>',
 '<section class="persistent-bank-header"><div class="bank-logo-zone"><img alt="Bank" style="width:310px;height:60px"></div>',
 '<div class="bank-info-strip"><h2>ASSAM GRAMIN BANK</h2><p>Branch BADARPUR Operator SAHIN SOCIAL Address ASSAM</p></div></section>',
 '<div class="admin-wrapper"><button>A</button></div></header>',
 '<section class="dashboard-stats-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">',
 '<button class="dashboard-stat-card">Total Customers: 2782</button><button class="dashboard-stat-card">KYC Pending: 23</button>',
 '<button class="dashboard-stat-card">Passbook Pending: 1698</button><button class="dashboard-stat-card">This Month Account Openings: 4</button></section>',
 '<div class="dashboard-quick-panel"><h2>Quick Actions</h2><div class="dashboard-quick-grid"><button class="dashboard-quick-card">Add Customer</button></div></div>',
 '<div class="dashboard-analytics-grid"><div class="dashboard-analytics-card"><h3>Monthly Customer Entries</h3><p>12 months</p></div></div>',
 '<section class="settings-page"><div class="settings-admin-hero"><h2>Accounts & Access</h2></div>',
 '<div class="admin-users-panel"><div class="admin-users-header"><h2>Master Admin</h2></div>',
 '<div class="admin-users-toolbar"><input placeholder="Search client, admin, user"><button>Refresh</button></div>',
 '<div class="admin-client-workspace"><div class="admin-user-card"><strong>Client Admin</strong></div></div></div></section>',
 '<section class="sync-center"><div class="sync-header"><h1>Sync &amp; Backup</h1><p>Data protection</p></div>',
 '<div class="sync-protection">Local storage and verified cloud backup</div>',
 '<div class="sync-health"><strong>System Health</strong></div>',
 '<div class="sync-card-grid"><div class="sync-card"><h2>Local Data</h2>2782</div></div></section>',
 '</div></main>'
].join("");
const editor=[
 '<div class="glass-appearance-overlay" style="display:none"><section class="glass-appearance-panel" role="dialog" aria-modal="true">',
 '<header class="glass-appearance-header"><div><h2>Appearance &amp; Background <span>Glass Mode</span></h2><p>Personalize this device</p></div>',
 '<button aria-label="Close settings">×</button></header>',
 '<div class="glass-appearance-scroll">',
 '<fieldset><legend>Glass Design</legend><div class="glass-appearance-choices glass-design-choices">',
 '<button class="glass-design-tile liquid" aria-pressed="true"><span class="glass-design-preview"><i></i></span><strong>Liquid Glass</strong></button></div></fieldset>',
 '<fieldset><legend>Glass Surface</legend><div class="glass-tone-choices"><button aria-pressed="true">Auto</button><button>White</button><button>Black</button><button>Transparent</button></div></fieldset>',
 '<fieldset><legend>Background</legend><div class="glass-appearance-choices glass-background-choices"><label class="glass-background-tile dark"><button>Dark Blur</button></label></div></fieldset>',
 '<fieldset><legend>Glass &amp; Animation Controls</legend><p class="glass-live-note">Live preview</p>',
 '<div class="glass-sliders">',
 ...["Transparency","Background Blur","Glass Intensity","Border Glow","Shadow Depth","Animation Speed","Motion Delay"].map((label,i)=>
   '<label class="glass-slider-line"><span><strong>'+label+'</strong><small>Fine tune appearance</small></span><input type="range" aria-label="'+label+'" min="0" max="100" value="'+(i*10+20)+'"><output>'+(i*10+20)+'%</output></label>'),
 '</div></fieldset></div>',
 '<footer class="glass-appearance-actions"><label class="glass-remember"><input type="checkbox" checked>Remember this setting on this device</label><button>Reset</button><button class="glass-save">Save Current Setting</button></footer>',
 '</section></div>'
].join("");
const browser=await chromium.launch({args:["--no-sandbox","--disable-dev-shm-usage","--no-zygote"]});
fs.mkdirSync("test-evidence",{recursive:true});
const get=(p,s)=>p.locator(s).first().evaluate(el=>{
 const x=getComputedStyle(el),r=el.getBoundingClientRect();
 return {color:x.color,bg:x.backgroundColor,display:x.display,visibility:x.visibility,
   opacity:x.opacity,backdrop:x.backdropFilter,overflowY:x.overflowY,
   width:r.width,left:r.left,right:r.right,height:r.height};
});
try {
 for(const width of [360,390,430,768]){
  const p=await browser.newPage({viewport:{width,height:800}});
  await p.setContent('<!doctype html><html data-appearance="glass" data-glass-dark="true" data-glass-design="liquid" style="'+vars+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+shell+editor+'</body></html>');
  for(const path of styles)await p.addStyleTag({path});
  await p.waitForTimeout(850);
  assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector(".banksetu-app-shell"),"::before").content),"none","Mobile ghost wallpaper pseudo-layer still renders");
  const pageW=await p.evaluate(()=>document.documentElement.scrollWidth);
  assert(pageW<=width+2,"Page overflows horizontally "+width+" => "+pageW);
  const logo=await get(p,".persistent-bank-header"),header=await get(p,".dashboard-top-bar");
  assert(logo.right<=width+1&&logo.left>=-1,"Bank logo/info header clipped on mobile");
  assert(header.right<=width+1,"Top bar wider than viewport");
  for(const selector of [".settings-admin-hero",".admin-users-panel",".admin-users-toolbar",".sync-header",".sync-protection",".sync-health"]){
    const v=await get(p,selector);
    assert.notEqual(v.bg,"rgb(255, 255, 255)","Opaque white panel: "+selector);
    assert.equal(v.color,"rgb(248, 251, 255)","Unreadable glass surface: "+selector+" "+v.color);
  }
  assert.equal((await get(p,".dashboard-quick-panel")).backdrop,"none","Quick panel still has mobile nested blur");
  await p.evaluate(()=>window.scrollTo(0,600));
  await p.waitForTimeout(160);
  const after=await p.evaluate(()=>document.documentElement.scrollWidth);
  assert(after<=width+2,"Page overflows after scroll");
  await p.locator(".glass-appearance-overlay").evaluate(el=>el.style.display="grid");
  await p.waitForTimeout(200);
  const panel=await get(p,".glass-appearance-panel");
  assert(panel.right<=width+1&&panel.left>=-1&&panel.height<=800,"Appearance editor clipped "+width);
  const scroll=await get(p,".glass-appearance-scroll");
  assert.equal(scroll.visibility,"visible");
  assert.equal(scroll.display,"block");
  assert.equal(scroll.overflowY,"auto","Appearance scroll body not scrollable");
  const legend=await get(p,".glass-appearance-panel legend");
  assert(["rgb(245, 250, 255)","rgb(255, 255, 255)"].includes(legend.color),"Appearance controls labels invisible: "+legend.color);
  assert.equal((await get(p,".glass-appearance-scroll>fieldset")).backdrop,"none","Nested editor blur causes flicker");
  const slider=await get(p,'input[aria-label="Transparency"]');
  assert(slider.width>40,"Slider too narrow for touch input");
  await p.locator('input[aria-label="Transparency"]').scrollIntoViewIfNeeded();
  const res=await p.locator('input[aria-label="Transparency"]').evaluate(el=>{
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return {hit:hit===el||el.contains(hit),touch:getComputedStyle(el).touchAction};
  });
  assert(res.hit,"Slider is covered by another glass layer");
  assert(res.touch.includes("pan-x"),"Slider has incorrect touch-action "+res.touch);
  const before=await p.locator('input[aria-label="Transparency"]').inputValue();
  await p.locator('input[aria-label="Transparency"]').evaluate(el=>{el.value="76";el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));});
  const afterValue=await p.locator('input[aria-label="Transparency"]').inputValue();
  assert.equal(afterValue,"76","Range cannot change");
  if(width===390){
    await p.screenshot({path:"test-evidence/mobile-glass-motion-390.png",fullPage:false});
  }
  console.log("PASS mobile ghost-free scroll, glass settings & appearance sliders "+width+"px "+before+"→"+afterValue);
  await p.close();
 }
}finally{await browser.close()}
