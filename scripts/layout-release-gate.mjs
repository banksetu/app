/** Safe read-only Gate for PR #98. Never merges, deploys or changes data.
 * Exits nonzero until every independently verified acceptance item is signed.
 */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const checklist=fileURLToPath(new URL("../docs/LAYOUT_ENGINE_ACCEPTANCE.md",import.meta.url));
// Critical bank, tenant, hardware and release obligations may not be removed
// or replaced by meaningless checked boxes. Software CI still cannot sign off
// on any real printer or device. The gate is read-only.
const requiredAcceptanceTopics=[
  /Existing approved Assam Gramin, PNB, Union Bank and Central Bank/i,
  /Customer, offline pending ops, deletion tombstones, licensing/i,
  /same bank and tenant/i,
  /Quick Passbook keeps graphics.*Direct PR2/i,
  /crop boundaries.*manually editable crop/i,
  /Hindi and English.*user review/i,
  /A4 account-opening form pages do not clip/i,
  /PLQ-20\/20M on physical stock/i,
  /PLQ-35 printer model/i,
  /PLQ-80/i,
  /Actual.*physical.*Windows PC|On a \*\*physical Windows PC\*\*/i,
  /On a \*\*physical Android device\*\*/i,
  /Independent Master and Client Admin sign-off/i,
  /Only then review merge and the existing One Click Release/i,
  /Verify Windows\/Android\/Web published version URLs/i,
];
export function inspectLayoutAcceptance(markdown){
 const lines=typeof markdown==="string"?markdown.split(/\r?\n/):[];
 const entries=lines.filter(line=>/^\s*-\s+\[[ xX]\]\s+\S/.test(line))
   .map(line=>{
     const found=line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
     return {complete:found[1].toLowerCase()==="x",text:found[2].trim()};
   });
 const invalid=lines.filter(line=>/^\s*-\s*\[/.test(line) &&
   !/^\s*-\s+\[[ xX]\]\s+\S/.test(line));
 const identifiers=entries.map(item=>item.text.toLowerCase().replace(/\s+/g," ").trim());
 const repeated=identifiers.filter((item,index)=>identifiers.indexOf(item)!==index);
 const missingTopics=requiredAcceptanceTopics.filter(pattern=>
   !entries.some(item=>pattern.test(item.text))).map(pattern=>String(pattern));
 // Published download URLs cannot be verified BEFORE the approved release.
 // This ONE post-release check remains visible, but is not a pre-merge gate.
 // All actual printer, Windows/Android physical, bank and tenant signoffs
 // stay mandatory before any release.
 const afterRelease=/^Verify Windows\/Android\/Web published version URLs and downloads only AFTER a confirmed approved release,/i;
 const pendingBeforeRelease=entries.filter(x=>!x.complete&&!afterRelease.test(x.text)).map(x=>x.text);
 const pendingAfterRelease=entries.filter(x=>!x.complete&&afterRelease.test(x.text)).map(x=>x.text);
 return {total:entries.length,completed:entries.filter(x=>x.complete).length,
   pending:entries.filter(x=>!x.complete).map(x=>x.text),
   pendingBeforeRelease,pendingAfterRelease,
   invalid,duplicated:[...new Set(repeated)],missingTopics};
}
export function layoutReleaseReady(markdown){
 const result=inspectLayoutAcceptance(markdown);
 return result.total>=46&&result.pendingBeforeRelease.length===0&&
   result.invalid.length===0&&result.duplicated.length===0&&
   result.missingTopics.length===0;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const data=readFileSync(checklist,"utf8"),result=inspectLayoutAcceptance(data);
 if(!layoutReleaseReady(data)){
   process.stderr.write("LAYOUT DRAFT ONLY — BLOCKED. "+result.pendingBeforeRelease.length+
     "/"+result.total+" pre-release checks remain unsigned; "+result.missingTopics.length+
     " mandatory topics absent; "+result.invalid.length+" malformed; "+result.duplicated.length+" duplicate entries.\n");
   for(const item of result.pending)process.stderr.write(" - "+item+"\n");
   process.exitCode=1;
 }else{
   process.stdout.write("Pre-release checklist structurally complete. Independent evidence and authorized GitHub review remain required; post-release URL verification is separate. This gate never merges or deploys.\n");
 }
}
