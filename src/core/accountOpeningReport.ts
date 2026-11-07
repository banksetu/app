/** Only the customer's actual account-opening date counts here.
 * Never substitute createdAt/updatedAt (software entry dates) or guessed dates. */
export type OpeningCustomer=Record<string,unknown>&{rowNumber?:number;recordId?:string};
const normalize=(key:string)=>key.toLowerCase().replace(/[^a-z0-9]/g,"");
export const field=(customer:OpeningCustomer,aliases:string[])=>{
  const entries=Object.entries(customer);
  for(const alias of aliases){
    const match=entries.find(([key])=>normalize(key)===normalize(alias));
    if(match&&match[1]!==null&&match[1]!==undefined&&String(match[1]).trim())return match[1];
  }
  return "";
};
export function openingDate(customer:OpeningCustomer){
  return field(customer,["accountOpeningDate","openingDate","accountOpenDate","dateOfAccountOpening","accountOpeningDt"]);
}
const isDate=(year:number,month:number,day:number)=>{
  if(year<1900||year>2200||month<1||month>12||day<1||day>31)return false;
  const d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
};
function isoDate(year:number,month:number,day:number){
  return isDate(year,month,day)?
    String(year).padStart(4,"0")+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0"):null;
}
/** Normalize India-style DD/MM/YYYY, DD-MM-YYYY, ISO YYYY-MM-DD or ISO timestamp
 * using the printed calendar date, not timezone arithmetic. */
export function normalizedOpeningDate(raw:unknown):string|null{
  if(raw instanceof Date&&!Number.isNaN(raw.getTime()))
    return isoDate(raw.getFullYear(),raw.getMonth()+1,raw.getDate());
  if(typeof raw!=="string")return null;
  const s=raw.trim();
  const iso=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s])/i.exec(s);
  if(iso)return isoDate(Number(iso[1]),Number(iso[2]),Number(iso[3]));
  const ind=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:$|[\s,])/i.exec(s);
  if(ind)return isoDate(Number(ind[3]),Number(ind[2]),Number(ind[1]));
  const named=/^(\d{1,2})[\s/-]+([A-Za-z]{3,9})[\s/-]+(\d{4})$/.exec(s);
  if(named){
    const months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const idx=months.indexOf(named[2].slice(0,3).toLowerCase());
    if(idx>=0)return isoDate(Number(named[3]),idx+1,Number(named[1]));
  }
  return null;
}
export const openingDateKey=(customer:OpeningCustomer)=>normalizedOpeningDate(openingDate(customer));
export const localTodayKey=(now=new Date())=>
  isoDate(now.getFullYear(),now.getMonth()+1,now.getDate())||"";
export const monthStart=(month:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month+"-01":null;
export const monthEnd=(month:string)=>{
  if(!monthStart(month))return null;
  const [year,part]=month.split("-").map(Number);
  return isoDate(year,part,new Date(Date.UTC(year,part,0)).getUTCDate());
};
export const localMonth=(now=new Date())=>localTodayKey(now).slice(0,7);
export function matchingOpeningCustomers(customers:OpeningCustomer[],start:string,end:string){
  if(!/^\d{4}-\d\d-\d\d$/.test(start)||!/^\d{4}-\d\d-\d\d$/.test(end)||
     !normalizedOpeningDate(start)||!normalizedOpeningDate(end)||end<start)return [];
  return customers.filter(customer=>{
    const date=openingDateKey(customer);
    return date!==null&&date>=start&&date<=end;
  }).sort((a,b)=>(openingDateKey(b)||"").localeCompare(openingDateKey(a)||""));
}
export function currentMonthOpeningCount(customers:OpeningCustomer[],now=new Date()){
  const month=localMonth(now),first=monthStart(month),last=monthEnd(month);
  return first&&last?matchingOpeningCustomers(customers,first,last).length:0;
}
export const openingCustomerName=(customer:OpeningCustomer)=>String(field(customer,["name","customerName","accountHolderName"])||"—").trim();
export const openingAccountNo=(customer:OpeningCustomer)=>String(field(customer,["accountNo","accountNumber","accountNo."])||"").trim();
export const openingStatus=(customer:OpeningCustomer)=>String(field(customer,["status","accountStatus"])||"Not specified").trim();
export function openingAmount(customer:OpeningCustomer):number|null{
  const original=field(customer,["openingAmount","initialDeposit","accountOpeningAmount","openAmount"]);
  if(typeof original==="number")return Number.isFinite(original)&&original>=0?original:null;
  const cleaned=String(original??"").trim().replace(/[₹,\s]/g,"");
  if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(cleaned))return null;
  const number=Number(cleaned);return Number.isFinite(number)?number:null;
}
