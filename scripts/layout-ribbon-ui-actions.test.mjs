import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/CustomizeLayoutReferenceLock.css",import.meta.url),"utf8");

test("free Word-style ribbon advertises actual object operations, not Microsoft licensed services",()=>{
  for(const tool of ["Copy","Cut","Paste","Delete","Title Case","Sentence case","Insert Custom Table","Header","Footer","Page Number","Page Border (Quick)","Watermark (Quick)","Rotate Left 90°","Bring to Front","Send to Back","MICR","GSTIN"]){
    assert.ok(editor.includes(">"+tool+"<"),"missing visible tool: "+tool);
  }
  for(const handler of ["copyWordSelection","cutWordSelection","pasteWordSelection","changeTextCase","insertEditableTable","insertDocumentDecoration","onDoubleClick","finishInlineTextEdit"]){
    assert.ok(editor.includes(handler),"missing working handler: "+handler);
  }
  assert.match(editor,/className="ls-inline-word-edit"/);
  assert.match(css,/\.ls-inline-word-edit/);
});
test("private object clipboard cannot leak across customer preview, Microsoft APIs or external services",()=>{
  const ops=readFileSync(new URL("../src/layoutRibbonEditing.ts",import.meta.url),"utf8");
  assert.match(ops,/p\.origin==="bank"\|\|p\.origin==="customer"/);
  assert.doesNotMatch(ops,/navigator\.clipboard|Office\.context|fetch\(/);
  assert.match(editor,/\{widthMm:draft\.widthMm,heightMm:draft\.heightMm,page:selectedPage\}/);
});
test("new decorative graphics respect Quick-only and PR2 separation",()=>{
  assert.match(editor,/if\(\(kind==="watermark"\|\|kind==="border"\)&&setup\.output==="dotmatrix"\)/);
  assert.match(editor,/part\.dotMatrix=false/);
  assert.match(editor,/fieldKey==="pageBackground"/);
  assert.doesNotMatch(editor,/__pageBackground__/);
  assert.match(editor,/if\(setup\.output==="dotmatrix"\)/);
  assert.match(editor,/part\.quick=true/);
  assert.match(editor,/setPhysicalChecked\(false\);setLabelChecked\(false\);setHardwareChecked\(false\)/);
});
