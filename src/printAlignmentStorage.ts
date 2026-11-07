import { auth } from "./firebase";

export type PrintOffset = { x: number; y: number };
const ZERO:PrintOffset={x:0,y:0};
const bounded=(number:number)=>Number.isFinite(number)?Math.max(-30,Math.min(30,Math.round(number*2)/2)):0;
const clean=(offset:PrintOffset):PrintOffset=>({x:bounded(offset.x),y:bounded(offset.y)});
const bankId=(name:string)=>/union bank/i.test(name)?"union-bank":/assam gramin|^agvb$|^agb$/i.test(name)?"assam-gramin-bank":name.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-");

export function printAlignmentStorageKey(bank:string) {
  const tenant=sessionStorage.getItem("bankSetuTenantId"),role=sessionStorage.getItem("bankSetuAccountRole");
  const scope=tenant||(["master_owner","admin"].includes(role||"")&&auth.currentUser?.uid?`master:${auth.currentUser.uid}`:"");
  if(!scope)throw new Error("A verified workspace is required to save bank alignment.");
  return `banksetu:print-alignment:v1:${scope}:${bankId(bank)}`;
}

export function savedPrintOffset(bank:string):PrintOffset {
  try {
    const raw=localStorage.getItem(printAlignmentStorageKey(bank));
    if(!raw)return ZERO;
    const parsed=JSON.parse(raw) as PrintOffset;
    return clean({x:Number(parsed.x),y:Number(parsed.y)});
  } catch {return ZERO;}
}
