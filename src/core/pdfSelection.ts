type PdfRecord = Record<string, unknown>;
type Page = { success?:boolean; message?:string; customers?:PdfRecord[]; hasNextPage?:boolean };

/** Load the complete verified tenant selection in bounded pages. Never use a visible search row as the full database. */
export async function loadPdfCustomers(
  localRecords: PdfRecord[], incomplete: boolean, online: boolean,
  requestPage: ((page:number,pageSize:number)=>Promise<Page>) | undefined,
): Promise<{records:PdfRecord[];incomplete:boolean}> {
  if (localRecords.length && !incomplete) return {records:localRecords,incomplete:false};
  if (!online || !requestPage) return {records:localRecords,incomplete};
  const all: PdfRecord[]=[];
  const seen=new Set<string>();
  for (let page=1;page<=1000;page++) {
    const result=await requestPage(page,100);
    if (!result.success || !Array.isArray(result.customers)) throw new Error(result.message || "Could not load the selected tenant's customers.");
    for (const item of result.customers) {
      const key=String(item.recordId || item.rowNumber || `${item.accountNo}:${item.enrolId}`);
      if (!seen.has(key)) {seen.add(key);all.push(item);}
    }
    if (!result.hasNextPage) return {records:all,incomplete:false};
  }
  throw new Error("Customer export exceeds the safe page limit. No customer records were changed.");
}
