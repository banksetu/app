import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";
/* Synthetic browser fixtures; no authenticated client data and no printing. */
const browser=await chromium.launch({args:["--no-sandbox","--disable-dev-shm-usage","--no-zygote"]});
const vars=["--glass-fill:rgba(21,36,57,.38)","--glass-fill-strong:rgba(22,40,63,.70)",
  "--glass-text:#f6fbff","--glass-muted:#bed7ee","--glass-line:rgba(124,190,229,.48)",
  "--glass-accent:#8dd9ff","--glass-blur:25px","--glass-glow:11px",
  "--glass-rim-glow:8px","--glass-shadow:24px","--glass-motion:340ms",
  "--glass-luminance-opacity:.38"].join(";");
const markup=[
 '<main class="banksetu-app-shell" data-appearance="glass"><div class="banksetu-main-workspace" style="width:100%;margin:0">',
 '<div class="customer-entry-wrapper"><h1 class="customer-entry-title">Customer Data Entry Form</h1>',
 '<section class="customer-top-grid" style="display:grid;grid-template-columns:1.35fr .75fr .9fr;gap:14px">',
 '<div class="customer-tool-card" style="background:#0c2533;padding:16px"><p style="color:#292c57">CUSTOMER SEARCH</p><h2>Find Customer</h2><p>Customer ID and Account No</p><input placeholder="Search"><button>Search</button></div>',
 '<div class="customer-photo-card" style="background:#11293f;padding:16px"><p>Customer Photo</p><div class="customer-photo-area"><div style="background:white;color:#555">No Photo</div></div><button>Upload Photo</button></div>',
 '<div class="customer-tool-card" style="background:#0c2533;padding:16px"><p>PDF IMPORT</p><h2>Customer PDF</h2><p>Select account opening form</p><button>Select PDF &amp; Auto Fill</button></div>',
 '</section><section class="customer-form-card" style="background:#0b2939;border:2px solid white;padding:20px">',
 '<div class="customer-form-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">',
 '<label class="customer-field" style="display:flex;flex-direction:column"><span style="color:#252442;font-size:10px">ACCOUNT NO <span>*</span></span><input style="background:#0a303c;color:#fff" value="123456789"></label>',
 '<label class="customer-field" style="display:flex;flex-direction:column"><span style="color:#26243d;font-size:10px">GENDER</span><select style="background:#0a303c;color:#fff"><option>Female</option></select></label>',
 '<label class="customer-field customer-full-address" style="display:flex;flex-direction:column"><span style="color:#282446;font-size:10px">FULL ADDRESS</span><textarea style="background:#0a303c;color:#fff">Sample address</textarea></label>',
 '</div></section></div>',
 '<div class="aof-module"><h1>Account Opening PDF</h1><form class="search-panel" style="background:white;padding:12px"><label class="search-label">UNIVERSAL CUSTOMER SEARCH</label><div class="search-row"><input placeholder="Customer"><button>Search</button></div></form><div class="print-area"><div class="paper" style="background:#fff;color:#111827">A4 bank PDF paper</div></div></div>',
 '</div></main>',
 '<div class="ssa-export-overlay" style="display:none"><section class="ssa-export-dialog" role="dialog"><div class="ssa-export-heading"><h2>SSA PDF Report</h2><p>Choose period</p></div><div class="ssa-export-body"><fieldset class="ssa-export-group"><legend>Period</legend><label><input type="radio"> All customers</label></fieldset><div class="ssa-export-preview">Preview</div></div><footer class="ssa-export-actions"><button class="ssa-export-primary">PDF</button></footer></section></div>',
 '<div class="customer-preview-overlay" style="display:none"><section class="customer-preview-card"><header class="customer-preview-heading"><h2>Bank Setu Customer Preview</h2></header><div class="customer-preview-content"><section class="customer-preview-section"><h3>Personal Information</h3><dl><div><dt>Name</dt><dd>Sample</dd></div></dl></section><footer class="customer-preview-actions"><button>Print</button><button>Close</button></footer></div></section></div>'
].join("");
const sheets=["src/index.css","src/App.css","src/GlassTheme.css","src/GlassCoverage.css",
  "src/GlassVisualPolish.css","src/ThemeDeepCoverage.css","src/GlassLuminance.css","src/GlassFormPopupPolish.css"];
const css=(p,sel,ps)=>p.locator(sel).first().evaluate((el,ps)=>{
  const s=getComputedStyle(el,ps||null);
  return {bg:s.backgroundColor,color:s.color,border:s.borderTopStyle,blur:s.backdropFilter,
    shadow:s.boxShadow,opacity:s.opacity,fontSize:parseFloat(s.fontSize),content:s.content};
},ps);
fs.mkdirSync("test-evidence",{recursive:true});
try{
 for(const width of [360,390,768,1280]){
  const p=await browser.newPage({viewport:{width,height:900}});
  await p.setContent('<!doctype html><html data-appearance="glass" data-glass-dark="true" style="'+vars+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+markup+'</body></html>');
  for(const file of sheets)await p.addStyleTag({path:file});
  await p.waitForTimeout(550);
  for(const field of [".customer-field>input",".customer-field>select",".customer-field>textarea",
      ".customer-tool-card",".customer-photo-card",".customer-form-card"]){
    assert.equal((await css(p,field)).border,"solid",field+" missing glass border");
  }
  for(const label of await p.locator(".customer-field>span").all()){
    const x=await label.evaluate(el=>({color:getComputedStyle(el).color,size:parseFloat(getComputedStyle(el).fontSize)}));
    assert.equal(x.color,"rgb(246, 251, 255)","Invisible customer field label: "+x.color);
    assert(x.size>=11,"Customer field label too small: "+x.size);
  }
  assert.notEqual((await css(p,".customer-field>input")).bg,"rgb(10, 48, 60)","Old solid field");
  assert.notEqual((await css(p,".customer-tool-card")).bg,"rgb(12, 37, 51)","Old solid card");
  await p.locator(".customer-tool-card").first().hover();
  await p.waitForTimeout(730);
  assert(parseFloat((await css(p,".customer-tool-card","::after")).opacity)>.2,"Hover luminance missing");
  if(width<=390){
    const cols=await p.locator(".customer-form-grid").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
    assert.equal(cols,1,"Mobile customer form has more than one column");
  }
  await p.locator(".ssa-export-overlay").evaluate(e=>e.style.display="flex");
  await p.waitForTimeout(250);
  const overlay=await css(p,".ssa-export-overlay"),dialog=await css(p,".ssa-export-dialog");
  assert(overlay.blur.includes("3px"),"Popup backdrop still overblurred: "+overlay.blur);
  assert(dialog.blur!=="none"&&dialog.shadow!=="none","SSA PDF popup missing glass surface");
  await p.locator(".ssa-export-overlay").evaluate(e=>e.style.display="none");
  await p.locator(".customer-preview-overlay").evaluate(e=>e.style.display="flex");
  const card=await css(p,".customer-preview-card"),inner=await css(p,".customer-preview-section");
  assert(card.blur!=="none"&&card.shadow!=="none","Customer details popup missing glass");
  assert.notEqual(inner.bg,"rgb(255, 255, 255)","Customer preview section white");
  assert.equal((await css(p,".customer-preview-section dt")).color,"rgb(190, 215, 238)","Customer popup text contrast wrong");
  await p.locator(".customer-preview-overlay").evaluate(e=>e.style.display="none");
  assert.equal((await css(p,".paper")).bg,"rgb(255, 255, 255)","A4 paper recolored");
  if(width===390||width===1280)await p.screenshot({path:"test-evidence/glass-form-popup-"+width+".png",fullPage:false});
  await p.emulateMedia({reducedMotion:"reduce"});
  const transition=await p.locator(".customer-tool-card").first().evaluate(el=>getComputedStyle(el,"::after").transitionDuration);
  assert(["0s","0.00001s","1e-05s"].includes(transition),"Reduced motion ignored "+transition);
  console.log("PASS Customer Form / AOF / SSA Popup / Customer Details "+width+"px");
  await p.close();
 }
}finally{await browser.close()}
