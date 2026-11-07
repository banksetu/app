import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {findRibbonCommands,supportedRibbonSearchCommands} from "../src/layoutRibbonCommandSearch.ts";
const source=readFileSync(new URL("../src/CustomizeLayoutStudio.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/CustomizeLayoutReferenceLock.css",import.meta.url),"utf8");

test("search indexes only existing ribbon functionality and resolves common client questions",()=>{
 for(const [query,id] of [
  ["passbook margin","page-setup"],["customer name","customer"],["account number","account"],
  ["blank","new"],["backup","backup"],["audit","audit"],["table","table"],
  ["grid","grid"],["unreadable OCR","ocr"],["revert","undo"]
 ]){
  const result=findRibbonCommands(query);
  assert.ok(result.some(cmd=>cmd.id===id),query+" should discover "+id);
 }
 assert.deepEqual(findRibbonCommands("nonexistent-secret-plugin"),[]);
 assert.ok(findRibbonCommands("").length<=8);
 assert.ok(findRibbonCommands("",100).length<=20);
});
test("each advertised search command has a real case handler in the editor",()=>{
 const ids=new Set(supportedRibbonSearchCommands.map(cmd=>cmd.id));
 assert.equal(ids.size,supportedRibbonSearchCommands.length);
 for(const cmd of supportedRibbonSearchCommands)
  assert.ok(source.includes('case "'+cmd.id+'":'),"no handler for "+cmd.id);
 assert.match(source,/runRibbonCommand\(first\.id\)/);
 assert.match(source,/onClick=\{\(\)=>runRibbonCommand\(cmd\.id\)\}/);
 assert.match(source,/ribbonSearchRef\.current\?\.focus\(\)/);
 assert.match(css,/\.ls-ribbon-tool-results/);
});
