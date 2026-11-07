import {writeFile,mkdir,readFile} from "node:fs/promises";
import {join} from "node:path";

const fixture = String.raw`import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import DashboardAccountOpeningReport from "./DashboardAccountOpeningReport";
import "./App.css";
const params=new URLSearchParams(window.location.search);
const theme=params.get("theme")==="dark"?"dark":"light";
document.documentElement.dataset.appearance=theme;
const rows=[
  {name:"Demo Customer A",accountNo:"00001023456",accountOpeningDate:"2026-11-06",status:"Active",
   enrolId:"DEMO-001",fatherName:"Sample Guardian",dateOfBirth:"1995-02-10",gender:"Female",
   contact:"9000000001",email:"demo-a@example.invalid",fullAddress:"Example Street, Sample City",
   branch:"Demo Branch",ifsc:"DEMO0000001",accountType:"Saving"},
  {name:"Demo Customer B",accountNo:"00001023457",accountOpeningDate:"2026-11-04",status:"Active",
   enrolId:"DEMO-002",contact:"9000000002",fullAddress:"Sample Road, Test Town",accountType:"Saving"},
  {name:"Demo Customer C",accountNo:"00001023458",accountOpeningDate:"2026-11-01",status:"Inactive",
   enrolId:"DEMO-003",contact:"9000000003",accountType:"Current"},
  {name:"Demo Customer D",accountNo:"00001023459",accountOpeningDate:"2026-10-15",status:"Active",
   enrolId:"DEMO-004",accountType:"Saving"},
  {name:"Demo Customer E",accountNo:"00001023460",accountOpeningDate:"2026-09-22",status:"Active",
   enrolId:"DEMO-005",accountType:"Saving"},
  {name:"Demo Customer F",accountNo:"00001023461",accountOpeningDate:"2026-01-03",status:"Active",
   enrolId:"DEMO-006",accountType:"Saving"}
];
function Proof(){
 const [open,setOpen]=useState(true);
 return <div className="banksetu-app-shell" data-appearance={theme}
  style={{minHeight:"100dvh",background:theme==="dark"?"#0b1220":"#eaf0f6",padding:12}}>
  <button type="button" onClick={()=>setOpen(true)}>Open Account Opening Report</button>
  {open&&<DashboardAccountOpeningReport customers={rows} onClose={()=>setOpen(false)}/>}
 </div>;
}
createRoot(document.getElementById("root")!).render(<Proof/>);
`;
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>BANK SETU Account Opening Report Visual Proof (synthetic data)</title></head><body><div id="root"></div><script type="module" src="/src/dashboard-opening-proof-entry.tsx"></script></body></html>';
if(process.argv.includes("--prepare")){
 await writeFile("dashboard-opening-proof.html",html);
 await writeFile("src/dashboard-opening-proof-entry.tsx",fixture);
 // Screenshot-only build alias: never access real Firebase sessions, Google
 // Sheets, cached customer records, or a tenant-scoped production database.
 await writeFile("src/dashboard-proof-customer-list.ts",
   'export type CachedCustomer=Record<string,unknown>&{rowNumber?:number;recordId?:string};\n'+
   'export const customerListScope=()=>"visual-proof:synthetic-only";\n'+
   'export const readCustomerListCache=(_scope:string):CachedCustomer[]=>[];\n'+
   'export const writeCustomerListCache=(_scope:string,_rows:CachedCustomer[])=>{};\n');
 await writeFile("vite.dashboard-proof.config.mjs",
   'import {defineConfig} from "vite";\n'+
   'import react from "@vitejs/plugin-react";\n'+
   'import {resolve} from "node:path";\n'+
   'export default defineConfig({plugins:[react()],resolve:{alias:[{find:/customerListCache(?:\\.ts)?$/,replacement:resolve(process.cwd(),"src/dashboard-proof-customer-list.ts")}]},server:{port:5173,host:"127.0.0.1",strictPort:true,hmr:false}});\n');
 console.log("Prepared isolated screenshot-only React fixture with 6 synthetic customer rows.");
 process.exit(0);
}
const {chromium}=await import("playwright");
const output="dashboard-opening-real-screens";
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const captures=[];
const runtimeErrors=[];
const snap=async(page,filename,title,detail)=>{
 await page.waitForTimeout(350);
 await page.screenshot({path:join(output,filename+".png"),animations:"disabled",fullPage:false});
 captures.push({filename:filename+".png",title,detail,viewport:page.viewportSize(),
   source:"running PR #102 Vite/React app, TEST fixture, synthetic customers"});
 console.log("Screenshot "+filename);
};
const open=async(theme,mobile=false)=>{
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:930},
   deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 page.on("pageerror",error=>{runtimeErrors.push(String(error));console.error("PAGE ERROR:",error);});
 page.on("console",message=>{if(message.type()==="error")console.error("CONSOLE ERROR:",message.text());});
 page.on("response",response=>{if(response.status()>=400)
   console.error("HTTP ERROR:",response.status(),response.url());});
 await page.goto("http://127.0.0.1:5173/dashboard-opening-proof.html?theme="+theme,
   {waitUntil:"domcontentloaded",timeout:30000});
 try{
   await page.locator('.dashboard-opening-panel').waitFor({timeout:14000});
   await page.locator('.dashboard-opening-panel tbody tr').first().waitFor({timeout:15000});
 }catch(error){
   console.error("RENDER ERROR",String(error));
   console.error("URL",page.url());
   console.error("PAGE BODY",String(await page.locator("body").innerText()).slice(0,2600));
   console.error("PAGE HTML",String(await page.content()).slice(0,2800));
   console.error("VITE OVERLAY",await page.locator("vite-error-overlay").evaluateAll(els=>els.map(el=>el.shadowRoot?.textContent?.slice(0,4000)||"")).catch(()=>[]));
   console.error("VITE LOG",String(await readFile("/tmp/banksetu-report-vite.log","utf8").catch(()=>"(no log)")).slice(-8000));
   await page.screenshot({path:join(output,"capture-diagnostic-"+theme+(mobile?"-mobile":"-desktop")+".png")});
   throw error;
 }
 return page;
};
try{
 for(const theme of ["light","dark"]){
  for(const mobile of [false,true]){
   const id=theme+"-"+(mobile?"mobile":"desktop");
   const page=await open(theme,mobile);
   await snap(page,id+"-report",theme.toUpperCase()+" / "+(mobile?"PHONE":"DESKTOP")+" – Opening Report",
      "Running Account Opening Report. Date filtering, four fields, Copy button. Opening Amount removed.");
   await page.locator('.dashboard-opening-panel tbody tr').first().click();
   await page.locator('.customer-preview-card').waitFor({timeout:15000});
   await snap(page,id+"-preview",theme.toUpperCase()+" / "+(mobile?"PHONE":"DESKTOP")+" – Customer Preview",
      "Same All Customer Data preview component, showing Share, Print, Close. Synthetic details.");
   await page.getByRole('button',{name:'Close preview'}).click();
   if(theme==="light"&&!mobile){
    await page.getByRole("button",{name:"Month Range"}).click();
    await page.getByLabel("From opening month").fill("2026-01");
    await page.getByLabel("To opening month").fill("2026-11");
    await snap(page,"light-desktop-month-range","LIGHT / DESKTOP – Month Range",
      "January through November selection. Recorded opening dates only.");
    await page.getByRole("button",{name:"Date Range"}).click();
    await page.getByLabel("From account opening date").fill("2026-10-01");
    await page.getByLabel("To account opening date").fill("2026-11-07");
    await snap(page,"light-desktop-date-range","LIGHT / DESKTOP – Exact Date Range",
      "Inclusive manual From/To selection. Report contains no Opening Amount.");
   }
   await page.close();
  }
 }
 const meta={captured:new Date().toISOString(),commit:process.env.GITHUB_SHA||"",
    mode:"actual application components in isolated browser fixture",synthetic:true,
    isLiveCustomerOrPrintScreen:false,captures,runtimeErrors};
 await writeFile(join(output,"screenshots.json"),JSON.stringify(meta,null,2));
 if(runtimeErrors.filter(error=>!/WebSocket closed without opened/i.test(error)).length)
   throw new Error("React page errors: "+runtimeErrors.join("; "));
}finally{await browser.close();}
