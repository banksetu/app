import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {shouldDismissNotificationSwipe} from "../src/core/notificationSwipe.ts";
const read=p=>fs.readFileSync(p,"utf8");
const css=read("src/ThemeDeepCoverage.css"),studio=read("src/GlassVisualPolish.css");
const all=[css,read("src/GlassCoverage.css"),read("src/GlassTheme.css"),studio,read("src/SsaAppearance.css")].join("\n");
const featureManifests={
  Dashboard:["dashboard-stat-card","dashboard-analytics-card","persistent-bank-header","bank-info-strip"],
  CustomerEntry:["customer-form-card","customer-photo-card","customer-action-buttons"],
  QuickPassbook:["passbook-search-card","passbook-actions","passbook-print-area"],
  PassbookPrint:["pr2-dialog","print-alignment-window","print-alignment-settings"],
  AllCustomerData:["all-customer-data","customer-preview-card","customer-preview-actions"],
  AccountOpening:["aof-module","module-head","search-panel","search-row","match-modal"],
  SSA:["ssa-banner","ssa-kpi","ssa-search","ssa-report-buttons"],
  FormsSendToBranch:["afsm-panel","afsm-actions"],
  Settings:["settings-page","admin-client-workspace","admin-user-card"],
  Reports:["reports-page","reports-panel"],
  SyncBackup:["sync-center","sync-card","sync-maintenance"],
  Support:["support-hero","support-home-grid","support-recent","chat-layout","message-list","message","chat-compose","support-message-actions"]
};
test("all 12 feature menus and Support have source-linked Glass coverage",()=>{
  for(const [area,selectors] of Object.entries(featureManifests)){
    for(const name of selectors){
      assert(all.includes("."+name),area+" CSS missed "+name);
    }
  }
  assert.match(read("src/Dashboard.tsx"),/import "\.\/ThemeDeepCoverage\.css";/);
});
test("AOF PDF search and Support private chat get separate Dark and Glass treatments",()=>{
  assert.match(css,/data-appearance="dark"\] \.aof-module/);
  assert.match(css,/data-appearance="glass"\] \.banksetu-app-shell \.aof-module/);
  assert.match(css,/\.aof-module > \.search-panel/);
  assert.match(css,/\.aof-module \.search-row button/);
  for(const c of [".support-hero",".support-home-grid>button",".support-recent>button",
    ".message-list",".message.mine",".chat-compose",".announcement",".support-reply-reference",
    ".support-message-actions summary"]){
    assert(css.includes(c),"Support detail missing "+c);
  }
  assert.match(css,/\.banksetu-support-popup \.support-page/);
  assert.match(css,/@media print/);
  for(const p of [".paper *",".print-area *",".passbook-print-area *",".customer-pdf-page *"]){
    assert(css.includes(p),"Physical paper exclusion missing "+p);
  }
});
test("Glass Appearance sliders preview immediately; closing restores state and save commits",()=>{
  const d=read("src/Dashboard.tsx"),panel=read("src/GlassAppearancePanel.tsx"),vars=read("src/core/glassAppearance.ts");
  assert.match(d,/onPreview=\{setGlassSettings\}/);
  assert.match(d,/if\(!saved&&glassPreviewOriginal\)setGlassSettings\(glassPreviewOriginal\)/);
  assert.match(panel,/useEffect\(\(\)=>\{onPreview\(draft\);\},\[draft,onPreview\]\)/);
  assert.match(panel,/await onSave\(draft,uploaded,remember\);onClose\(true\)/);
  assert.match(panel,/type="range"/);
  for(const v of ["--glass-fill","--glass-fill-strong","--glass-line","--glass-blur","--glass-glow","--glass-highlight","--glass-shadow","--glass-motion","--glass-entry-motion","--glass-stagger"]){
    assert(vars.includes('"'+v+'"'),"Functional slider variable missing "+v);
  }
});
test("Slide notification: rightward mouse/touch drag only; X button and auto expiry retained",()=>{
  assert.equal(shouldDismissNotificationSwipe(130,4,340),true);
  assert.equal(shouldDismissNotificationSwipe(30,0,340),false);
  assert.equal(shouldDismissNotificationSwipe(-190,0,340),false);
  assert.equal(shouldDismissNotificationSwipe(145,130,340),false);
  assert.equal(shouldDismissNotificationSwipe(110,4,340),true);
  assert.equal(shouldDismissNotificationSwipe(100,5,600),false);
  const slide=read("src/SlideNotifications.tsx");
  assert.match(slide,/onPointerDown=\{down\}/);
  assert.match(slide,/onPointerMove=\{move\}/);
  assert.match(slide,/onPointerUp=\{end\}/);
  assert.match(slide,/onPointerCancel=\{reset\}/);
  assert.match(slide,/onLostPointerCapture=\{reset\}/);
  assert.match(slide,/touch-action:pan-y/);
  assert.match(slide,/aria-label="Dismiss notification"/);
  assert.match(slide,/6500/);
});
test("Bank header now uses lighter subtle depth without changing actual logo pixels",()=>{
  assert.match(studio,/0 5px 15px rgba\(4,13,32,\.16\)/);
  assert.match(studio,/object-fit:contain!important/);
  assert.match(studio,/filter:none!important/);
  assert.doesNotMatch(css,/\.paper\s*\{\s*background:var\(--glass-fill\)/);
});
