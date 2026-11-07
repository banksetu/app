/** BANK SETU ribbon command finder.
 * Distilled from Word / LibreOffice / ONLYOFFICE / Google Docs tool discovery.
 * Entries MUST have concrete handlers in CustomizeLayoutStudio; do not add
 * unsupported Word commands to the quick-action palette.
 * No Microsoft/Google document service or remote account required.
 */
export const supportedRibbonSearchCommands = [
 {id:"new",label:"New Blank Layout",tab:"file",keywords:"new blank document create"},
 {id:"save",label:"Save Draft",tab:"file",keywords:"save document keep changes"},
 {id:"backup",label:"Download Editable Backup",tab:"file",keywords:"backup export download json"},
 {id:"proof",label:"Export Proof PDF",tab:"file",keywords:"print preview pdf"},
 {id:"undo",label:"Undo",tab:"home",keywords:"reverse revert editing"},
 {id:"redo",label:"Redo",tab:"home",keywords:"repeat editing"},
 {id:"copy",label:"Copy Selected Objects",tab:"home",keywords:"clipboard copy"},
 {id:"paste",label:"Paste Objects",tab:"home",keywords:"clipboard paste"},
 {id:"find",label:"Find and Replace Text",tab:"review",keywords:"search words spelling"},
 {id:"text",label:"Insert Text Box",tab:"insert",keywords:"write label word text"},
 {id:"table",label:"Insert Editable Table",tab:"insert",keywords:"rows columns grid"},
 {id:"customer",label:"Insert Customer Name Field",tab:"mailings",keywords:"customer field account holder mapping"},
 {id:"account",label:"Insert Account Number Field",tab:"mailings",keywords:"account number customer mapping"},
 {id:"bank",label:"Insert Bank Name Field",tab:"mailings",keywords:"bank information mapping"},
 {id:"header",label:"Insert Header",tab:"insert",keywords:"top of page"},
 {id:"footer",label:"Insert Footer",tab:"insert",keywords:"bottom of page"},
 {id:"page-number",label:"Insert Page Number",tab:"insert",keywords:"number page"},
 {id:"line",label:"Draw Line",tab:"draw",keywords:"pen line ruler"},
 {id:"rectangle",label:"Draw Rectangle",tab:"draw",keywords:"shape box square"},
 {id:"page-setup",label:"Page Size, Fold and Margins",tab:"layout",keywords:"page setup landscape portrait paper passbook margin mm"},
 {id:"group",label:"Group Selected Objects",tab:"layout",keywords:"organize combine shapes"},
 {id:"lock",label:"Lock Selected Objects",tab:"layout",keywords:"protect prevent moving"},
 {id:"unlock",label:"Unlock Selected Objects",tab:"layout",keywords:"unprotect edit"},
 {id:"ruler",label:"Toggle Ruler",tab:"view",keywords:"rulers measurement"},
 {id:"grid",label:"Toggle Grid",tab:"view",keywords:"snap grid guidelines"},
 {id:"zoom",label:"Zoom to 100%",tab:"view",keywords:"magnify original size"},
 {id:"audit",label:"Run Layout Audit",tab:"review",keywords:"check validate errors"},
 {id:"ocr",label:"Next Unreadable OCR Line",tab:"review",keywords:"ocr correction scan review"},
 {id:"shared",label:"Shared Bank Templates",tab:"file",keywords:"approved gallery bank layout"},
] as const;
export type SupportedRibbonAction = (typeof supportedRibbonSearchCommands)[number]["id"];
export type SupportedRibbonTab = (typeof supportedRibbonSearchCommands)[number]["tab"];
export function findRibbonCommands(input:string,limit=8){
 const query=input.trim().toLocaleLowerCase();
 const words=query.split(/\s+/u).filter(Boolean);
 const result=supportedRibbonSearchCommands
   .map((cmd,index)=>{
     const all=(cmd.label+" "+cmd.keywords+" "+cmd.tab).toLocaleLowerCase();
     const match=words.every(w=>all.includes(w));
     const score=!query?0:cmd.label.toLocaleLowerCase().startsWith(query)?3:
       cmd.label.toLocaleLowerCase().includes(query)?2:1;
     return {cmd,index,match,score};
   })
   .filter(x=>x.match)
   .sort((a,b)=>b.score-a.score||a.index-b.index)
   .slice(0,Math.max(1,Math.min(20,limit)))
   .map(x=>x.cmd);
 return result;
}
