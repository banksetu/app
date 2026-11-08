import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";
/* Browser-rendered synthetic UI: validates CSS, not live client customer data. */
const darkWallpaper="radial-gradient(circle at 70% 27%,#4f4968,transparent 40%),linear-gradient(125deg,#0e1527,#2d394c,#101624)";
const paleWallpaper="linear-gradient(135deg,#dfe9fb,#aabed9 50%,#d4b5c8)";
const vars=[
 "--glass-fill:rgba(17,24,38,.37)","--glass-fill-strong:rgba(16,24,38,.65)",
 "--glass-text:#f8fbff","--glass-muted:#d6e1ef",
 "--glass-line:rgba(116,183,236,.49)","--glass-accent:#a6dfff",
 "--glass-blur:17px","--glass-glow:10px","--glass-rim-glow:8px",
 "--glass-shadow:24px","--glass-motion:300ms","--glass-stagger:180ms",
 "--glass-entry-motion:520ms","--glass-luminance-opacity:.32"
].join(";");
const htmlBody=[
 '<main class="banksetu-app-shell" data-appearance="glass" data-glass-design="liquid">',
 '<aside class="banksetu-sidebar"></aside>',
 '<section class="banksetu-main-workspace" style="width:100%;margin:0;padding:20px">',
 '<header class="dashboard-top-bar" style="display:grid;grid-template-columns:44px minmax(0,1fr) 48px;gap:10px;padding:12px">',
 '<button class="mobile-menu-button" style="width:42px;height:42px">☰</button>',
 '<section class="persistent-bank-header" style="display:grid;min-width:0;padding:10px">',
 '<div class="bank-logo-zone has-logo" style="display:flex;justify-content:center">',
 '<div role="img" aria-label="Synthetic bank logo" style="display:flex;align-items:center;justify-content:center;min-height:45px;font-weight:800;color:#27a9dd"><span style="font-size:35px">❖</span> ASSAM GRAMIN BANK</div>',
 '</div><div class="bank-info-strip" style="text-align:center"><h2>ASSAM GRAMIN BANK</h2>',
 '<div class="bank-info-details">Passbook Bank: Assam Gramin Bank · Branch BADARPUR · CSP · Operator SAHIN · Address ASSAM 788806</div>',
 '</div></section>',
 '<div class="admin-wrapper" style="display:flex;flex-direction:column;gap:9px">',
 '<button class="dashboard-sync-button" style="width:42px;height:42px">↻</button><button class="admin-trigger" style="width:42px;height:42px">A</button>',
 '</div></header>',
 '<div class="dashboard-kpi-controls"><button class="dashboard-kpi-privacy-toggle">◉ Hide</button></div>',
 '<section class="dashboard-stats-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">',
 ...["Total Customers: 2782","KYC Pending: 23","Passbook Pending: 1698","This Month Account Openings: 4"].map(s=>'<button class="dashboard-stat-card" style="padding:15px;min-height:114px">'+s+'</button>'),
 '</section>',
 '<section class="dashboard-quick-panel"><h2>Quick Actions</h2><div class="dashboard-quick-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px">',
 ...["Add Customer","Upload PDF","Passbook Print","Account Opening PDF"].map(s=>'<button class="dashboard-quick-card" style="padding:14px;min-height:75px">'+s+'</button>'),
 '</div></section>',
 '<section class="dashboard-analytics"><h2>Analytics</h2><div class="dashboard-analytics-grid">',
 '<article class="dashboard-analytics-card"><h3>Customer Growth</h3><p>Currently active customers</p><div class="dashboard-analytics-bars">',
 ...["Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov"].map((m,i)=>'<div class="dashboard-analytics-column" data-tooltip="'+m+'"><span class="dashboard-analytics-bar growth" style="height:'+(4+i*7)+'%"></span><small>'+m+'</small></div>'),
 '</div></article>',
 '<article class="dashboard-analytics-card"><h3>Monthly Customer Entries</h3><p>Monthly average (12 months)</p><div class="dashboard-analytics-bars">',
 ...["Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov"].map((m,i)=>'<div class="dashboard-analytics-column" data-tooltip="'+m+'"><span class="dashboard-analytics-bar entries" style="height:'+(i===10?80:4+i*2)+'%"></span><small>'+m+'</small></div>'),
 '</div></article>',
 '<article class="dashboard-analytics-card"><h3>Customer Status Analytics</h3><p>Click a status to view its list</p>',
 ...["KYC Pending","Passbook Pending","This Month Account Openings"].map(x=>'<button class="dashboard-analytics-status"><span>'+x+'</span><strong>4</strong><span class="dashboard-analytics-track"><span style="width:50%"></span></span></button>'),
 '</article></div></section></section></main>'
].join("");
const cssFiles=["src/index.css","src/App.css","src/GlassTheme.css","src/GlassCoverage.css",
"src/GlassVisualPolish.css","src/ThemeDeepCoverage.css","src/GlassLuminance.css",
"src/GlassFormPopupPolish.css","src/MobileLiquidGlassFix.css",
"src/MobileGlassMotionPolish.css","src/MobileGlassViewportFinish.css"];
const browser=await chromium.launch({args:["--no-sandbox","--disable-dev-shm-usage","--no-zygote"]});
fs.mkdirSync("test-evidence",{recursive:true});
const geometry=(page,selector)=>page.locator(selector).first().evaluate(el=>{
 const s=getComputedStyle(el),r=el.getBoundingClientRect();
 return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
 grid:s.gridTemplateColumns,rows:s.gridTemplateRows,background:s.backgroundColor,image:s.backgroundImage,
 flex:s.flexDirection,display:s.display,position:s.position,filter:s.backdropFilter};
});
try {
 const page=await browser.newPage({viewport:{width:1240,height:850},deviceScaleFactor:1});
 await page.setContent('<!doctype html><html data-appearance="glass" data-glass-dark="true" data-glass-design="liquid" style="'+vars+';--glass-wallpaper:'+darkWallpaper+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+htmlBody+'</body></html>');
 for(const file of cssFiles)await page.addStyleTag({path:file});
 await page.waitForTimeout(350);
 const desktopCols=(await geometry(page,".dashboard-analytics-grid")).grid.trim().split(/\s+/).length;
 assert.equal(desktopCols,2,"Desktop analytics grid should still have two columns");
 for(const width of [900,768,520,430,390,360,320]){
  await page.setViewportSize({width,height:850});
  await page.waitForTimeout(150);
  const bg=await geometry(page,"body"),root=await geometry(page,"html");
  assert(bg.image.includes("gradient")&&root.image.includes("gradient"),"Dark Blur wallpaper missing at "+width);
  assert.equal(bg.background,"rgb(14, 21, 39)","Mobile wallpaper fallback is not dark at "+width);
  const grid=await geometry(page,".dashboard-analytics-grid");
  const cols=grid.grid.trim().split(/\s+/).length;
  assert.equal(cols,1,"Analytics forced into two columns at "+width+": "+grid.grid);
  const cards=await page.locator(".dashboard-analytics-grid>.dashboard-analytics-card").evaluateAll(els=>
    els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top}}));
  assert(cards.length===3);
  assert(cards.every(c=>c.width>=grid.width*.94),"Analytics card only half-width at "+width);
  assert(cards[2].top>cards[1].top,"Status analytics doesn't stack after entries");
  const top=await geometry(page,".dashboard-top-bar");
  const logo=await geometry(page,".persistent-bank-header");
  const actions=await geometry(page,".admin-wrapper");
  const menu=await geometry(page,".mobile-menu-button");
  assert(logo.top-top.top<72,"Too much blank space above bank logo at "+width+": "+(logo.top-top.top));
  assert(logo.top>=menu.top,"Logo overlaps toolbar at "+width);
  assert.equal(actions.flex,"row","Admin and sync buttons still stack vertically at "+width);
  assert(top.right<=width+2&&logo.right<=width+2,"Header overflows viewport "+width);
  assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+2,"Horizontal document drift "+width);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.waitForTimeout(100);
  assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+2,"Horizontal drift after scroll "+width);
  if([390,768].includes(width))await page.screenshot({path:"test-evidence/mobile-responsive-finish-"+width+".png",fullPage:true,animations:"disabled"});
  console.log("PASS responsive Dark Blur mobile "+width+"px: wallpaper, compact bank header, 3 full-width analytics, no side-scroll");
 }
 await page.setViewportSize({width:1200,height:850});
 await page.waitForTimeout(250);
 assert.equal((await geometry(page,".dashboard-analytics-grid")).grid.trim().split(/\s+/).length,2,"Desktop grid fails after resizing back");
 await page.setViewportSize({width:390,height:850});
 await page.evaluate(bg=>document.documentElement.style.setProperty("--glass-wallpaper",bg),paleWallpaper);
 await page.evaluate(()=>{document.documentElement.dataset.glassDark="false";document.documentElement.style.setProperty("--glass-text","#13233b");});
 await page.waitForTimeout(150);
 const light=await geometry(page,"body");
 assert(light.image.includes("gradient"),"Light background lost on resize");
 assert.equal(light.background,"rgb(224, 232, 244)","Light Glass theme must keep its palette");
 console.log("PASS resizing narrow → desktop → narrow preserves saved Dark and Light Glass wallpaper");
 await page.close();
} finally { await browser.close(); }
