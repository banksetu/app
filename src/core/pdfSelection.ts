type PdfRecord = Record<string, unknown>;
type Page = { success?:boolean; message?:string; customers?:PdfRecord[]; hasNextPage?:boolean };
export function selectCustomerPdfRecords(records:PdfRecord[],mode:'all'|'date'|'account'|'search',from:string,to:string,search:string){
  return records.filter(record=>{
    if(mode==='all')return true;
    if(mode==='date'){
      const date=String(record.accountOpeningDate||'').trim();
      const day=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(date)?`${date.slice(6)}-${date.slice(3,5)}-${date.slice(0,2)}`:'';
      return !!day&&day>=from&&day<=to;
    }
    if(mode==='account'){
      const account=String(record.accountNo||'').trim();
      return !!account&&account>=from.trim()&&account<=(to.trim()||from.trim());
    }
    const term=search.trim().toLocaleLowerCase();
    return !!term&&[record.name,record.accountNo,record.enrolId].some(value=>String(value||'').toLocaleLowerCase().includes(term));
  });
}

/** Load the complete verified tenant selection in bounded pages. Never use a visible search row as the full database. */
export async function loadPdfCustomers(
  localRecords: PdfRecord[], incomplete: boolean, online: boolean,
  requestPage: ((page:number,pageSize:number)=>Promise<Page>) | undefined,
): Promise<{records:PdfRecord[];incomplete:boolean}> {
  if (localRecords.length && !incomplete) return {records:localRecords,incomplete:false};
  if (!online || !requestPage) return {records:localRecords,incomplete};
  // Keep locally queued edits when the cloud download is incomplete.
  const key=(item:PdfRecord)=>String(item.recordId || item.rowNumber || `${item.accountNo}:${item.enrolId}`);
  const all: PdfRecord[]=[...localRecords];
  const seen=new Set(localRecords.map(key));
  for (let page=1;page<=1000;page++) {
    const result=await requestPage(page,100);
    if (!result.success || !Array.isArray(result.customers)) throw new Error(result.message || "Could not load the selected tenant's customers.");
    for (const item of result.customers) {
      const id=key(item);
      if (!seen.has(id)) {seen.add(id);all.push(item);}
    }
    if (!result.hasNextPage) return {records:all,incomplete:false};
  }
  throw new Error("Customer export exceeds the safe page limit. No customer records were changed.");
}
