import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getDocument,OPS} from "pdfjs-dist/legacy/build/pdf.mjs";
import {templateCanRender,boundLayoutValue} from "../src/layoutRuntimeValues.ts";
import {preflightLayoutOutput} from "../src/layoutOutputPreflight.ts";
import {isLayoutLayerPrintable} from "../src/layoutOutputPolicy.ts";
import {exportLayoutProofPdf} from "../src/layoutProofPdf.ts";

const layer=(overrides={})=>({
  id:"account-1",kind:"field",page:1,origin:"customer",label:"Account number",
  fieldKey:"accountNo",value:"",defaultValue:"",x:15,y:100,width:60,height:10,z:1,
  rotation:0,font:"Arial",size:11,bold:false,italic:false,underline:false,
  align:"left",color:"#000000",background:"transparent",borderColor:"#000000",
  borderWidth:1,letterSpacing:0,opacity:1,quick:true,dotMatrix:true,preprinted:false,
  ...overrides
});
const template=(elements=[layer()])=>({
  id:"approved-test",bankName:"Central Bank of India",mode:"passbook",
  widthMm:190,heightMm:173,foldMm:86.5,printStartMm:102,pageCount:1,elements
});

test("Step 6: activated template accepts intact old formats and rejects malformed or duplicate layers",()=>{
  const valid=template();
  assert.equal(templateCanRender(valid,valid.bankName,"passbook"),true);
  assert.equal(templateCanRender(valid,"Union Bank of India","passbook"),false);
  for(const invalid of [
    template([layer(),layer()]),template([layer({id:""})]),
    template([layer({kind:"unknown"})]),template([layer({origin:"crossTenant"})]),
    template([layer({size:Infinity})]),template([layer({x:-1})]),
    template([layer({width:0})]),template([layer({rotation:361})]),
    template([layer({page:2})]),template([layer({quick:"true"})]),
    template([layer({opacity:2})]),template([layer({fontCompression:42})]),
    template([null]),{...valid,elements:"not-an-array"}
  ])assert.equal(templateCanRender(invalid,"Central Bank of India","passbook"),false,
    "corrupt Worker data must never reach a printer");
});

test("Step 5: print preflight blocks exactly one extra line instead of issuing a skippable warning",()=>{
  const clipped=layer({width:30,height:4,size:12});
  const output=preflightLayoutOutput([clipped],template(),"dotmatrix",
    "Central Bank of India",()=>"12345678901234567890123");
  assert.ok(output.errors.some(x=>/clipped/.test(x)),JSON.stringify(output));
  assert.ok(preflightLayoutOutput([layer()],template(),"dotmatrix",
    "Central Bank of India",()=>"1234567890").errors.length===0);
});

test("Step 5: Union Bank live, draft and PDF rules are values-only even for wrongly flagged static text",async()=>{
  const bank="Union Bank of India";
  const staticLabel=layer({id:"label-1",kind:"text",origin:"static",label:"BANK LABEL",fieldKey:"",z:0});
  const value=layer({value:"CUSTOMER_123456"});
  const rectangle=layer({id:"rectangle",kind:"rectangle",origin:"static",label:"Border",x:2,y:5,width:100,height:130,z:2});
  assert.equal(isLayoutLayerPrintable(staticLabel,"dotmatrix",bank),false);
  assert.equal(isLayoutLayerPrintable(value,"dotmatrix",bank),true);
  assert.equal(isLayoutLayerPrintable(rectangle,"dotmatrix",bank),false);
  assert.equal(isLayoutLayerPrintable(staticLabel,"quick",bank),true);
  const blob=await exportLayoutProofPdf({bankName:bank,widthMm:190,heightMm:173,
    pageCount:1,elements:[staticLabel,value,rectangle]},"dotmatrix");
  const task=getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true});
  const pdf=await task.promise;
  try {
    const page=await pdf.getPage(1);
    const text=(await page.getTextContent()).items.filter(x=>"str" in x).map(x=>x.str).join(" ");
    assert.match(text,/CUSTOMER_123456/);
    assert.doesNotMatch(text,/BANK LABEL|Border/);
    assert.equal((await page.getOperatorList()).fnArray.includes(OPS.constructPath),false);
  }finally{await task.destroy();}
});

test("Step 6: tenant-private keys do not bind to customer or bank secrets",()=>{
  const customer={accountNo:"1234",secretToken:"CREDENTIAL"};
  const bank={ifsc:"TEST001",secretToken:"PRIVATE",tenantId:"other-client"};
  assert.equal(boundLayoutValue(layer(),customer,bank),"1234");
  assert.equal(boundLayoutValue(layer({origin:"bank",fieldKey:"secretToken"}),customer,bank),"");
  assert.equal(boundLayoutValue(layer({origin:"dotmatrix",fieldKey:"tenantId"}),customer,bank),"");
});

test("Step 5: editor, live preview and PDF share the same bank-aware print policy",()=>{
  const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
  const browser=readFileSync(new URL("../src/WorkspaceTemplateDocument.tsx",import.meta.url),"utf8");
  assert.match(editor,/isLayoutLayerPrintable\(part,preview,bankName\)/);
  assert.match(browser,/isLayoutLayerPrintable\(item,"dotmatrix",bankName\)/);
  assert.match(browser,/preflightLayoutOutput\(/);
  assert.match(browser,/requirePhysicalConfirmation/);
});

test("Step 6: changing workspaces rejects stale customer search and editor writes",()=>{
  const customer=readFileSync(new URL("../src/CustomBankDocument.tsx",import.meta.url),"utf8");
  const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
  assert.match(customer,/const epoch=\+\+searchEpoch.current/);
  assert.match(customer,/if\(epoch!==searchEpoch.current\)return/);
  assert.match(customer,/banksetu-workspace-change/);
  assert.match(editor,/resetForNewWorkspace/);
  assert.match(editor,/editorScopeRef.current!==storageKey/);
  assert.match(editor,/storageKey!==draftKey\(mode,bankName\)/);
});

test("Step 5: async print preparation is guarded against stale documents and duplicates",()=>{
  const browser=readFileSync(new URL("../src/WorkspaceTemplateDocument.tsx",import.meta.url),"utf8");
  assert.match(browser,/printGate.current/);
  assert.match(browser,/if\(!live.current\)return/);
  assert.match(browser,/disabled=\{printing\|\|directPreparing\|\|directPrinting\}/);
});

test("Step 7: Word-style drag, resize and keyboard positioning respect measured paper bounds",()=>{
  const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
  assert.match(editor,/current.widthMm-part.width/);
  assert.match(editor,/current.heightMm-part.height/);
  assert.match(editor,/current.widthMm-part.x/);
  assert.match(editor,/draft.widthMm-selected.width/);
  assert.match(editor,/draft.heightMm-selected.height/);
});
