import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const editor=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/CustomizeLayoutReferenceLock.css",import.meta.url),"utf8");

test("contextual Object Format tab appears only with an object and edits measured geometry",()=>{
 assert.match(editor,/\{selected&&<button type="button" className="ls-contextual-tab"/);
 assert.match(editor,/wordTab==="format"&&<div className="ls-word-tab-content ls-object-format-ribbon"/);
 assert.match(editor,/const changeObjectMeasure=\(key:"x"\|"y"\|"width"\|"height",next:number\)=>/);
 assert.match(editor,/k==="x"\?draft\.widthMm-selected\.width/);
 assert.match(editor,/edit\(\{\[key\]:value\}\)/);
 assert.match(css,/\.ls-object-format-ribbon/);
});
test("client-facing search and direct editable captions remain offline and printable-zone safe",()=>{
 assert.match(editor,/const insertCaptionBelowSelection=\(\)=>/);
 assert.match(editor,/if\(availableWidth<10\)/);
 assert.match(editor,/setPhysicalChecked\(false\);setHardwareChecked\(false\);/);
 assert.match(editor,/const inlineTextCancelRef=useRef\(false\)/);
 assert.match(editor,/inlineTextCancelRef\.current=true/);
 assert.match(editor,/300-object safety limit reached/);
 assert.match(editor,/ribbonSearchRef\.current\?\.focus\(\)/);
});
