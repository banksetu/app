import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getDocument,OPS} from "pdfjs-dist/legacy/build/pdf.mjs";
import {exportLayoutCalibrationProof} from "../src/layoutCalibrationProof.ts";
import {exportLayoutProofPdf} from "../src/layoutProofPdf.ts";
import {sanitizeLayoutTemplate} from "../cloudflare/layoutTemplates.js";
import {boundLayoutValue,templateCanRender} from "../src/layoutRuntimeValues.ts";
import {isLayoutLayerPrintable} from "../src/layoutOutputPolicy.ts";
import {layoutSelectionKey,normalizedActivationRecord,previousApprovedVersion} from "../cloudflare/layoutActivation.js";
import {inspectLayoutAcceptance,layoutReleaseReady} from "./layout-release-gate.mjs";
import {typographyCompression,trackingMm} from "../src/layoutTypography.ts";
import {bankDocumentMode} from "../src/bankDocumentPolicy.ts";

const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const part=(changes={})=>({
 id:"fixture-1",kind:"field",page:1,origin:"customer",label:"Account number",
 fieldKey:"accountNo",value:"PRIVATE_TEST_VALUE",defaultValue:"",
 x:15,y:105,width:65,height:12,z:1,rotation:0,
 font:"Arial",size:12,bold:true,italic:false,underline:false,
 align:"left",color:"#000000",background:"transparent",borderColor:"#000000",
 borderWidth:1,letterSpacing:0,fontCompression:100,opacity:1,
 quick:true,dotMatrix:true,preprinted:false,...changes
});
const sample=(bankName,elements=[part()])=>({
 version:1,bankName,mode:"passbook",widthMm:190,heightMm:173,
 foldMm:86.5,printStartMm:101,pageCount:1,elements
});

test("Step 8: ruler is self-contained, bank independent and never contains identifiable customer information",async()=>{
 for(const [w,h,fold,start] of [[190,173,86.5,101],[206,175,88,118],[270,100,50,65],[100,270,135,153]]){
  const blob=exportLayoutCalibrationProof({widthMm:w,heightMm:h,foldMm:fold,printStartMm:start});
  const loading=getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true});
  const pdf=await loading.promise;
  try{
   const page=await pdf.getPage(1),viewport=page.getViewport({scale:1});
   const actual=[viewport.width,viewport.height].sort((a,b)=>a-b);
   const expected=[w,h].sort((a,b)=>a-b).map(mm=>mm*72/25.4);
   assert.ok(Math.abs(actual[0]-expected[0])<.8);
   assert.ok(Math.abs(actual[1]-expected[1])<.8);
   const lines=(await page.getTextContent()).items.map(x=>x.str||"").join(" ");
   assert.ok(lines.includes("CALIBRATION"));
   assert.match(lines,/PAPER .* x .* mm \| FOLD .* \| START /);
   assert.doesNotMatch(lines,/PRIVATE_TEST_VALUE|Customer ID|BANK SETU TENANT|ACCOUNT 1234/);
  }finally{await loading.destroy();}
 }
});

test("Step 8: font tracking and compression never alter the physical paper geometry",()=>{
 for(let compression=50;compression<=100;compression+=5){
  assert.equal(typographyCompression(compression),compression/100);
  for(let gap=0;gap<=10;gap+=.5){
   assert.ok(Math.abs(trackingMm({letterSpacing:gap})-gap*25.4/96)<1e-9);
  }
 }
});

test("Step 9: each bank's generic print policy remains separate; Union prints values only",async()=>{
 for(const bank of ["Assam Gramin Bank","Punjab National Bank","Union Bank of India","Central Bank of India"]){
  const data=sample(bank,[
   part({id:"static-label",kind:"text",origin:"static",fieldKey:"",label:"ACCOUNT NO",z:0,
    dotMatrix:!/union bank/i.test(bank)}),
   part({id:"account-value",value:"",z:1}),
   part({id:"photo",kind:"photo",origin:"static",fieldKey:"",label:"PHOTO",dotMatrix:false,z:2}),
   part({id:"line",kind:"line",origin:"static",fieldKey:"",label:"RULE",dotMatrix:false,z:3}),
  ]);
  if(/union bank/i.test(bank)){
   const wronglyConfigured=sample(bank,[part({id:"static-value",kind:"text",
     origin:"static",fieldKey:"",label:"Preprinted Account No",dotMatrix:true})]);
   assert.throws(()=>sanitizeLayoutTemplate(wronglyConfigured,bank),
     /Union Bank passbooks print values only/);
  }
  const safe=sanitizeLayoutTemplate(data,bank);
  assert.ok(safe.elements.every(x=>x.value===""),bank+" must not enter shared catalog with customer data");
  assert.equal(safe.elements.length,4);
  assert.equal(templateCanRender({...safe,id:"test"},bank,"passbook"),true);
  assert.equal(isLayoutLayerPrintable(data.elements[0],"dotmatrix",bank),!/union bank/i.test(bank));
  for(const kind of ["photo","image","line","rectangle","ellipse"])
   assert.equal(isLayoutLayerPrintable(part({kind}),"dotmatrix",bank),false);
  const dynamic=data.elements.map(x=>({...x,value:x.id==="account-value"?"12345678":""}));
  const result=await exportLayoutProofPdf({...data,elements:dynamic},"dotmatrix");
  const loading=getDocument({data:new Uint8Array(await result.arrayBuffer()),useSystemFonts:true});
  const pdf=await loading.promise;
  try{
   const page=await pdf.getPage(1),items=(await page.getTextContent()).items;
   const txt=items.map(x=>x.str||"").join(" ");
   assert.match(txt,/12345678/);
   if(/union bank/i.test(bank))assert.doesNotMatch(txt,/ACCOUNT NO/);
   else assert.match(txt,/ACCOUNT NO/);
   assert.doesNotMatch(txt,/PRIVATE_TEST_VALUE|PHOTO|RULE/);
   assert.equal((await page.getOperatorList()).fnArray.includes(OPS.constructPath),false);
  }finally{await loading.destroy();}
 }
});

test("Step 9: bank data binds from current customer only; Master-approved template strips private defaults",()=>{
 const sampleBank="Central Bank of India";
 const bank={ifsc:"TEST0001",password:"DO_NOT_COPY"};
 const a={accountNo:"111111"},b={accountNo:"222222"};
 const layer=part({value:"",origin:"customer"});
 assert.equal(boundLayoutValue(layer,a,bank),"111111");
 assert.equal(boundLayoutValue(layer,b,bank),"222222");
 assert.equal(boundLayoutValue(part({origin:"bank",fieldKey:"password"}),a,bank),"");
 const sanitized=sanitizeLayoutTemplate(sample(sampleBank),sampleBank);
 assert.equal(sanitized.elements[0].value,"");
});

test("Step 9: approved template history stays per tenant/mode and keeps reversible versions",()=>{
 const A=layoutSelectionKey("tenant-a","passbook");
 const B=layoutSelectionKey("tenant-b","passbook");
 const O=layoutSelectionKey("tenant-a","accountOpening");
 assert.notEqual(A,B);assert.notEqual(A,O);
 const t1="01234567-89ab-cdef-0123-456789abcdef";
 const t2="fedcba98-7654-3210-fedc-ba9876543210";
 const one=normalizedActivationRecord({},t1,"reviewer","2026-11-04T00:00:00Z");
 const two=normalizedActivationRecord(one,t2,"reviewer","2026-11-04T01:00:00Z");
 assert.equal(previousApprovedVersion(two),t1);
 assert.equal(one.templateId,t1);
 assert.equal(two.revision,2);
});

test("Step 9: custom engine stays opt-in; approved Assam/Union flows are not replaced",()=>{
 const policy=file("src/bankDocumentPolicy.ts");
 const selected=file("src/SelectedBankDocument.tsx");
 const direct=file("src/WorkspaceTemplateDocument.tsx");
 const dashboard=file("src/Dashboard.tsx");
 assert.match(policy,/if \(isAssamBank\(key\) \|\| isUnionBank\(key\) \|\| isPnbBank\(key\) \|\| isCentralBank\(key\)\) return "builtin"/);
 assert.match(selected,/mode === "custom"/);
 assert.match(selected,/AccountOpeningPDF/);
 assert.match(selected,/UnionBank/);
 assert.match(direct,/windowsPr2\(\)/);
 assert.match(direct,/requirePhysicalConfirmation/);
 assert.match(dashboard,/CustomizeLayoutStudio/);
});

test("Step 10: Android APK is saved for TESTING only; no publish/release/deploy in draft workflow",()=>{
 const ci=file(".github/workflows/layout-studio-draft.yml");
 const android=ci.slice(ci.indexOf("  android-debug-smoke:"));
 assert.ok(android.startsWith("  android-debug-smoke:"));
 for(const required of ["assembleDebug","app-debug.apk","ocr/lang/eng.traineddata",
   "ocr/lang/hin.traineddata","upload-artifact@","retention-days: 7","if-no-files-found: error"])
   assert.ok(android.includes(required),required);
 assert.ok(ci.includes("ref: ${{ github.event.pull_request.head.sha || github.sha }}"),
  "CI must test the exact PR head and not mislabel an artificial merge commit");
 assert.ok(android.includes("name: banksetu-layout-draft-android-${{ github.event.pull_request.head.sha || github.sha }}"),
  "Downloaded Android artifact must be tied to the tested PR head SHA");
 assert.doesNotMatch(android,/firebase deploy|npm run release|One Click App Release|gh release create|merge_pull_request/);
 const gradle=file("android/app/build.gradle");
 assert.match(gradle,/applicationId "in\.banksetu\.android"/);
 assert.match(file("docs/LAYOUT_ANDROID_DRAFT_TESTING.md"),/Do not uninstall or overwrite/);
});

test("Step 10: incomplete physical approval still blocks release after a successful software test build",()=>{
 const original=file("docs/LAYOUT_ENGINE_ACCEPTANCE.md");
 const report=inspectLayoutAcceptance(original);
 assert.ok(report.total>=46);
 assert.ok(report.pending.length>0);
 assert.equal(layoutReleaseReady(original),false);
});

test("Step 9: PNB and Central Bank keep their verified built-in formats while other banks remain selectable",()=>{
 const dashboard=file("src/Dashboard.tsx");
 const start=dashboard.indexOf("const PASSBOOK_BANK_OPTIONS = ["),end=dashboard.indexOf("] as const;",start);
 assert.ok(start>=0&&end>start);
 const selection=dashboard.slice(start,end);
 for(const name of ["Assam Gramin Bank","Union Bank of India","Punjab National Bank",
   "Central Bank of India","State Bank of India (SBI)"]){
  assert.ok(selection.includes('"'+name+'"'),"Bank selection missing: "+name);
 }
 assert.equal(bankDocumentMode("Assam Gramin Bank"),"builtin");
 assert.equal(bankDocumentMode("Union Bank of India"),"builtin");
 assert.equal(bankDocumentMode("Punjab National Bank"),"builtin");
 assert.equal(bankDocumentMode("Central Bank of India"),"builtin");
});

test("Step 9: missing bank account-opening PDF must say upload, never inherit Assam Gramin/other bank",()=>{
 const print=file("src/BankFormatPrint.tsx");
 assert.match(print,/Please upload your Account Opening PDF sample\./);
 assert.match(print,/!templateMatchesBank\(selected, bankName\)/);
 assert.match(print,/if \(!selected\.fileId\) throw new Error\(missingSample\)/);
 const dashboard=file("src/Dashboard.tsx");
 assert.match(dashboard,/PASSBOOK_BANK_OPTIONS/);
});

test("Step 10: real pre-release safety checks remain blocked while post-release links are checked later",()=>{
 const markdown=file("docs/LAYOUT_ENGINE_ACCEPTANCE.md");
 const pending=inspectLayoutAcceptance(markdown);
 assert.equal(pending.pendingAfterRelease.length,1);
 assert.ok(pending.pendingBeforeRelease.length>=10,
  "physical devices, printer models and independent approvals cannot be inferred from software tests");
 assert.equal(layoutReleaseReady(markdown),false);
 assert.match(file("docs/LAYOUT_HARDWARE_QA_INSTRUCTIONS.md"),/post-release/);
});
