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
 assert.match(dashboard,/\{canCustomizeLayout && (bankSettingsReady || canControlGlobalDashboard)/);
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
 assert.match(studio,/if\(!windowsLayoutEngineAvailable\(\)&&!previewOnly\)return/);
 assert.ok(document.indexOf("if(!windowsLayoutEngineAvailable())")<
   document.indexOf("if(!templateCanRender("),"platform gate before any template output");
});

test("normal approved bank printing, Android customer flows and existing PR2 bridge are not deleted",()=>{
 const selected=file("src/SelectedBankDocument.tsx");
 const custom=file("src/CustomBankDocument.tsx");
 const ipc=file("desktop/preload.cjs");
 assert.match(selected,/return formatType === "accountOpening" \? <AccountOpeningPDF/);
 assert.match(selected,/return <CustomBankDocument/);
 assert.match(custom,/BankFormatPrint/);
 assert.match(ipc,/contextBridge\.exposeInMainWorld\('bankSetuPr2'/);
 assert.match(ipc,/platform: process\.platform, protocol: 1/);
});

test("Windows studio contains guided Design and Approval spaces while preserving physical paper and editing",()=>{
 const studio=file("src/CustomizeLayoutStudio.tsx");
 const css=file("src/CustomizeLayoutStudio.css");
 for(const label of ["Editor","Templates","Approvals","Windows EXE",
     "New Blank","Export Calibration PDF",
     "Save Draft","Run Layout Audit","ls-workflow-nav"]){
   assert.ok(studio.includes(label),label);
 }
 assert.match(studio,/workspaceView==="design"/);
 assert.match(studio,/setWorkspaceView\("library"\)/);
 assert.match(css,/\.ls-view-design > \.ls-catalog-panel \{display:none\}/);
 assert.match(css,/\.ls-view-library > \.ls-workspace/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/data-appearance="dark"/);
 assert.match(studio,/draft\.widthMm\*PX_PER_MM/,"physical paper width remains measured, not replaced by screen-based responsive scaling");
 const referenceCss=file("src/CustomizeLayoutReferenceLock.css");
 assert.match(referenceCss,/grid-template-columns:132px minmax\(0,1fr\)/);
 assert.match(referenceCss,/\.ls-field-panel-list/);
 assert.match(studio,/aria-label="Passbook Designer navigation"/);
 assert.match(studio,/aria-label="Editor status and zoom"/);
 assert.match(studio,/Map selected|Mapped /);
 assert.match(studio,/Make My Own Copy/);

});

test("Windows test installer artifact is downloadable without invoking One Click Release",()=>{
 const workflow=file(".github/workflows/layout-studio-draft.yml");
 assert.ok(workflow.includes("banksetu-layout-draft-windows-${{ github.event.pull_request.head.sha || github.sha }}"));
 assert.ok(workflow.includes("path: desktop-release/BankSetu-Setup-*.exe"));
 assert.match(workflow,/retention-days: 7/);
 assert.doesNotMatch(workflow,/firebase deploy|gh release create|merge_pull_request/);
});

test("Android and web runtime policy is reflected in real acceptance instructions",()=>{
 const acceptance=file("docs/LAYOUT_ENGINE_ACCEPTANCE.md");
 const android=file("docs/LAYOUT_ANDROID_DRAFT_TESTING.md");
 assert.match(acceptance,/Android\/web must not expose or execute the advanced Layout Studio/);
 assert.match(acceptance,/advanced Layout Studio is entirely absent/);
 assert.match(android,/The Android app must not fetch/);
 assert.match(android,/Do not uninstall or overwrite/);
});

test("Android/web builds alias away the heavyweight Windows Studio and renderer before packaging",()=>{
 const config=file("vite.config.ts");
 const pkg=JSON.parse(file("package.json"));
 const wrapper=file("scripts/build-android-client.mjs");
 const workflow=file(".github/workflows/layout-studio-draft.yml");
 assert.match(config,/mode==="web" \|\| mode==="android"/);
 assert.match(config,/BANKSETU_BUILD_TARGET==="android"/);
 assert.ok(config.includes("CustomizeLayoutStudio"));
 assert.ok(config.includes("WorkspaceTemplateDocument"));
 assert.match(config,/layoutUnavailable\.tsx/);
 assert.equal(pkg.scripts["android:sync"],"node scripts/build-android-client.mjs");
 assert.match(pkg.scripts["build:web"],/vite build --mode web/);
 assert.match(wrapper,/BANKSETU_BUILD_TARGET:"android"/);
 assert.match(workflow,/check-layout-target-bundle\.mjs android dist/);
 assert.match(workflow,/check-layout-target-bundle\.mjs web web-app-dist/);
 assert.match(workflow,/check-layout-target-bundle\.mjs windows dist/);
 assert.match(file("src/platform/layoutUnavailable.tsx"),/Windows EXE/);
});
