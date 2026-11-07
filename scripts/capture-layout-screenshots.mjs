import {chromium} from "playwright";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";

const output=process.env.SCREENSHOT_OUT||"layout-visual-proof";
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const page=await browser.newPage({viewport:{width:1600,height:950},deviceScaleFactor:1});
const errors=[];
page.on("pageerror",err=>errors.push(String(err)));
const shots=[];
const take=async(filename,title,description)=>{
  await page.waitForTimeout(400);
  await page.screenshot({path:join(output,filename+".png"),fullPage:true,animations:"disabled"});
  shots.push({filename,title,description});
  console.log("Captured "+filename+" - "+title);
};
const tab=async(name)=>{
  await page.locator(".ls-word-tabs button",{hasText:new RegExp("^.*"+name+"$")}).first().click();
  await page.waitForTimeout(250);
};
const openBlank=async(outputType="Quick Passbook")=>{
  await page.getByRole("button",{name:"Bank Setup"}).click();
  await page.getByRole("heading",{name:"Please Select Your Bank"}).waitFor();
  await page.getByRole("button",{name:/Next: Choose method/}).click();
  await page.getByRole("button",{name:/Create New Layout/}).click();
  await page.getByRole("button",{name:outputType,exact:false}).click();
  await page.getByRole("button",{name:/Open Word-style Editor/}).click();
  await page.locator(".ls-paper").waitFor({timeout:20000});
};
try {
  await page.goto("http://127.0.0.1:5173/",{waitUntil:"domcontentloaded",timeout:45000});
  await page.getByRole("heading",{name:"Design your passbook in easy steps"}).waitFor({timeout:30000});
  await take("01-bank-step","Choose bank - actual running UI","Real PR #101 browser demo, with synthetic bank information; the Windows login is not reproduced.");
  await page.getByRole("button",{name:/Next: Choose method/}).click();
  await take("02-method-step","Choose source document","Actual wizard lets users choose PDF, Word DOC/DOCX or a measured blank page.");
  await page.getByRole("button",{name:/Create New Layout/}).click();
  await take("03-print-output","Choose Quick or Direct PR2","Separate output modes for graphics/photo and text-only dot-matrix data.");
  await page.getByRole("button",{name:"Quick Passbook"}).click();
  await page.getByRole("button",{name:/Open Word-style Editor/}).click();
  await page.locator(".ls-paper").waitFor({timeout:20000});
  await take("04-editor-home","Actual Editor / Home ribbon","Slim sidebar, live editable paper, Word-like ribbon and current draft status.");
  await tab("Insert");
  await take("05-editor-insert","Insert ribbon","Fields, text, tables, and shapes are controlled from the running editor.");
  await tab("Layout");
  await take("06-editor-layout","Layout ribbon","Paper setup, physical measurements and fold controls live in Layout.");
  const setupBtn=page.getByRole("button",{name:/Page Setup/i}).first();
  if(await setupBtn.count()){
    await setupBtn.click();
    await page.getByRole("dialog",{name:/Passbook Page Setup/i}).waitFor({timeout:5000});
    await take("07-page-setup","Page Setup dialog","Real editable page size, fold and print-start fields. Inputs accept Backspace and typed mm/cm/in values.");
    await page.getByRole("button",{name:/Close|Done.*Return/i}).first().click();
  }
  await tab("File");
  await take("08-editor-file","File ribbon","Save draft, editable JSON backup, restore, proof PDF, Master submission (role-gated).");
  await tab("Review");
  await take("09-editor-review","Review ribbon","Compare, OCR review and print legibility checks.");
  await tab("View");
  await take("10-editor-view","View and zoom ribbon","Actual canvas with ruler, grid, overlay controls and 50-400 percent zoom.");
  await openBlank("Passbook Print (PR2)");
  await take("11-pr2-editor","Direct PR2 editor","Running source screen for the separate text-only passbook output.");
  await tab("File");
  await take("12-pr2-file","PR2 File actions","This is a synthetic browser preview; real Epson device actions are unavailable here.");

  const sha=process.env.GITHUB_SHA||"unverified";
  const now=new Date().toISOString();
  const esc=(s)=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const chapters=[];
  chapters.push('<article class="page intro"><h1>BANK SETU — ACTUAL RUNNING UI</h1><h2>Draft PR #101 · Visual evidence report</h2><p>This PDF embeds screenshots captured directly from the running React/Vite application in an isolated browser preview (not illustrations or AI mockups).</p><div class="disclaimer"><b>Important distinction:</b> Screenshot source is the actual PR #101 Codespaces-compatible preview with synthetic Bank/Customer values. The Windows EXE client login, authenticated Master Admin management, live customer print page and Epson physical print dialog have <b>not</b> been captured here. Exact pixel equality with Windows and its native printer is <b>not verified</b>.</div><p><b>Commit:</b> '+esc(sha)+'</p><p><b>Captured at:</b> '+esc(now)+'</p><p><b>Source:</b> banksetu/app, branch codex/word-passbook-ux-safe-20261107</p><p><b>Release state:</b> Draft, not merged, not deployed.</p><p>Each following screenshot is a real browser capture from this source revision. Images are scaled only to fit the PDF page.</p></article>');
  for(let i=0;i<shots.length;i++){
    const item=shots[i],img=(await readFile(join(output,item.filename+".png"))).toString("base64");
    chapters.push('<article class="page"><header><span>SCREEN '+(i+1)+' / '+shots.length+'</span><h2>'+esc(item.title)+'</h2><p>'+esc(item.description)+'</p></header><img class="screenshot" src="data:image/png;base64,'+img+'"/><footer>Real running browser preview | PR #101 | Synthetic data | No live print, Firebase or Master login</footer></article>');
  }
  chapters.push('<article class="page intro"><h2>What these pictures DO and DO NOT establish</h2><p><b>Verified visually in the captured browser:</b> bank setup wizard, output selection, actual Word-style ribbon, editable canvas, Layout and File ribbons, page geometry modal, Review/View and separate Quick vs PR2 editor modes.</p><p><b>Not visually verified by these pictures:</b> installed Windows EXE appearance on the user device, Windows print-preview native shell, authorized Master Admin catalog, customer data search/temporary edit on physical print page, exact Epson alignment and end-to-end print status.</p><p><b>For exact Windows screenshots:</b> install/run the unsigned Draft PR #101 test build on the target Windows machine and capture each screen from that environment, using a demo tenant/customer and test passbook stock. Do not release from this visual report.</p></article>');
  const css='<style>@page{size:A3 landscape;margin:11mm}html,body{margin:0;font-family:"DejaVu Sans",Arial,sans-serif;color:#193047;background:white}.page{page-break-after:always;break-after:page;height:268mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch}.page:last-child{page-break-after:auto}header{margin-bottom:9px;border-bottom:2px solid #1c6bb7;padding:0 4px 8px}header span{font-size:11px;letter-spacing:1px;color:#55718d}h1{font-size:38px;color:#11477e}h2{margin:3px 0 4px;font-size:23px;color:#124c8b}p{font-size:13px;margin:4px 0 9px;line-height:1.4}img.screenshot{display:block;object-fit:contain;object-position:top center;max-height:219mm;max-width:100%;width:auto;margin:auto auto 5px;border:1px solid #c9d4df;box-shadow:0 3px 9px #bacbdc}footer{font-size:9px;color:#617488;border-top:1px solid #dfe7ed;padding:5px;margin-top:auto}.intro{padding:30px 45px;gap:9px}.intro p{font-size:18px}.disclaimer{background:#f1f6fb;border-left:4px solid #1e68ad;padding:18px;font-size:17px;line-height:1.6}</style>';
  const printable=await browser.newPage({viewport:{width:1500,height:950}});
  await printable.setContent('<!DOCTYPE html><html><head><meta charset="utf-8">'+css+'</head><body>'+chapters.join('')+'</body></html>',{waitUntil:"load"});
  await printable.pdf({path:join(output,"BANK_SETU_PR101_Real_Running_UI_Screenshots.pdf"),printBackground:true,preferCSSPageSize:true,timeout:120000});
  await writeFile(join(output,"capture-metadata.json"),JSON.stringify({sha,date:now,mode:"actual browser demo",screenshots:shots,errors},null,2));
  if(errors.length){console.error("Browser runtime errors:",errors);process.exitCode=1;}
}finally{await browser.close();}
