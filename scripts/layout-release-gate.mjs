/** Safe read-only Gate for PR #98. Never merges, deploys or changes data.
 * Exits nonzero until every independently verified acceptance item is signed.
 */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const checklist=fileURLToPath(new URL("../docs/LAYOUT_ENGINE_ACCEPTANCE.md",import.meta.url));
export function inspectLayoutAcceptance(markdown){
 const entries=[...markdown.matchAll(/^\s*- \[([ xX])\] (.+)$/gm)]
   .map(match=>({complete:match[1].toLowerCase()==="x",text:match[2].trim()}));
 return {total:entries.length,completed:entries.filter(x=>x.complete).length,
   pending:entries.filter(x=>!x.complete).map(x=>x.text)};
}
export function layoutReleaseReady(markdown){
 const result=inspectLayoutAcceptance(markdown);
 return result.total>=25&&result.pending.length===0;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const data=readFileSync(checklist,"utf8"),result=inspectLayoutAcceptance(data);
 if(!layoutReleaseReady(data)){
   process.stderr.write("LAYOUT DRAFT ONLY — BLOCKED. "+result.pending.length+
     "/"+result.total+" acceptance checks remain unsigned.\n");
   for(const item of result.pending)process.stderr.write(" - "+item+"\n");
   process.exitCode=1;
 }else{
   process.stdout.write("Acceptance checklist complete. Release still requires authorized GitHub review and normal One Click Release; this check performs neither.\n");
 }
}
