import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isWindowsLayoutRuntime,windowsLayoutEngineAvailable} from "../src/platform/layoutEngineGate.ts";

const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const trusted={scheme:"banksetu:",platform:"win32",protocol:1,desktopRepository:true};

test("Windows EXE Layout Studio requires trusted native scheme, Windows platform, protocol and desktop repository",()=>{
 assert.equal(isWindowsLayoutRuntime(trusted),true);
 for(const changes of [
  {scheme:"https:"},{scheme:"http:"},{scheme:"file:"},{platform:"android"},
  {platform:"linux"},{platform:"darwin"},{platform:"Android"},{protocol:0},
  {protocol:2},{desktopRepository:false}
 ]){
  assert.equal(isWindowsLayoutRuntime({...trusted,...changes}),false,JSON.stringify(changes));
 }
 assert.equal(windowsLayoutEngineAvailable(),false,"no window in Node/CI should never make editing available");
});

test("Android/web hide both creation menu and direct page even if a saved page is selected",()=>{
 const dashboard=file("src/Dashboard.tsx");
 assert.match(dashboard,/const canCustomizeLayout = windowsLayoutEngineAvailable\(\) && !licenseReadOnly/);
 assert.match(dashboard,/\{canCustomizeLayout && <>/);
 assert.match(dashboard,/\{canCustomizeLayout && bankSettingsReady/);
 assert.match(dashboard,/!windowsLayoutEngineAvailable\(\) && \(activePage === "customize-passbook"/);
 assert.match(dashboard,/Return to Dashboard/);
 assert.match(dashboard,/lazy\(\(\) => import\("\.\/CustomizeLayoutStudio"\)\)/);
});

test("Windows-only engine cannot fetch/activate or render template on Android",()=>{
 const custom=file("src/CustomBankDocument.tsx");
 const document=file("src/WorkspaceTemplateDocument.tsx");
 const studio=file("src/CustomizeLayoutStudio.tsx");
 assert.match(custom,/if\(!windowsLayoutEngineAvailable\(\)\)return \(\)=>\{live=false;\};/);
 assert.match(custom,/windowsLayoutEngineAvailable\(\) && activeLayout && customer/);
 assert.match(document,/if\(!windowsLayoutEngineAvailable\(\)\)/);
 assert.match(studio,/if\(!windowsLayoutEngineAvailable\(\)\)return/);
 assert.ok(document.indexOf("if(!windowsLayoutEngineAvailable())")<
   document.indexOf("if(!templateCanRender("),"platform gate before any template output");
});

test("normal approved bank printing, Android customer flows and existing PR2 bridge are not deleted",()=>{
 const selected=file("src/SelectedBankDocument.tsx");
 const custom=file("src/CustomBankDocument.tsx");
 const ipc=file("desktop/preload.cjs");
 assert.match(selected,/return formatType === "accountOpening" \? <AccountOpeningPDF/);
 assert.match(selected,/\? <CustomBankDocument/);
 assert.match(custom,/BankFormatPrint/);
 assert.match(ipc,/contextBridge\.exposeInMainWorld\('bankSetuPr2'/);
 assert.match(ipc,/platform: process\.platform, protocol: 1/);
});

test("Windows studio contains guided Design and Approval spaces while preserving physical paper and editing",()=>{
 const studio=file("src/CustomizeLayoutStudio.tsx");
 const css=file("src/CustomizeLayoutStudio.css");
 for(const label of ["Design workspace","Templates & approval","Windows EXE",
     "New Blank Layout (Word-style)","Export Physical Calibration Ruler",
     "Save Draft to Offline DB","Run Layout Audit","ls-workflow-nav"]){
   assert.ok(studio.includes(label),label);
 }
 assert.match(studio,/workspaceView==="design"/);
 assert.match(studio,/workspaceView==="library"/);
 assert.match(css,/\.ls-view-design > \.ls-catalog-panel \{display:none\}/);
 assert.match(css,/\.ls-view-library > \.ls-workspace/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/data-appearance="dark"/);
 assert.match(studio,/draft\.widthMm\*PX_PER_MM/,"physical paper width remains measured, not replaced by screen-based responsive scaling");
});
