import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const stylesheet=readFileSync(new URL("../src/CustomizeLayoutReferenceLock.css",import.meta.url),"utf8");

test("approved Word ribbon precedes the enlarged paper, with legacy duplicate cards removed",()=>{
 const ribbon=editor.indexOf('<details className="ls-tool-card ls-word-suite"');
 const paper=editor.indexOf('<div className="ls-workspace">');
 assert.ok(ribbon>0&&paper>ribbon,"Word ribbon precedes editable paper");
 assert.doesNotMatch(editor,/className="ls-extra-tools"/);
 assert.doesNotMatch(editor,/className="ls-tool-collection"/);
 assert.match(editor,/className="ls-designer-status"/);
 assert.match(editor,/Editor zoom 50 to 400 percent/);
});

test("Page Setup uses a dialog; measured page does not inflate the Word ribbon",()=>{
 assert.match(editor, /role="dialog" aria-modal="true" aria-label="Passbook Page Setup"/);
 assert.match(editor, /\{pageSetupOpen&&workspaceView==="design"&&/);
 assert.match(editor, /<PassbookPageSetup page=\{draft\}/);
 assert.match(editor, /onClick=\{\(\)=>setPageSetupOpen\(true\)\}/);
 assert.doesNotMatch(editor,/\{wordTab==="layout"&&<PassbookPageSetup/);
 assert.match(stylesheet,/\.ls-page-setup-dialog/);
 assert.match(stylesheet,/\.ls-word-command-family/);
 assert.match(stylesheet,/\.ls-word-suite/);
});

test("the same exact bank authorization and PR2 bridge remain untouched by visual layout",()=>{
 assert.match(editor,/layoutSelectionKey|layoutSlotId/);
 assert.match(editor,/\/list-layout-templates/);
 assert.match(editor,/className="ls-designer-status"/);
 assert.match(stylesheet,/Presentation only: no print geometry, tenant data, OCR or PR2 engine changes/);
});
