import assert from "node:assert/strict";
import fs from "node:fs";
import {chromium} from "playwright";
const markup="<main class=\"banksetu-app-shell\" style=\"width:100%;min-height:100dvh\"><section class=\"banksetu-main-workspace\" style=\"width:100%;margin:0\"><section class=\"aof-module\"><div class=\"module-head\"><h1>Account Opening PDF Sample</h1><p>Search customer</p></div><form class=\"search-panel\"><label class=\"search-label\">UNIVERSAL CUSTOMER SEARCH</label><div class=\"search-row\"><input placeholder=\"Account No / Aadhaar / CIF\"><button type=\"button\">Search</button></div></form><div class=\"print-area\" style=\"background:white;color:black\"><section class=\"paper\" style=\"background:white;color:black\" id=\"aof-paper\">Real printable A4 paper</section></div></section><section class=\"support-page\"><header class=\"support-hero\"><div><h1>How can we help?</h1><p>Secure private chat</p></div><button class=\"whatsapp-support\">WhatsApp Support</button></header><div class=\"support-tabs\"><button>Home</button><button>Private Chat</button><button>FAQs</button></div><div class=\"support-home\"><button class=\"support-home-whatsapp\">WhatsApp Support</button><div class=\"support-home-grid\"><button><span>◉</span><strong>Private Chat</strong><small>Secure conversations</small></button><button><strong>Announcements</strong></button><button><strong>Help</strong></button><button><strong>FAQs</strong></button></div><section class=\"support-recent\"><div><h2>Recent conversations</h2><button>View all</button></div><button><strong>Sample support chat</strong><small>Recent message</small></button></section></div><div class=\"chat-layout\"><aside class=\"conversation-list\"><h2>Conversations</h2><div class=\"support-users\"><button>Support Team</button></div></aside><article class=\"chat-panel\"><div class=\"chat-title\"><strong>Private Chat</strong><span>Online</span></div><div class=\"message-list\"><div class=\"message\"><p>Example inbound message</p></div><div class=\"message mine\"><p>Example outbound reply</p></div><div class=\"empty-support\">Some chat content</div></div><div class=\"chat-compose\"><textarea placeholder=\"Type your message\"></textarea><button>Send</button></div></article></div><section class=\"announcement-feed\"><h2>Announcements</h2><div class=\"announcement\"><h3>App update</h3><p>Information</p></div></section></section></section></main>";
const styles=["src/index.css","src/App.css","src/SupportCenter.css","src/GlassTheme.css",
"src/GlassCoverage.css","src/GlassVisualPolish.css","src/ThemeDeepCoverage.css"];
const vars=["--glass-fill:rgba(17,24,38,.38)","--glass-fill-strong:rgba(16,24,38,.68)",
"--glass-text:#f8fbff","--glass-muted:#c8d8ee","--glass-line:rgba(255,255,255,.42)",
"--glass-highlight:.35","--glass-blur:20px","--glass-motion:320ms",
"--glass-entry-motion:540ms","--glass-stagger:180ms","--glass-glow:10px","--glass-shadow:26px"].join(";");
const calc=(page,selector)=>page.locator(selector).first().evaluate(el=>{
 const c=getComputedStyle(el),rect=el.getBoundingClientRect();
 return {bg:c.backgroundColor,fg:c.color,border:c.borderTopStyle,filter:c.backdropFilter,
    transform:c.transform,shadow:c.boxShadow,right:rect.right,scroll:el.scrollWidth,client:el.clientWidth};
});
const alpha=v=>Number(v.bg.match(/^rgba\([^)]+,\s*([\d.]+)\)$/)?.[1]??NaN);
const dark=v=>{const m=v.bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
return m&&Number(m[1])<150&&Number(m[2])<150&&Number(m[3])<155};
const browser=await chromium.launch({args:["--no-sandbox","--disable-dev-shm-usage","--no-zygote"]});
fs.mkdirSync("test-evidence",{recursive:true});
try {
for(const mode of ["dark","glass"]){
 for(const width of [360,390,768,1280]){
  const p=await browser.newPage({viewport:{width,height:940},deviceScaleFactor:1});
  await p.setContent('<!doctype html><html data-appearance="'+mode+'" data-glass-dark="true" style="'+vars+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+markup+'</body></html>');
  await p.locator(".banksetu-app-shell").evaluate((e,mode)=>e.dataset.appearance=mode,mode);
  for(const file of styles)await p.addStyleTag({path:file});
  await p.waitForTimeout(1250);
  const targets=[".aof-module",".search-panel",".search-row input",".search-row button",
    ".support-home-grid>button",".support-recent",".support-recent>button",
    ".message-list",".message:not(.mine)",".chat-compose",".announcement-feed"];
  for(const sel of targets){
    const style=await calc(p,sel);
    if(mode==="dark")assert(dark(style),sel+" stays light in Dark: "+style.bg);
    else assert(alpha(style)>.02&&alpha(style)<.96,sel+" is not translucent in Glass: "+style.bg);
  }
  const paper=await calc(p,"#aof-paper");
  assert.equal(paper.bg,"rgb(255, 255, 255)","A4 PDF paper was recolored");
  assert.equal(await p.locator("#aof-paper").evaluate(el=>getComputedStyle(el).color),
    "rgb(0, 0, 0)","A4 PDF paper text was recolored");
  const top=await calc(p,".aof-module");
  assert(top.right<=width+1,"AOF spills outside viewport "+width);
  const support=await calc(p,".support-page");
  assert(support.right<=width+1,"Support spills outside viewport "+width);
  if(mode==="glass"){
    const button=await calc(p,".search-row button");
    assert(button.shadow!=="none","Search button has no dimensional glass");
    const msg=await calc(p,".message.mine");
    assert(msg.border==="solid","Sent chat bubble missing glass border");
    await p.locator(".support-home-grid>button").first().hover({force:true});
    const hover=await calc(p,".support-home-grid>button");
    assert(hover.shadow!=="none","Support button loses interactive feedback");
  }
  if(width===390||width===1280)
    await p.screenshot({path:"test-evidence/deep-"+mode+"-"+width+".png",fullPage:true});
  console.log("PASS Deep "+mode+" "+width+"px AOF / Support / private chat / buttons / paper");
  await p.close();
 }
}
}finally{await browser.close()}
